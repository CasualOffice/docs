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
  if (state.enabledFeatures.length === 0 && state.phase === 'idle') return null;

  let label = '';
  switch (state.phase) {
    case 'idle':
      label = 'Ready to load';
      break;
    case 'checking-caps':
      label = 'Checking…';
      break;
    case 'confirming':
      label = 'Confirm download';
      break;
    case 'downloading':
      label = `Loading ${Math.round(state.progress * 100)}%`;
      break;
    case 'loading':
      label = 'Loading…';
      break;
    case 'ready':
      label = state.lastInferenceMs !== null ? `Ready · ${state.lastInferenceMs} ms` : 'Ready';
      break;
    case 'busy':
      label = 'Running…';
      break;
    case 'evicting':
      label = 'Unloading…';
      break;
    case 'error':
      label = 'Paused';
      break;
  }

  return (
    <button
      type="button"
      style={baseStyle}
      onClick={onClick}
      data-testid="writer-status-pill"
      aria-label="Writing Assistant status — click to open settings"
      title={state.errorMessage ?? label}
    >
      <MaterialSymbol name={state.phase === 'error' ? 'warning' : 'auto_awesome'} size={14} />
      <span>{label}</span>
    </button>
  );
}

export default WriterStatusPill;
