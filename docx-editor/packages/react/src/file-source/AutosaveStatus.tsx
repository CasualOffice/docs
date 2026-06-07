/**
 * AutosaveStatus — compact "Saved 2 min ago" / "Saving…" / "Save
 * failed" indicator the host drops next to the user menu or title
 * bar. Matches Google Docs's saved-indicator pattern: terse, no
 * chrome, color only for the error state.
 *
 * Renders nothing while status='idle' AND lastSavedAt is null —
 * that's the "no save has happened yet" state, where a stale
 * "Saving..." label would lie. Once a save has landed, the
 * "Saved Xs ago" version sticks even after the hook drops to idle.
 */

import { useEffect, useState, type CSSProperties } from 'react';

import type { AutoSaveStatus, UseFileSourceAutoSaveReturn } from './useFileSourceAutoSave';

export interface AutosaveStatusProps {
  /** Pass the full return value of useFileSourceAutoSave. */
  state: UseFileSourceAutoSaveReturn;
  /** Optional className for host-app styling. */
  className?: string;
  /** Data-testid for E2E. Defaults to 'autosave-status'. */
  testId?: string;
  /**
   * Override the "last saved" label. Defaults to the relative
   * format ("just now" / "1 minute ago" / "5 minutes ago"). Hosts
   * with internationalisation needs supply their own formatter.
   */
  formatLastSaved?: (date: Date) => string;
}

export function AutosaveStatus({
  state,
  className,
  testId = 'autosave-status',
  formatLastSaved = defaultFormatRelative,
}: AutosaveStatusProps) {
  // Re-render every 30s so the relative time label drifts forward
  // even when nothing else in the host tree changes. Stops when the
  // component unmounts; cheap to leave running otherwise.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!state.lastSavedAt) return;
    const id = setInterval(() => forceTick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, [state.lastSavedAt]);

  const label = render(state.status, state.lastSavedAt, formatLastSaved);
  if (label === null) return null;

  return (
    <span
      className={className}
      data-testid={testId}
      data-status={state.status}
      aria-live="polite"
      aria-atomic="true"
      style={state.status === 'error' ? errorStyle : baseStyle}
    >
      {state.status === 'saving' && (
        <span aria-hidden="true" data-testid={`${testId}-spinner`} style={spinnerStyle} />
      )}
      <span>{label}</span>
    </span>
  );
}

function render(
  status: AutoSaveStatus,
  lastSavedAt: Date | null,
  formatLastSaved: (d: Date) => string
): string | null {
  switch (status) {
    case 'saving':
      return 'Saving…';
    case 'error':
      return 'Save failed';
    case 'saved':
      return lastSavedAt ? `Saved ${formatLastSaved(lastSavedAt)}` : 'Saved';
    case 'idle':
      // After at least one successful save, keep showing "Saved X
      // ago" so the indicator doesn't go dark between ticks. Before
      // any save, render nothing.
      return lastSavedAt ? `Saved ${formatLastSaved(lastSavedAt)}` : null;
  }
}

/**
 * "just now" / "1 minute ago" / "37 minutes ago" / "2 hours ago"
 * / "yesterday" / etc. Locale-naive (uses English literals); hosts
 * that need i18n pass a custom formatLastSaved.
 */
function defaultFormatRelative(date: Date): string {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

const baseStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  color: 'var(--doc-text-muted, #64748b)',
  fontFamily: 'inherit',
};

const errorStyle: CSSProperties = {
  ...baseStyle,
  color: 'rgb(153, 27, 27)',
};

const spinnerStyle: CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: '50%',
  border: '1.5px solid currentColor',
  borderTopColor: 'transparent',
  animation: 'docAutosaveSpin 0.8s linear infinite',
};

// Inject the keyframes once. Outside-of-component because module-
// level side effects only run once per process; inside an effect
// would risk duplicate injection in StrictMode dev.
if (typeof document !== 'undefined' && !document.getElementById('doc-autosave-keyframes')) {
  const style = document.createElement('style');
  style.id = 'doc-autosave-keyframes';
  style.textContent = `@keyframes docAutosaveSpin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
}
