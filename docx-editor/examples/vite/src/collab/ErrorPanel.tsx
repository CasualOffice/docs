/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

// Full-page error state shown when the collab seed fetch fails.
// Most common causes:
//   - The share link's docId expired (gateway restart wipes
//     inline-store state).
//   - The user is hitting a backend host they can't reach.
// Either way we want a clean recovery option: drop them back to
// single-user mode on the same origin.
import type { CSSProperties } from 'react';

const styles: Record<string, CSSProperties> = {
  shell: {
    position: 'fixed',
    inset: 0,
    background: '#f8fafc',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    background: '#fff',
    borderRadius: 12,
    padding: '28px 32px',
    maxWidth: 460,
    width: '100%',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06), 0 8px 24px rgba(15, 23, 42, 0.08)',
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    background: '#fef2f2',
    color: '#dc2626',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 22,
    fontWeight: 600,
    marginBottom: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: 600,
    color: '#0f172a',
    margin: 0,
  },
  detail: {
    fontSize: 13,
    color: '#64748b',
    margin: '8px 0 20px 0',
    lineHeight: 1.55,
  },
  code: {
    fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
    fontSize: 12,
    background: '#f1f5f9',
    color: '#475569',
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid #e2e8f0',
    marginBottom: 20,
    wordBreak: 'break-word',
  },
  row: {
    display: 'flex',
    gap: 8,
    justifyContent: 'flex-end',
  },
  secondaryBtn: {
    padding: '8px 14px',
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    fontSize: 13,
    color: '#475569',
    cursor: 'pointer',
  },
  primaryBtn: {
    padding: '8px 14px',
    background: '#0f172a',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  },
};

interface ErrorPanelProps {
  title?: string;
  detail?: string;
  error?: string;
  onRetry?: () => void;
}

export function ErrorPanel({
  title = "Couldn't join the session",
  detail = "The shared document might have ended, or the backend host isn't reachable. You can retry, or start fresh in single-user mode.",
  error,
  onRetry,
}: ErrorPanelProps) {
  return (
    <div style={styles.shell}>
      <div style={styles.card}>
        <div style={styles.icon}>!</div>
        <h2 style={styles.title}>{title}</h2>
        <p style={styles.detail}>{detail}</p>
        {error && <div style={styles.code}>{error}</div>}
        <div style={styles.row}>
          <button
            style={styles.secondaryBtn}
            onClick={() => {
              window.location.href = window.location.origin;
            }}
          >
            Open single-user mode
          </button>
          {onRetry ? (
            <button style={styles.primaryBtn} onClick={onRetry}>
              Try again
            </button>
          ) : (
            <button style={styles.primaryBtn} onClick={() => window.location.reload()}>
              Reload
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
