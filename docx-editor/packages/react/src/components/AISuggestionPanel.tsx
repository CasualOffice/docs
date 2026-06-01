/**
 * AISuggestionPanel — right-docked task pane (Copilot-in-Word /
 * Gemini-in-Docs pattern) showing an AI rewrite or summary
 * alongside its source so the user can compare, iterate on tone,
 * and choose Replace / Insert / Reject without the result floating
 * over the doc body.
 *
 * Sister component of `WritingAssistantSheet` — same 360 px width,
 * same docking behaviour. Mounts/unmounts as a sibling of the
 * editor's scroll container so it reserves real horizontal space
 * (the page reflows) instead of overlaying.
 */

import { useEffect, type CSSProperties } from 'react';

export type AISuggestionMode = 'rewrite' | 'summarize';

export interface AISuggestionPanelProps {
  mode: AISuggestionMode;
  /** Original selection text — shown in the source preview. */
  original: string;
  /** Model output. `null` while running. */
  suggestion: string | null;
  /** Inference latency in ms for the status line. */
  inferenceMs: number | null;
  /** Apply the suggestion to the doc. */
  onAccept: () => void;
  /** Drop the suggestion + close the panel. */
  onReject: () => void;
  /** Re-run inference with the current tone + selection. */
  onRetry: () => void;
  /** Tone presets — rewrite only. Clicking a chip re-runs inline. */
  tones?: { id: string; label: string; active?: boolean }[];
  onTone?: (id: string) => void;
  /** True while the worker is still running. */
  busy: boolean;
  /** Error message from the worker, if any. */
  error?: string | null;
}

const panelWidth = 360;

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'transparent',
  zIndex: 9000,
  pointerEvents: 'none',
};

const panelStyle: CSSProperties = {
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  width: panelWidth,
  background: 'var(--doc-surface, white)',
  color: 'var(--doc-text-on-surface, #1f2937)',
  borderLeft: '1px solid var(--doc-border, #e0e0e0)',
  boxShadow: '-2px 0 12px rgba(60,64,67,0.12)',
  display: 'flex',
  flexDirection: 'column',
  pointerEvents: 'auto',
  zIndex: 9001,
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '14px 16px',
  borderBottom: '1px solid var(--doc-border, #e0e0e0)',
  flexShrink: 0,
};

const titleStyle: CSSProperties = {
  flex: 1,
  fontSize: 14,
  fontWeight: 600,
};

const closeBtnStyle: CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: 'var(--doc-text-on-surface, #1f2937)',
  cursor: 'pointer',
  fontSize: 18,
  lineHeight: 1,
  padding: 4,
};

const bodyStyle: CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: '12px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

const sectionHeadingStyle: CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  fontWeight: 600,
  color: 'var(--doc-text-muted, #6b7280)',
  margin: '0 0 6px',
};

const sourceCardStyle: CSSProperties = {
  padding: '8px 10px',
  border: '1px solid var(--doc-border, #e0e0e0)',
  borderRadius: 6,
  background: 'var(--doc-surface-sunken, #f8fafc)',
  fontSize: 13,
  lineHeight: 1.5,
  color: 'var(--doc-text-on-surface-muted, #4b5563)',
  whiteSpace: 'pre-wrap',
  maxHeight: 200,
  overflow: 'auto',
};

const suggestionCardStyle: CSSProperties = {
  padding: '10px 12px',
  border: '1px solid var(--doc-primary, #1a73e8)',
  borderRadius: 6,
  background: 'var(--doc-primary-light, #e8f0fe)',
  fontSize: 13,
  lineHeight: 1.55,
  color: 'var(--doc-text-on-surface, #1f2937)',
  whiteSpace: 'pre-wrap',
  minHeight: 80,
  maxHeight: 320,
  overflow: 'auto',
};

const errorCardStyle: CSSProperties = {
  ...suggestionCardStyle,
  border: '1px solid var(--doc-error-border, #f9c0bd)',
  background: 'var(--doc-error-bg, #fce8e6)',
  color: 'var(--doc-error, #c5221f)',
};

const toneRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
};

const toneChipStyle = (active: boolean, disabled: boolean): CSSProperties => ({
  fontSize: 11,
  padding: '4px 10px',
  borderRadius: 99,
  border: `1px solid ${active ? 'var(--doc-primary, #1a73e8)' : 'var(--doc-border, #d1d5db)'}`,
  background: active ? 'var(--doc-primary-light, #e8f0fe)' : 'transparent',
  color: active ? 'var(--doc-primary, #1a73e8)' : 'var(--doc-text-on-surface, #1f2937)',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.6 : 1,
});

const statusRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 11,
  color: 'var(--doc-text-muted, #6b7280)',
};

const spinnerStyle: CSSProperties = {
  width: 12,
  height: 12,
  borderRadius: '50%',
  border: '2px solid var(--doc-border, #d1d5db)',
  borderTopColor: 'var(--doc-primary, #1a73e8)',
  animation: 'docx-spin 0.7s linear infinite',
};

const footerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '10px 16px',
  borderTop: '1px solid var(--doc-border, #e0e0e0)',
  flexShrink: 0,
};

const btnBase: CSSProperties = {
  padding: '6px 12px',
  fontSize: 13,
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

const hintBtnStyle: CSSProperties = {
  ...secondaryBtnStyle,
  marginRight: 'auto',
};

export function AISuggestionPanel({
  mode,
  original,
  suggestion,
  inferenceMs,
  onAccept,
  onReject,
  onRetry,
  tones,
  onTone,
  busy,
  error,
}: AISuggestionPanelProps) {
  // Esc closes; ⌘/Ctrl+Enter accepts when there's a suggestion.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onReject();
        return;
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && suggestion && !busy) {
        e.preventDefault();
        onAccept();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onAccept, onReject, suggestion, busy]);

  const title = mode === 'rewrite' ? 'Rewrite with AI' : 'Summary with AI';
  const acceptLabel = mode === 'rewrite' ? 'Replace selection' : 'Insert after';

  return (
    <>
      <div style={overlayStyle} aria-hidden="true" />
      <aside
        role="complementary"
        aria-label={title}
        data-testid="ai-suggestion-panel"
        style={panelStyle}
      >
        <div style={headerStyle}>
          <span aria-hidden="true">✨</span>
          <span style={titleStyle}>{title}</span>
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

        <div style={bodyStyle}>
          <section>
            <p style={sectionHeadingStyle}>Source</p>
            <div style={sourceCardStyle} data-testid="ai-original-pane">
              {original || <em>(empty selection)</em>}
            </div>
          </section>

          {mode === 'rewrite' && tones && tones.length > 0 && (
            <section>
              <p style={sectionHeadingStyle}>Tone</p>
              <div style={toneRowStyle}>
                {tones.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    style={toneChipStyle(!!t.active, busy)}
                    onClick={() => !busy && onTone?.(t.id)}
                    disabled={busy}
                    data-testid={`ai-tone-${t.id}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            <p style={sectionHeadingStyle}>{mode === 'rewrite' ? 'Suggested' : 'Summary'}</p>
            {error ? (
              <div style={errorCardStyle} data-testid="ai-suggestion-pane">
                {error}
              </div>
            ) : (
              <div style={suggestionCardStyle} data-testid="ai-suggestion-pane">
                {suggestion ?? (busy ? '' : 'Waiting…')}
              </div>
            )}
            <div style={{ ...statusRowStyle, marginTop: 6 }}>
              {busy && <span style={spinnerStyle} aria-hidden="true" />}
              <span>
                {busy
                  ? 'Running on-device…'
                  : inferenceMs !== null
                    ? `${inferenceMs} ms · on-device`
                    : 'On-device'}
              </span>
            </div>
          </section>
        </div>

        <div style={footerStyle}>
          <button
            type="button"
            style={hintBtnStyle}
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
            {acceptLabel}
          </button>
        </div>
      </aside>
    </>
  );
}

export default AISuggestionPanel;
