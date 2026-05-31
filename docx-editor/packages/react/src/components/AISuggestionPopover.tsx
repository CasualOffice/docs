/**
 * AISuggestionPopover — floating card anchored next to a selection
 * that shows the model's output alongside the original, with
 * Accept / Reject controls. Used by the right-click "Rewrite with
 * AI" and "Summarize with AI" actions so the user sees what's about
 * to land before it does.
 *
 * Positioning: the host gives us viewport coordinates of the
 * selection's bounding rect; we render below the rect when there's
 * room, above when there isn't. Stays fixed during scroll because
 * the popover is `position: fixed` and the underlying selection
 * doesn't move while the card is open (we recompute on the next
 * open, not while one is up).
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react';

export type AISuggestionMode = 'rewrite' | 'summarize';

export interface AISuggestionPopoverProps {
  mode: AISuggestionMode;
  /** Original selection text — left side of the diff. */
  original: string;
  /** Model output — right side, or null while still streaming. */
  suggestion: string | null;
  /** Inference latency for the status line. */
  inferenceMs: number | null;
  /** Selection bbox (viewport coords). */
  anchor: { x: number; y: number; width: number; height: number };
  /** Apply the suggestion. For summarize, the host inserts at cursor. */
  onAccept: () => void;
  /** Drop the suggestion and close. */
  onReject: () => void;
  /** Re-run with the same input — used when the model errored or the
   *  user wants a different draft. */
  onRetry: () => void;
  /** Optional tone preset chip row — populated for rewrite only. */
  tones?: { id: string; label: string; active?: boolean }[];
  onTone?: (id: string) => void;
  /** True while the worker is still running. */
  busy: boolean;
  /** Error message from the worker, if any. */
  error?: string | null;
}

const cardWidth = 420;
const margin = 12;

const cardStyle: CSSProperties = {
  position: 'fixed',
  width: cardWidth,
  background: 'var(--doc-surface, white)',
  color: 'var(--doc-text-on-surface, #1f2937)',
  border: '1px solid var(--doc-border, #e0e0e0)',
  borderRadius: 8,
  boxShadow: '0 6px 24px rgba(60,64,67,0.18), 0 2px 6px rgba(60,64,67,0.10)',
  zIndex: 9500,
  fontSize: 13,
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 12px',
  borderBottom: '1px solid var(--doc-border, #e0e0e0)',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--doc-text-on-surface, #1f2937)',
};

const closeBtnStyle: CSSProperties = {
  marginLeft: 'auto',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  color: 'var(--doc-text-muted)',
  fontSize: 16,
  lineHeight: 1,
  padding: 2,
};

const bodyStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 1,
  background: 'var(--doc-border, #e0e0e0)',
};

const paneStyle: CSSProperties = {
  background: 'var(--doc-surface, white)',
  padding: '8px 10px',
  fontSize: 12,
  lineHeight: 1.45,
  maxHeight: 180,
  overflow: 'auto',
};

const paneLabelStyle: CSSProperties = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  fontWeight: 600,
  color: 'var(--doc-text-muted)',
  marginBottom: 4,
};

const subtleTextStyle: CSSProperties = {
  color: 'var(--doc-text-on-surface-muted, #5f6368)',
};

const toneRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 4,
  padding: '6px 12px 0',
};

const toneChipStyle = (active: boolean): CSSProperties => ({
  fontSize: 11,
  padding: '3px 9px',
  borderRadius: 99,
  border: '1px solid var(--doc-border, #d1d5db)',
  background: active ? 'var(--doc-primary-light, #e8f0fe)' : 'transparent',
  color: active ? 'var(--doc-primary, #1a73e8)' : 'var(--doc-text-on-surface, #1f2937)',
  cursor: 'pointer',
});

const footerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 12px',
  borderTop: '1px solid var(--doc-border, #e0e0e0)',
};

const statusStyle: CSSProperties = {
  fontSize: 11,
  color: 'var(--doc-text-muted)',
  marginRight: 'auto',
};

const btnBase: CSSProperties = {
  padding: '4px 12px',
  fontSize: 12,
  borderRadius: 4,
  cursor: 'pointer',
  fontWeight: 500,
};

const secondaryBtnStyle: CSSProperties = {
  ...btnBase,
  border: '1px solid var(--doc-border, #d1d5db)',
  background: 'transparent',
  color: 'var(--doc-text-on-surface, #1f2937)',
};

