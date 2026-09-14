/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

// Thin amber/red strip across the top of the viewport whenever
// the Yjs websocket provider isn't `connected`. Rendered on top of
// the editor; the editor stays usable (edits buffer locally and
// flush on reconnect) but the user sees that their changes aren't
// being broadcast right now.
import type { CSSProperties } from 'react';
import { useTranslation } from '@casualoffice/docs';
import type { CollabStatus } from './useCollab';

const styles: Record<CollabStatus | 'base', CSSProperties> = {
  base: {
    flex: '0 0 auto',
    padding: '6px 16px',
    fontSize: 12,
    fontWeight: 500,
    textAlign: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  connecting: {
    background: '#fffbeb',
    color: '#92400e',
    borderBottom: '1px solid #fde68a',
  },
  connected: {
    // not rendered when connected
    display: 'none',
  },
  disconnected: {
    background: '#fef2f2',
    color: '#991b1b',
    borderBottom: '1px solid #fecaca',
  },
};

export function DisconnectedBanner({ status }: { status: CollabStatus }) {
  const { t } = useTranslation();
  if (status === 'connected') return null;
  const labels: Record<CollabStatus, string> = {
    connecting: t('collab.reconnecting'),
    connected: '',
    disconnected: t('collab.offlineNotice'),
  };
  return <div style={{ ...styles.base, ...styles[status] }}>{labels[status]}</div>;
}
