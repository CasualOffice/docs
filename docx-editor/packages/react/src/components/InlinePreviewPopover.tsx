/**
 * InlinePreviewPopover — anchored preview affordance for AI proposals.
 *
 * Pattern lifted from the AI-editor research
 * (`docs/internal/11-ai-editor-research.md` §3 — Notion popover + §1
 * Google Docs Help me write preview card). Every shipping AI editor
 * stages model output in an explicit preview the user must accept;
 * none commit straight to the doc body. This component is that
 * preview for our chat-driven proposals.
 *
 * Geometry:
 *  - Position is computed from the proposal's anchor point in the PM
 *    document (cursor head when no selection; selection end otherwise),
 *    mapped to viewport coords via `view.coordsAtPos`.
 *  - Float docked below the anchor; clamps to the viewport so the card
 *    never escapes the right edge on a narrow window.
 *  - Width is fixed at 440 px so the in-preview table renders close to
 *    its actual landing width without horizontal scroll.
 *
 * Commit controls match the Notion shape, which our research flagged
 * as the closest model to our scale:
 *   Replace · Insert below · Try again · Discard
 *
 * Replace is hidden when the proposal has no replace range (fresh
 * inserts like `insertTable`); the popover falls back to Insert below
 * as the primary commit action in that case.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react';
import type { EditorView } from 'prosemirror-view';
import type { PipelineProposal } from '../lib/writer/pipeline';
import { MaterialSymbol } from './ui/Icons';

export interface InlinePreviewPopoverProps {
  proposal: PipelineProposal;
  /** Returns the editor view used to map PM positions to viewport
   *  coordinates and to dispatch the commit transaction. */
  getView: () => EditorView | null;
  /** Called when the user clicks Replace. */
  onReplace: () => void;
  /** Called when the user clicks Insert below. */
  onInsertBelow: () => void;
  /**
   * Called when the user submits a refine instruction in the Try-again
   * input. Receives the new free-form prompt (e.g. "make it
   * chronological", "more concise"). The host re-runs the pipeline
   * with the original message + this addendum and updates `proposal`
   * with the new result. While this call is in flight, pass `busy:
   * true` so the popover disables its buttons.
   */
  onTryAgain: (refinePrompt: string) => void;
  /** Called when the user clicks Discard or presses Escape. */
  onDiscard: () => void;
  /** True while a commit / regenerate request is in flight; disables
   *  buttons + shows a subtle spinner. */
  busy?: boolean;
}

const POPOVER_WIDTH = 440;
const POPOVER_MAX_HEIGHT = 360;
const ANCHOR_OFFSET_Y = 8;
const VIEWPORT_PAD = 12;

const rootStyle: CSSProperties = {
  position: 'fixed',
  width: POPOVER_WIDTH,
  background: 'var(--doc-surface, #ffffff)',
  color: 'var(--doc-text-on-surface, #1f2937)',
  border: '1px solid var(--doc-border, #d1d5db)',
  borderRadius: 10,
  boxShadow: '0 12px 28px -8px rgba(15,23,42,0.22), 0 4px 10px -2px rgba(15,23,42,0.08)',
  zIndex: 9500,
  display: 'flex',
  flexDirection: 'column',
  animation: 'docx-slide-in 160ms cubic-bezier(0.2, 0.8, 0.2, 1)',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 14px',
  borderBottom: '1px solid var(--doc-border, #e0e0e0)',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--doc-text-on-surface, #1f2937)',
};

const headerIconStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  color: 'var(--doc-primary, #1a73e8)',
};

const headerSummaryStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const previewStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  maxHeight: POPOVER_MAX_HEIGHT,
  overflow: 'auto',
  padding: '12px 14px',
  fontSize: 13,
  lineHeight: 1.5,
  background: 'var(--doc-surface-sunken, #fafbfc)',
};

const footerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 12px',
  borderTop: '1px solid var(--doc-border, #e0e0e0)',
  background: 'var(--doc-surface, #ffffff)',
};

const secondaryBtnStyle: CSSProperties = {
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 500,
  borderRadius: 6,
  border: '1px solid var(--doc-border, #d1d5db)',
  background: 'transparent',
  color: 'var(--doc-text-on-surface, #1f2937)',
  cursor: 'pointer',
};

