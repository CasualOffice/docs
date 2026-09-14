/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

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
import { MaterialSymbol } from './ui/Icons';
import { RightDockPanel } from './RightDockPanel';
import { PanelState } from './ui/PanelState';
import { useTranslation } from '../i18n';

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
  /** Abort an in-flight run without closing the panel. */
  onCancel?: () => void;
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

// Layout (root container + header + close button) lives in
// `RightDockPanel`. Only the surfaces below are panel-specific.

const bodyStyle: CSSProperties = {
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
  onCancel,
  onRetry,
  tones,
  onTone,
  busy,
  error,
}: AISuggestionPanelProps) {
  const { t } = useTranslation();
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

  const title = mode === 'rewrite' ? t('contextMenu.rewriteWithAi') : t('contextMenu.summarizeWithAi');
  // Accept stages the change as a tracked suggestion (deletion +
  // insertion marks) — the doc body shows it with the standard
  // red-strike / green-underline UI so the user can Accept / Reject
  // it permanently through the existing tracked-change controls.
  const acceptLabel = mode === 'rewrite' ? t('aiSuggestion.suggestReplacement') : t('aiSuggestion.suggestInsert');

  const footer = (
    <div style={footerStyle}>
      {busy && onCancel ? (
        <button
          type="button"
          style={hintBtnStyle}
          onClick={onCancel}
          data-testid="ai-suggestion-stop"
        >
          {t('aiSuggestion.stop')}
        </button>
      ) : (
        <button
          type="button"
          style={hintBtnStyle}
          onClick={onRetry}
          disabled={busy}
          data-testid="ai-suggestion-retry"
        >
          {t('common.retry')}
        </button>
      )}
      <button
        type="button"
        style={secondaryBtnStyle}
        onClick={onReject}
        data-testid="ai-suggestion-reject"
      >
        {t('common.reject')}
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
  );

  return (
    <RightDockPanel
      title={title}
      icon={<MaterialSymbol name="auto_awesome" size={16} />}
      onClose={onReject}
      testId="ai-suggestion-panel"
      ariaLabel={title}
      footer={footer}
    >
      <div style={bodyStyle}>
        <section>
          <p style={sectionHeadingStyle}>{t('aiSuggestion.source')}</p>
          <div style={sourceCardStyle} data-testid="ai-original-pane">
            {original || <em>(empty selection)</em>}
          </div>
        </section>

        {mode === 'rewrite' && tones && tones.length > 0 && (
          <section>
            <p style={sectionHeadingStyle}>{t('aiSuggestion.tone')}</p>
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
          <p style={sectionHeadingStyle}>
            {mode === 'rewrite' ? t('aiSuggestion.suggested') : t('aiSuggestion.summary')}
          </p>
          {/* The `ai-suggestion-pane` testid is kept on the wrapper in every
              state so selectors stay stable; the rest-states (error / loading /
              idle) are routed through the shared `PanelState` primitive, while
              a real (possibly still-streaming) result keeps the card. */}
          {error ? (
            <div data-testid="ai-suggestion-pane">
              <PanelState kind="error" icon="bug_report" message={error} onRetry={onRetry} />
            </div>
          ) : suggestion ? (
            <div style={suggestionCardStyle} data-testid="ai-suggestion-pane">
              {suggestion}
            </div>
          ) : busy ? (
            <div data-testid="ai-suggestion-pane">
              <PanelState
                kind="loading"
                message={
                  mode === 'rewrite'
                    ? t('aiSuggestion.rewriting')
                    : t('docops.quickActions.summarizingStatus')
                }
              />
            </div>
          ) : (
            <div data-testid="ai-suggestion-pane">
              <PanelState kind="empty" icon="auto_awesome" message={t('aiSuggestion.waiting')} />
            </div>
          )}
          {/* Latency / provenance line — only meaningful once there's a result
              (shows "Rewriting…" while a stream is still landing, then the
              inference time). The rest-states above carry their own messaging. */}
          {suggestion && (
            <div style={{ ...statusRowStyle, marginTop: 6 }}>
              {busy && <span style={spinnerStyle} aria-hidden="true" />}
              <span>
                {busy
                  ? mode === 'rewrite'
                    ? t('aiSuggestion.rewriting')
                    : t('docops.quickActions.summarizingStatus')
                  : inferenceMs !== null
                    ? t('aiSuggestion.msOnDevice', { ms: inferenceMs })
                    : t('aiSuggestion.onDevice')}
              </span>
            </div>
          )}
        </section>
      </div>
      {/* Removed legacy footer markup below — moved into <RightDockPanel footer=…>.
          Keeping the no-op fragment marker so the remainder of the JSX (orphan
          Reject/Retry/Accept blocks) doesn't sit at top-level. */}
    </RightDockPanel>
  );
}

export default AISuggestionPanel;
