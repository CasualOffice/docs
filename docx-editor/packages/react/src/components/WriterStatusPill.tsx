/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * WriterStatusPill — small chip in the title bar that reflects the
 * Writing Assistant's lifecycle state. Click → opens the
 * `WritingAssistantSheet`.
 *
 * Stays hidden when nothing is enabled so the title bar isn't
 * cluttered by a feature the user hasn't opted into.
 */

import type { CSSProperties } from 'react';
import { useWriterState } from '../lib/writer/controller';
import { useTranslation } from '../i18n';
import { MaterialSymbol } from './ui/Icons';

export interface WriterStatusPillProps {
  onClick: () => void;
}

const baseStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '3px 10px',
  fontSize: 11,
  borderRadius: 99,
  border: '1px solid var(--doc-border, #e0e0e0)',
  background: 'var(--doc-surface-sunken, #f1f3f4)',
  color: 'var(--doc-text-on-surface, #1f2937)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

export function WriterStatusPill({ onClick }: WriterStatusPillProps) {
  const state = useWriterState();
  const { t } = useTranslation();
  if (state.enabledFeatures.length === 0 && state.phase === 'idle') return null;

  let label = '';
  switch (state.phase) {
    case 'idle':
      label = t('writerStatus.readyToLoad');
      break;
    case 'checking-caps':
      label = t('writerStatus.checking');
      break;
    case 'confirming':
      label = t('writerStatus.confirmDownload');
      break;
    case 'downloading':
      label = t('writerStatus.loadingProgress', { percent: Math.round(state.progress * 100) });
      break;
    case 'loading':
      label = t('writerStatus.loading');
      break;
    case 'ready':
      label =
        state.lastInferenceMs !== null
          ? t('writerStatus.readyTiming', { ms: state.lastInferenceMs })
          : t('writerStatus.ready');
      break;
    case 'busy':
      label = t('writerStatus.running');
      break;
    case 'evicting':
      label = t('writerStatus.unloading');
      break;
    case 'error':
      label = t('writerStatus.paused');
      break;
  }

  return (
    <button
      type="button"
      style={baseStyle}
      onClick={onClick}
      data-testid="writer-status-pill"
      aria-label={t('writerStatus.ariaLabel')}
      title={state.errorMessage ?? label}
    >
      <MaterialSymbol name={state.phase === 'error' ? 'warning' : 'auto_awesome'} size={14} />
      <span>{label}</span>
    </button>
  );
}

export default WriterStatusPill;