const primaryBtnStyle: CSSProperties = {
  ...btnBase,
  border: '1px solid var(--doc-primary, #1a73e8)',
  background: 'var(--doc-primary, #1a73e8)',
  color: 'white',
};

function clampToViewport(
  anchor: { x: number; y: number; width: number; height: number },
  cardHeight: number
): { left: number; top: number } {
  if (typeof window === 'undefined') return { left: anchor.x, top: anchor.y };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = anchor.x;
  let top = anchor.y + anchor.height + 6;
  if (top + cardHeight + margin > vh) {
    top = Math.max(margin, anchor.y - cardHeight - 6);
  }
  if (left + cardWidth + margin > vw) {
    left = Math.max(margin, vw - cardWidth - margin);
  }
  if (left < margin) left = margin;
  return { left, top };
}

export function AISuggestionPopover({
  mode,
  original,
  suggestion,
  inferenceMs,
  anchor,
  onAccept,
  onReject,
  onRetry,
  tones,
  onTone,
  busy,
  error,
}: AISuggestionPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>(() => ({
    left: anchor.x,
    top: anchor.y + anchor.height + 6,
  }));

  // Recompute placement after the card mounts so we can use its
  // actual measured height for the flip-above check.
  useEffect(() => {
    const h = ref.current?.getBoundingClientRect().height ?? 240;
    setPos(clampToViewport(anchor, h));
  }, [anchor, suggestion, busy]);

  // Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onReject();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && suggestion && !busy) {
        e.preventDefault();
        onAccept();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onAccept, onReject, suggestion, busy]);

  const headerLabel = mode === 'rewrite' ? 'Rewrite with AI' : 'Summary with AI';

  return (
    <div
      ref={ref}
      style={{ ...cardStyle, left: pos.left, top: pos.top }}
      role="dialog"
      aria-label={headerLabel}
      data-testid="ai-suggestion-popover"
    >
      <div style={headerStyle}>
        <span aria-hidden="true">✨</span>
        <span>{headerLabel}</span>
        <button
          type="button"
          style={closeBtnStyle}
          onClick={onReject}
          aria-label="Close"
          data-testid="ai-suggestion-close"
        >
          ✕
        </button>
      </div>

      {mode === 'rewrite' && tones && tones.length > 0 && (
        <div style={toneRowStyle}>
          {tones.map((t) => (
            <button
              key={t.id}
              type="button"
              style={toneChipStyle(!!t.active)}
              onClick={() => onTone?.(t.id)}
              data-testid={`ai-tone-${t.id}`}
              disabled={busy}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div style={bodyStyle}>
        <div style={paneStyle} data-testid="ai-original-pane">
          <div style={paneLabelStyle}>Original</div>
          <div style={subtleTextStyle}>{original || <em>(empty)</em>}</div>
        </div>
        <div style={paneStyle} data-testid="ai-suggestion-pane">
          <div style={paneLabelStyle}>{mode === 'rewrite' ? 'Suggested' : 'Summary'}</div>
          {error ? (
            <div style={{ color: 'var(--doc-error, #c5221f)' }}>{error}</div>
          ) : suggestion ? (
            <div>{suggestion}</div>
          ) : (
            <div style={subtleTextStyle}>
              {busy ? `${mode === 'rewrite' ? 'Rewriting' : 'Summarising'}…` : 'Waiting…'}
            </div>
          )}
        </div>
      </div>

      <div style={footerStyle}>
        <span style={statusStyle}>
          {busy
            ? 'Running on-device…'
            : inferenceMs !== null
              ? `${inferenceMs} ms · on-device`
              : 'on-device'}
        </span>
        <button
          type="button"
          style={secondaryBtnStyle}
          onClick={onRetry}
          disabled={busy}
          data-testid="ai-suggestion-retry"
        >
          Retry
        </button>
        <button
          type="button"
          style={secondaryBtnStyle}
          onClick={onReject}
          data-testid="ai-suggestion-reject"
        >
          Reject
        </button>
        <button
          type="button"
          style={primaryBtnStyle}
          onClick={onAccept}
          disabled={!suggestion || busy}
          data-testid="ai-suggestion-accept"
        >
          {mode === 'rewrite' ? 'Replace' : 'Insert'}
        </button>
      </div>
    </div>
  );
}

export default AISuggestionPopover;
