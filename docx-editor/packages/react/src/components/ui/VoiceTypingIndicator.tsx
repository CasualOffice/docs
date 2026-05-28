/**
 * VoiceTypingIndicator — fixed-position chip shown while voice
 * typing is active. Pulses a mic icon + shows the interim
 * transcript + a Stop button.
 *
 * Position: top-right of the viewport, below the toolbar. Doesn't
 * follow the document scroll. Z-index above floating popovers.
 */

import type { CSSProperties } from 'react';
import { MaterialSymbol } from './Icons';
import { useTranslation } from '../../i18n';

export interface VoiceTypingIndicatorProps {
  isListening: boolean;
  interimText: string;
  error: string | null;
  onStop: () => void;
}

const wrapperStyle: CSSProperties = {
  position: 'fixed',
  top: 80,
  right: 24,
  zIndex: 6000,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 12px',
  background: 'var(--doc-surface)',
  border: '1px solid var(--doc-border)',
  borderRadius: 999,
  boxShadow: '0 4px 14px rgba(15, 23, 42, 0.16), 0 1px 2px rgba(15, 23, 42, 0.08)',
  maxWidth: 320,
  pointerEvents: 'auto',
};

const micPulseStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  borderRadius: '50%',
  background: 'var(--doc-error, #c5221f)',
  color: 'white',
  // Pulse animation — defined inline via a keyframes-injected style
  // element below to avoid adding a new global CSS rule.
  animation: 'docx-voice-typing-pulse 1.2s ease-in-out infinite',
};

const interimStyle: CSSProperties = {
  fontSize: 13,
  color: 'var(--doc-text-on-surface-muted)',
  fontStyle: 'italic',
  maxWidth: 200,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const stopButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  border: 'none',
  background: 'transparent',
  borderRadius: '50%',
  cursor: 'pointer',
  color: 'var(--doc-text-on-surface-muted)',
};

// One-shot stylesheet injector for the pulse keyframes. Idempotent.
function injectKeyframes(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById('docx-voice-typing-keyframes')) return;
  const style = document.createElement('style');
  style.id = 'docx-voice-typing-keyframes';
  style.textContent = `
    @keyframes docx-voice-typing-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(197, 34, 31, 0.5); }
      50%      { box-shadow: 0 0 0 8px rgba(197, 34, 31, 0); }
    }
  `;
  document.head.appendChild(style);
}

export function VoiceTypingIndicator({
  isListening,
  interimText,
  error,
  onStop,
}: VoiceTypingIndicatorProps): React.ReactElement | null {
  const { t } = useTranslation();
  injectKeyframes();
  if (!isListening && !error) return null;

  return (
    <div style={wrapperStyle} role="status" aria-live="polite" data-testid="voice-typing-indicator">
      <span style={micPulseStyle} aria-hidden="true">
        <MaterialSymbol name="mic" size={16} />
      </span>
      <span style={interimStyle} aria-label={t('voiceTyping.listening')}>
        {error ? t('voiceTyping.error', { error }) : interimText || t('voiceTyping.listeningHint')}
      </span>
      <button
        type="button"
        onClick={onStop}
        style={stopButtonStyle}
        aria-label={t('voiceTyping.stop')}
        data-testid="voice-typing-stop"
      >
        <MaterialSymbol name="close" size={18} />
      </button>
    </div>
  );
}

export default VoiceTypingIndicator;
