/**
 * `PanelState` — the three rest-states every side panel ends up needing:
 * empty (no content yet), loading (fetching), and error (something
 * broke). Lifted out of `VersionHistoryPanel`'s inline `emptyHint` so
 * the rest of the panels (comments, outline, agent, future right-rail
 * panels) can stop re-inventing the same chrome.
 *
 * Visual language is intentionally quiet — centered, muted text, a
 * single icon, vertical breathing room. A retry button only renders on
 * `error` when the caller passes one.
 *
 *   <PanelState kind="loading" message="Loading edits…" />
 *   <PanelState kind="empty" message="No comments yet." />
 *   <PanelState kind="error" message="Couldn't load history." onRetry={fn} />
 */

import type { CSSProperties } from 'react';
import { MaterialSymbol } from './MaterialSymbol';

export interface PanelStateProps {
  kind: 'empty' | 'loading' | 'error';
  /** The headline string the user reads first. */
  message: string;
  /** Optional secondary line (1–2 sentences) explaining what to do next. */
  hint?: string;
  /** Optional retry handler — only renders a button when `kind === 'error'`. */
  onRetry?: () => void;
  /** Optional override for the icon (Material Symbol name). */
  icon?: string;
  /** Optional extra style applied to the root. */
  style?: CSSProperties;
}

const ROOT_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: '24px 18px',
  textAlign: 'center',
  color: 'var(--doc-text-muted, #6b7280)',
};

const MESSAGE_STYLE: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.5,
  color: 'var(--doc-text-on-surface, #1f2937)',
};

const HINT_STYLE: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.5,
  color: 'var(--doc-text-muted, #6b7280)',
  maxWidth: 260,
};

const RETRY_STYLE: CSSProperties = {
  marginTop: 6,
  padding: '4px 12px',
  fontSize: 12,
  border: '1px solid var(--doc-primary, #1a73e8)',
  background: 'transparent',
  color: 'var(--doc-primary, #1a73e8)',
  borderRadius: 4,
  cursor: 'pointer',
  fontWeight: 500,
};

const SPINNER_STYLE: CSSProperties = {
  width: 20,
  height: 20,
  border: '2px solid var(--doc-border, #e5e7eb)',
  borderTopColor: 'var(--doc-primary, #1a73e8)',
  borderRadius: '50%',
  animation: 'ep-spin 800ms linear infinite',
};

export function PanelState({ kind, message, hint, onRetry, icon, style }: PanelStateProps) {
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      aria-live={kind === 'loading' ? 'polite' : undefined}
      data-testid={`panel-state-${kind}`}
      style={{ ...ROOT_STYLE, ...style }}
    >
      {kind === 'loading' ? (
        <div aria-hidden="true" style={SPINNER_STYLE} />
      ) : (
        icon && <MaterialSymbol name={icon} size={28} />
      )}
      <div style={MESSAGE_STYLE}>{message}</div>
      {hint && <div style={HINT_STYLE}>{hint}</div>}
      {kind === 'error' && onRetry && (
        <button type="button" style={RETRY_STYLE} onClick={onRetry} data-testid="panel-state-retry">
          Retry
        </button>
      )}
    </div>
  );
}

export default PanelState;
