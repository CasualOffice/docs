/**
 * SelectionAskAi — selection-anchored AI prompt surface.
 *
 * Pattern from the AI editor research (`docs/internal/11-ai-editor-research.md`):
 * the canonical user flow across Google Docs, Word Rewrite, and Notion
 * is "select text → invoke AI on that selection → preview output".
 * Until this component the only AI entry from a selection was the
 * right-click menu (Rewrite / Summarize); the user couldn't write a
 * free-form transform prompt ("convert these bullets to a table",
 * "rewrite as a cover letter", "format this").
 *
 * Two visible states, both anchored above the selection's start:
 *
 *   1. Resting button — a compact sparkle pill labelled "Ask AI".
 *      Click to expand.
 *   2. Expanded input — a docked text field with Send / Esc-to-cancel.
 *      The selection is included automatically; the user types the
 *      transformation instruction.
 *
 * Submit hands the prompt to `onSubmit(prompt)`; the host runs the
 * writer pipeline with the selection as context and routes the
 * resulting proposal to the inline preview popover. This component
 * never touches the PM doc itself.
 *
 * Visibility: only renders while there is a non-empty plain-text
 * selection in the active editor view AND the controller's LLM tier
 * is ready. The host decides when both conditions hold and toggles
 * `isOpen`.
 */

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { EditorView } from 'prosemirror-view';
import { usableRightEdge } from '../lib/anchorViewport';
import { MaterialSymbol } from './ui/Icons';

export interface SelectionAskAiProps {
  /** Whether the editor has a non-empty plain-text selection AND the
   *  LLM is ready. Host owns this gate so the floater doesn't appear
   *  when the user is selecting inside a table cell or image. */
  isOpen: boolean;
  /** Active editor view — used to map PM positions to viewport coords
   *  via `coordsAtPos`. */
  getView: () => EditorView | null;
  /**
   * Called when the user submits a transform prompt.
   *
   * `capturedSelectionText` is the selection snapshot taken when the
   * pill opened. Pass-through to the pipeline so the prompt has the
   * intended context even when the editor's live PM selection has
   * since collapsed (focus shifts to the input textarea).
   */
  onSubmit: (prompt: string, capturedSelectionText: string) => void;
  /** Called when the user dismisses the surface (Esc / outside click). */
  onDismiss: () => void;
  /** Disables the input + Send while a previous request is in flight. */
  busy?: boolean;
}

// Vertical gap above OR below the selection. The pill prefers
// above-selection; falls through to below when above would overlap
// the toolbar / above the viewport.
const PILL_GAP_PX = 6;
const PILL_HEIGHT_PX = 28;
// Toolbar / titlebar takes the top ~110 px on the demo + most
// integrations. Below this row the pill always has a clear anchor.
const TOOLBAR_BOTTOM_PX = 110;
const VIEWPORT_PAD = 12;
const PILL_WIDTH = 96;
const PANEL_WIDTH = 360;

const pillStyle: CSSProperties = {
  position: 'fixed',
  zIndex: 9400,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '5px 12px',
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 999,
  border: '1px solid var(--doc-border, #d1d5db)',
  background: 'var(--doc-surface, #ffffff)',
  color: 'var(--doc-primary, #1a73e8)',
  boxShadow: '0 4px 12px -4px rgba(15,23,42,0.18)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const panelStyle: CSSProperties = {
  position: 'fixed',
  zIndex: 9400,
  width: PANEL_WIDTH,
  background: 'var(--doc-surface, #ffffff)',
  color: 'var(--doc-text-on-surface, #1f2937)',
  border: '1px solid var(--doc-border, #d1d5db)',
  borderRadius: 10,
  boxShadow: '0 12px 28px -8px rgba(15,23,42,0.22), 0 4px 10px -2px rgba(15,23,42,0.08)',
  padding: 10,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const inputRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
  gap: 8,
};

const textareaStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: 13,
  lineHeight: 1.4,
  padding: '8px 10px',
  border: '1px solid var(--doc-border, #d1d5db)',
  borderRadius: 6,
  outline: 'none',
  resize: 'none',
  background: 'var(--doc-surface, #ffffff)',
  color: 'inherit',
  font: 'inherit',
};

const sendBtnStyle: CSSProperties = {
  padding: '0 14px',
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 6,
  border: '1px solid var(--doc-primary, #1a73e8)',
  background: 'var(--doc-primary, #1a73e8)',
  color: 'white',
  cursor: 'pointer',
};

const hintRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
};

const hintChipStyle: CSSProperties = {
  fontSize: 11,
  padding: '2px 8px',
  border: '1px solid var(--doc-border, #e0e0e0)',
  borderRadius: 999,
  background: 'transparent',
  color: 'var(--doc-text-on-surface-muted, #5f6368)',
  cursor: 'pointer',
};

const closeBtnStyle: CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: 'var(--doc-text-on-surface-muted, #5f6368)',
  cursor: 'pointer',
  fontSize: 14,
  lineHeight: 1,
  padding: 4,
  marginLeft: 'auto',
};

const spinnerStyle: CSSProperties = {
  display: 'inline-block',
  width: 12,
  height: 12,
  border: '2px solid var(--doc-primary, #1a73e8)',
  borderTopColor: 'transparent',
  borderRadius: '50%',
  animation: 'docx-spin 0.8s linear infinite',
};

