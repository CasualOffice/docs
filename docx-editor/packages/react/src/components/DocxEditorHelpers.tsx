/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * DocxEditor Helper Components
 *
 * Small presentational components used by DocxEditor for
 * loading, placeholder, and error states.
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from '../i18n';

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

/**
 * Default loading indicator. Honest phase labels + elapsed timer so the
 * user can tell whether a parse is mid-flight or wedged. Phases are
 * time-based heuristics (we don't currently emit progress from the
 * parser); the labels switch as time passes so it never looks frozen.
 */
export function DefaultLoadingIndicator(): React.ReactElement {
  const { t } = useTranslation();
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    const startedAt = Date.now();
    const i = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 100);
    return () => window.clearInterval(i);
  }, []);

  // Phase labels are time-based. They roughly mirror what the parser
  // actually does — reading bytes is fast, schema build is the bulk, then
  // the layout-painter paint is the last leg.
  let phase = 'Reading document…';
  if (elapsedMs > 600) phase = 'Parsing…';
  if (elapsedMs > 2200) phase = 'Building layout…';
  if (elapsedMs > 6000) phase = 'Still working — large document…';

  const showTimer = elapsedMs >= 1500;
  const seconds = (elapsedMs / 1000).toFixed(1);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '16px',
        color: 'var(--doc-text-muted)',
      }}
      role="status"
      aria-live="polite"
      aria-label={`${t('errors.loadingDocument')} — ${phase}`}
      data-testid="loading-indicator"
    >
      <div
        style={{
          width: '36px',
          height: '36px',
          border: '3px solid var(--doc-border)',
          borderTopColor: 'var(--doc-primary)',
          borderRadius: '50%',
          animation: 'docx-spin 0.8s linear infinite',
        }}
      />
      <style>
        {`
          @keyframes docx-spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>
      <div style={{ fontSize: '14px', fontWeight: 500 }}>{t('errors.loadingDocument')}</div>
      <div style={{ fontSize: '12px', color: 'var(--doc-text-on-surface-muted, #6b7280)' }}>
        {phase}
      </div>
      {showTimer && (
        <div
          style={{
            fontSize: '11px',
            color: 'var(--doc-text-on-surface-muted, #9ca3af)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {seconds}s elapsed
        </div>
      )}
    </div>
  );
}

/**
 * Default placeholder
 */
export function DefaultPlaceholder(): React.ReactElement {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--doc-text-placeholder)',
      }}
    >
      <svg
        width="64"
        height="64"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <div style={{ marginTop: '16px' }}>{t('errors.noDocumentLoaded')}</div>
    </div>
  );
}

/**
 * Parse error display
 */
export function ParseError({ message }: { message: string }): React.ReactElement {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: '20px',
        textAlign: 'center',
      }}
    >
      <div style={{ color: 'var(--doc-error)', marginBottom: '16px' }}>
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16v.01" />
        </svg>
      </div>
      <h3 style={{ color: 'var(--doc-error)', marginBottom: '8px' }}>{t('errors.failedToLoad')}</h3>
      <p style={{ color: 'var(--doc-text-muted)', maxWidth: '400px' }}>{message}</p>
    </div>
  );
}
