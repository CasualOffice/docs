/**
 * Thin status banner shown above the editor when the user is in
 * "Suggesting" mode (E3). Matches Google Docs' yellow stripe pattern:
 * left-side message explaining the mode + a "switch to editing"
 * affordance on the right.
 *
 * The host owns mode state — this component is pure visual chrome.
 */

import type { CSSProperties } from 'react';
import { useTranslation } from '../i18n';
import { formatShortcut } from '../lib/platform';

export interface SuggestingModeBannerProps {
  /** Click handler for the right-side "Switch to editing" affordance. */
  onSwitchToEditing: () => void;
}

const ROOT_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '6px 16px',
  background: '#fef7e0', // Google Docs-style soft yellow
  color: '#3c4043',
  borderBottom: '1px solid #fde293',
  fontSize: 13,
  lineHeight: 1.4,
};

const MESSAGE_STYLE: CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const STRONG_STYLE: CSSProperties = {
  fontWeight: 600,
  marginRight: 6,
};

const ACTION_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 10px',
  fontSize: 12,
  border: '1px solid #c9a227',
  background: 'transparent',
  color: '#3c4043',
  borderRadius: 4,
  cursor: 'pointer',
  fontWeight: 500,
  flexShrink: 0,
};

const CHIP_STYLE: CSSProperties = {
  fontSize: 11,
  color: '#8d6a00',
  fontWeight: 400,
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: '0.02em',
};

export function SuggestingModeBanner({ onSwitchToEditing }: SuggestingModeBannerProps) {
  const { t } = useTranslation();
  // The mode-cycle shortcut walks Editing → Suggesting → Viewing →
  // Editing, so the same key flips us back. Surface the chip on the
  // button so users learn the shortcut.
  const shortcut = formatShortcut('Ctrl+Shift+E');
  return (
    <div role="status" aria-live="polite" data-testid="suggesting-mode-banner" style={ROOT_STYLE}>
      <div style={MESSAGE_STYLE}>
        <span style={STRONG_STYLE}>{t('suggestingBanner.title')}</span>
        <span>{t('suggestingBanner.body')}</span>
      </div>
      <button
        type="button"
        style={ACTION_STYLE}
        data-testid="suggesting-banner-switch"
        onClick={onSwitchToEditing}
        title={`${t('suggestingBanner.switchToEditing')} (${shortcut})`}
      >
        {t('suggestingBanner.switchToEditing')}
        <span style={CHIP_STYLE} aria-hidden="true">
          {shortcut}
        </span>
      </button>
    </div>
  );
}

export default SuggestingModeBanner;