const QUICK_PROMPTS = [
  'Transform this into a table',
  'Rewrite this concisely',
  'Make this more formal',
  'Translate to Spanish',
  'Summarize this',
];

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function SelectionAskAi({
  isOpen,
  getView,
  onSubmit,
  onDismiss,
  busy = false,
}: SelectionAskAiProps) {
  const [expanded, setExpanded] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  // Snapshot of the selected text taken when the pill opens. Without
  // this, the textarea steals focus, the PM selection visually
  // collapses, and `getSelectionText()` later returns "" — the user
  // gets a context-free reply. Captured selection text is sent to the
  // host along with the prompt.
  const capturedSelectionRef = useRef<string>('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Recompute anchor when selection / window changes.
  useEffect(() => {
    if (!isOpen) {
      setAnchor(null);
      return;
    }
    const place = () => {
      const view = getView();
      if (!view) {
        setAnchor(null);
        return;
      }
      const { from, to, empty } = view.state.selection;
      if (empty) {
        setAnchor(null);
        return;
      }
      // Anchor at the SELECTION'S BOTTOM by default (`coordsAtPos(to)`
      // returns the end-of-last-line rect). Above-selection placement
      // is a fallback only when there's enough room above the
      // selection AND we're below the toolbar.
      let startRect: { top: number; bottom: number; left: number };
      let endRect: { top: number; bottom: number; left: number };
      try {
        startRect = view.coordsAtPos(from);
        endRect = view.coordsAtPos(to);
      } catch {
        setAnchor(null);
        return;
      }
      const widthFor = expanded ? PANEL_WIDTH : PILL_WIDTH;
      const vh = window.innerHeight;
      // Right edge accounting for chat panel / writer sheet / version
      // history / AI suggestion / panel rail so the pill can never
      // anchor behind a docked surface. Shared with the inline
      // preview popover.
      const rightEdge = usableRightEdge(VIEWPORT_PAD);
      // Try BELOW the selection first — Notion's pattern. This always
      // has room until the user is on the very last line. Pill +
      // expanded panel both fit.
      const requiredHeight = expanded ? 140 : PILL_HEIGHT_PX;
      const belowTop = endRect.bottom + PILL_GAP_PX;
      const aboveTop = startRect.top - PILL_GAP_PX - requiredHeight;
      const fitsBelow = belowTop + requiredHeight <= vh - VIEWPORT_PAD;
      const fitsAbove = aboveTop >= TOOLBAR_BOTTOM_PX;
      const top = fitsBelow ? belowTop : fitsAbove ? aboveTop : TOOLBAR_BOTTOM_PX + VIEWPORT_PAD;
      const left = clamp(startRect.left, VIEWPORT_PAD, rightEdge - widthFor);
      setAnchor({ top, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [isOpen, expanded, getView]);

  // Collapse on Escape.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (expanded) {
        e.preventDefault();
        setExpanded(false);
        setPrompt('');
        return;
      }
      onDismiss();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, expanded, onDismiss]);

  // Focus the input the moment it expands.
  useEffect(() => {
    if (expanded) {
      const id = setTimeout(() => textareaRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [expanded]);

  if (!isOpen || !anchor) return null;

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const v = prompt.trim();
      if (!v || busy) return;
      onSubmit(v, capturedSelectionRef.current);
      setExpanded(false);
      setPrompt('');
      capturedSelectionRef.current = '';
    }
  };

  if (!expanded) {
    return (
      <button
        type="button"
        style={{
          ...pillStyle,
          top: anchor.top,
          left: anchor.left,
          // While busy, the pill stays put as the user's loading
          // affordance — anchored to the same selection they were
          // working with, so they don't have to look at the chat
          // panel to know something's happening.
          cursor: busy ? 'progress' : 'pointer',
          opacity: busy ? 0.8 : 1,
        }}
        disabled={busy}
        onClick={() => {
          if (busy) return;
          // Snapshot the current selection text BEFORE focus moves
          // to the textarea. Stays valid through the entire prompt
          // flow even after the editor's selection visually fades.
          const view = getView();
          if (view) {
            const { from, to } = view.state.selection;
            if (from !== to) {
              capturedSelectionRef.current = view.state.doc.textBetween(from, to, '\n', ' ');
            }
          }
          setExpanded(true);
        }}
        data-testid="selection-ask-ai-pill"
        aria-label={busy ? 'AI is processing your request' : 'Ask AI about the selection'}
      >
        {busy ? (
          <span style={spinnerStyle} aria-hidden="true" />
        ) : (
          <MaterialSymbol name="auto_awesome" size={14} />
        )}
        <span>{busy ? 'Thinking…' : 'Ask AI'}</span>
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Ask AI about the selection"
      data-testid="selection-ask-ai-panel"
      style={{ ...panelStyle, top: anchor.top, left: anchor.left }}
    >
      <div style={inputRowStyle}>
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Transform the selection… (Enter to send)"
          rows={2}
          style={textareaStyle}
          disabled={busy}
          data-testid="selection-ask-ai-input"
        />
        <button
          type="button"
          style={sendBtnStyle}
          onClick={() => {
            const v = prompt.trim();
            if (!v || busy) return;
            onSubmit(v, capturedSelectionRef.current);
            setExpanded(false);
            setPrompt('');
            capturedSelectionRef.current = '';
          }}
          disabled={busy || !prompt.trim()}
          data-testid="selection-ask-ai-send"
        >
          Send
        </button>
        <button
          type="button"
          style={closeBtnStyle}
          onClick={() => {
            setExpanded(false);
            setPrompt('');
          }}
          aria-label="Cancel"
        >
          ✕
        </button>
      </div>
      <div style={hintRowStyle}>
        {QUICK_PROMPTS.map((q) => (
          <button
            key={q}
            type="button"
            style={hintChipStyle}
            onClick={() => setPrompt(q)}
            disabled={busy}
            data-testid={`selection-ask-ai-hint-${q.slice(0, 12).replace(/\s/g, '-')}`}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

export default SelectionAskAi;