const primaryBtnStyle: CSSProperties = {
  ...secondaryBtnStyle,
  borderColor: 'var(--doc-primary, #1a73e8)',
  background: 'var(--doc-primary, #1a73e8)',
  color: 'white',
  marginLeft: 'auto',
};

const subtleBtnStyle: CSSProperties = {
  ...secondaryBtnStyle,
  border: 0,
  color: 'var(--doc-text-on-surface-muted, #5f6368)',
};

const titleIconFor = (intent: string): string => {
  switch (intent) {
    case 'insertTable':
      return 'table_chart';
    case 'outline':
      return 'format_list_bulleted';
    case 'rewrite':
      return 'edit';
    case 'translate':
      return 'translate';
    default:
      return 'auto_awesome';
  }
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function fragmentToText(fragment: PipelineProposal['fragment']): string {
  const parts: string[] = [];
  fragment.descendants((node) => {
    if (node.isText && node.text) parts.push(node.text);
    if (node.type.name === 'paragraph') parts.push('\n');
  });
  return parts.join('').replace(/\n+/g, '\n').trim();
}

function TablePreview({ fragment }: { fragment: PipelineProposal['fragment'] }) {
  // Walk the proposal fragment for the first `table` node and render
  // it as a stripped-down HTML table. Mirrors the layout-painter's
  // visual style at preview density so the user sees something close
  // to what will land.
  type Cell = { text: string; isHeader: boolean };
  const rows: Cell[][] = [];
  let title = '';
  fragment.descendants((node) => {
    if (node.type.name === 'table' && rows.length === 0) {
      node.descendants((rowNode) => {
        if (rowNode.type.name === 'tableRow') {
          const cells: Cell[] = [];
          const isHeader = !!rowNode.attrs?.isHeader;
          rowNode.descendants((cellNode) => {
            if (cellNode.type.name === 'tableCell' || cellNode.type.name === 'tableHeader') {
              const text: string[] = [];
              cellNode.descendants((leaf) => {
                if (leaf.isText && leaf.text) text.push(leaf.text);
              });
              cells.push({
                text: text.join(' ').trim() || ' ',
                isHeader: isHeader || cellNode.type.name === 'tableHeader',
              });
              return false;
            }
            return true;
          });
          if (cells.length > 0) rows.push(cells);
          return false;
        }
        return true;
      });
      return false;
    }
    return true;
  });
  if (rows.length === 0) {
    return <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{fragmentToText(fragment)}</pre>;
  }
  return (
    <div>
      {title && <div style={{ fontWeight: 600, marginBottom: 8 }}>{title}</div>}
      <table
        style={{
          borderCollapse: 'collapse',
          width: '100%',
          tableLayout: 'fixed',
          fontSize: 12,
        }}
      >
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((c, ci) => {
                const Tag = c.isHeader ? 'th' : 'td';
                return (
                  <Tag
                    key={ci}
                    style={{
                      border: '1px solid var(--doc-border, #d1d5db)',
                      padding: '4px 6px',
                      textAlign: 'left',
                      background: c.isHeader ? 'var(--doc-surface-sunken, #f1f5f9)' : 'transparent',
                      fontWeight: c.isHeader ? 600 : 400,
                      verticalAlign: 'top',
                      wordBreak: 'break-word',
                    }}
                  >
                    {c.text}
                  </Tag>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderPreview(proposal: PipelineProposal): ReactElement {
  switch (proposal.what) {
    case 'table':
      return <TablePreview fragment={proposal.fragment} />;
    default:
      return (
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
          {fragmentToText(proposal.fragment)}
        </pre>
      );
  }
}

export function InlinePreviewPopover({
  proposal,
  getView,
  onReplace,
  onInsertBelow,
  onTryAgain,
  onDiscard,
  busy = false,
}: InlinePreviewPopoverProps) {
  // Anchor — recomputed on mount + window resize + scroll so the card
  // tracks its origin even if the user scrolls the doc.
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const view = getView();
    if (!view) return;
    const pos = proposal.replaceRange
      ? proposal.replaceRange.to
      : view.state.selection.head;
    const place = () => {
      const v = getView();
      if (!v) return;
      let rect: { top: number; bottom: number; left: number };
      try {
        rect = v.coordsAtPos(pos);
      } catch {
        return;
      }
      const desiredTop = rect.bottom + ANCHOR_OFFSET_Y;
      const desiredLeft = rect.left;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const clampedLeft = clamp(desiredLeft, VIEWPORT_PAD, vw - POPOVER_WIDTH - VIEWPORT_PAD);
      const clampedTop = clamp(desiredTop, VIEWPORT_PAD, vh - POPOVER_MAX_HEIGHT - VIEWPORT_PAD);
      setAnchor({ top: clampedTop, left: clampedLeft });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [getView, proposal]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDiscard();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onDiscard]);

  const preview = useMemo(() => renderPreview(proposal), [proposal]);

  // Refine state — when the user clicks Try again, an input replaces
  // the footer button row so they can type a follow-up ("make it
  // chronological", "more concise"). Submit calls onTryAgain(prompt);
  // the host re-runs the pipeline and updates `proposal`.
  const [refineOpen, setRefineOpen] = useState(false);
  const [refineText, setRefineText] = useState('');
  const refineRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (refineOpen) {
      const id = setTimeout(() => refineRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [refineOpen]);
  // Collapse the refine input whenever the proposal itself changes —
  // a fresh draft means the previous refine completed.
  useEffect(() => {
    setRefineOpen(false);
    setRefineText('');
  }, [proposal]);

  if (!anchor) return null;

  const canReplace = !!proposal.replaceRange;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={`AI proposal — ${proposal.summary}`}
      data-testid="inline-preview-popover"
      style={{ ...rootStyle, top: anchor.top, left: anchor.left }}
    >
      <div style={headerStyle}>
        <span style={headerIconStyle} aria-hidden="true">
          <MaterialSymbol name={titleIconFor(proposal.intent)} size={16} />
        </span>
        <span style={headerSummaryStyle} title={proposal.summary}>
          {proposal.summary}
        </span>
        <button
          type="button"
          style={subtleBtnStyle}
          onClick={onDiscard}
          aria-label="Discard"
          data-testid="preview-discard"
          disabled={busy}
        >
          Discard
        </button>
      </div>
      <div style={previewStyle}>{preview}</div>
      {refineOpen ? (
        <div style={footerStyle}>
          <input
            ref={refineRef}
            type="text"
            placeholder="Refine — e.g. make it chronological, more concise"
            value={refineText}
            onChange={(e) => setRefineText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                setRefineOpen(false);
                setRefineText('');
                return;
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const v = refineText.trim();
                if (!v || busy) return;
                onTryAgain(v);
              }
            }}
            disabled={busy}
            data-testid="preview-refine-input"
            style={{
              flex: 1,
              minWidth: 0,
              padding: '7px 10px',
              border: '1px solid var(--doc-border, #d1d5db)',
              borderRadius: 6,
              fontSize: 12,
              outline: 'none',
            }}
          />
          <button
            type="button"
            style={primaryBtnStyle}
            onClick={() => {
              const v = refineText.trim();
              if (!v || busy) return;
              onTryAgain(v);
            }}
            disabled={busy || !refineText.trim()}
            data-testid="preview-refine-send"
          >
            Send
          </button>
          <button
            type="button"
            style={subtleBtnStyle}
            onClick={() => {
              setRefineOpen(false);
              setRefineText('');
            }}
            aria-label="Cancel refine"
            disabled={busy}
          >
            ✕
          </button>
        </div>
      ) : (
      <div style={footerStyle}>
        <button
          type="button"
          style={secondaryBtnStyle}
          onClick={() => setRefineOpen(true)}
          disabled={busy}
          data-testid="preview-try-again"
        >
          Try again
        </button>
        {canReplace && (
          <button
            type="button"
            style={secondaryBtnStyle}
            onClick={onInsertBelow}
            disabled={busy}
            data-testid="preview-insert-below"
          >
            Insert below
          </button>
        )}
        <button
          type="button"
          style={primaryBtnStyle}
          onClick={canReplace ? onReplace : onInsertBelow}
          disabled={busy}
          data-testid="preview-replace"
        >
          {canReplace ? 'Replace' : 'Insert at cursor'}
        </button>
      </div>
      )}
    </div>
  );
}

export default InlinePreviewPopover;
