/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

// Small pill rendered in the corner during collab sessions to
// surface connection state at a glance. Reads from the
// useCollab() hook's `status` field.
import type { CSSProperties } from 'react';
import type { CollabStatus, CollabPeer } from './useCollab';

const styles: Record<string, CSSProperties> = {
  badge: {
    position: 'fixed',
    top: 12,
    right: 12,
    zIndex: 9999,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 500,
    color: '#0f172a',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
  },
  peers: {
    color: '#64748b',
    fontWeight: 400,
  },
};

const colorByStatus: Record<CollabStatus, string> = {
  connecting: '#f59e0b',
  connected: '#16a34a',
  disconnected: '#ef4444',
};

const labelByStatus: Record<CollabStatus, string> = {
  connecting: 'Connecting',
  connected: 'Live',
  disconnected: 'Disconnected',
};

export function StatusBadge({ status, peers }: { status: CollabStatus; peers: CollabPeer[] }) {
  const remote = peers.filter((p) => !p.isLocal).length;
  return (
    <div style={styles.badge}>
      <span style={{ ...styles.dot, background: colorByStatus[status] }} />
      <span>{labelByStatus[status]}</span>
      {remote > 0 && (
        <span style={styles.peers}>
          · {remote} {remote === 1 ? 'other editor' : 'others'}
        </span>
      )}
    </div>
  );
}
