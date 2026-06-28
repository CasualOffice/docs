/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Tools → Preferences.
 *
 * Migrated onto the shared <Dialog> shell in Phase 7. Drops the
 * custom overlay / header / footer chrome and gains the unified
 * premium aesthetic (backdrop blur, scale-in motion, refined chrome).
 *
 * Owns no state — the host (DocxEditor) keeps the canonical
 * EditorPreferences in React state, mutates `editorPreferences` (the
 * core singleton the extensions read), and persists to localStorage.
 * The dialog is a dumb view that renders toggles and reports changes.
 *
 * Premium pass on the toggles themselves: each preference is a
 * fully-tappable row card with a soft hover background. The native
 * checkbox sits inside a custom switch surface (CSS-only, no extra
 * libs) that reads as a Mac-style toggle rather than a default
 * browser checkbox.
 */

import type { CSSProperties } from 'react';
import type { EditorPreferences } from '@eigenpal/docx-core/prosemirror/extensions';
import { Dialog } from '../ui/Dialog';

export interface PreferencesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  preferences: EditorPreferences;
  onChange: <K extends keyof EditorPreferences>(key: K, value: EditorPreferences[K]) => void;
}

/* Body content styles only — the shell owns the rest. */

const bodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 14,
  padding: '12px 12px',
  borderRadius: 10,
  cursor: 'pointer',
  transition: 'background var(--doc-anim-fast)',
};

const labelTextStyle: CSSProperties = {
  fontSize: 14,
  color: 'var(--doc-text)',
  fontWeight: 500,
  letterSpacing: '-0.003em',
};

const hintStyle: CSSProperties = {
  fontSize: 12.5,
  color: 'var(--doc-text-muted)',
  marginTop: 3,
  lineHeight: 1.45,
};

/* Custom switch — Mac-style toggle pill. The native checkbox is
   hidden but stays keyboard-focusable via its label so the row
   click + Space key still toggle correctly. */

const switchWrapStyle: CSSProperties = {
  position: 'relative',
  flexShrink: 0,
  marginTop: 2,
  display: 'inline-block',
  width: 32,
  height: 18,
};

// Native checkbox sits OVER the switch pill, transparent, but
// clickable. That way the visual is our switch, but Playwright /
// keyboard / assistive tech can still target the real input.
const overlayCheckStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  opacity: 0,
  cursor: 'pointer',
  margin: 0,
};

const switchPillStyle = (on: boolean): CSSProperties => ({
  width: 32,
  height: 18,
  borderRadius: 999,
  background: on ? 'var(--doc-primary)' : 'var(--doc-border)',
  position: 'relative',
  transition: 'background var(--doc-anim-base), box-shadow var(--doc-anim-base)',
  boxShadow: 'inset 0 0 0 1px rgba(15, 23, 42, 0.06)',
});

const switchKnobStyle = (on: boolean): CSSProperties => ({
  position: 'absolute',
  top: 2,
  left: on ? 16 : 2,
  width: 14,
  height: 14,
  borderRadius: 999,
  background: '#fff',
  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.18), 0 1px 1px rgba(0, 0, 0, 0.08)',
  transition: 'left var(--doc-anim-base)',
});

const codeStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 11.5,
  padding: '1px 5px',
  borderRadius: 4,
  background: 'var(--doc-surface-sunken)',
  border: '1px solid var(--doc-border-light)',
};

const primaryBtnStyle: CSSProperties = {
  padding: '7px 16px',
  fontSize: 13,
  fontWeight: 500,
  border: '1px solid var(--doc-primary)',
  background: 'var(--doc-primary)',
  color: 'white',
  borderRadius: 6,
  cursor: 'pointer',
};

function ToggleRow({
  checked,
  onChange,
  testId,
  title,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  testId: string;
  title: string;
  description: React.ReactNode;
}) {
  return (
    <label
      style={rowStyle}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--doc-bg-hover)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <span style={switchWrapStyle}>
        <span style={switchPillStyle(checked)} aria-hidden="true">
          <span style={switchKnobStyle(checked)} />
        </span>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          data-testid={testId}
          style={overlayCheckStyle}
        />
      </span>
      <span style={{ flex: 1 }}>
        <div style={labelTextStyle}>{title}</div>
        <div style={hintStyle}>{description}</div>
      </span>
    </label>
  );
}

export function PreferencesDialog({
  isOpen,
  onClose,
  preferences,
  onChange,
}: PreferencesDialogProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Preferences"
      width={520}
      testId="preferences-dialog"
      footer={
        <button type="button" style={primaryBtnStyle} onClick={onClose}>
          Done
        </button>
      }
    >
      <div style={bodyStyle}>
        <ToggleRow
          checked={preferences.smartQuotes}
          onChange={(v) => onChange('smartQuotes', v)}
          testId="pref-smartquotes"
          title="Use smart quotes"
          description={
            <>
              Replace straight quotes, dashes, and ellipses as you type (
              <code style={codeStyle}>" → “</code>, <code style={codeStyle}>-- → —</code>,{' '}
              <code style={codeStyle}>... → …</code>).
            </>
          }
        />
        <ToggleRow
          checked={preferences.autocorrect}
          onChange={(v) => onChange('autocorrect', v)}
          testId="pref-autocorrect"
          title="Autocorrect"
          description={
            <>
              Symbol sequences (<code style={codeStyle}>(c) → ©</code>) and common-typo fixes (
              <code style={codeStyle}>teh → the</code>).
            </>
          }
        />
      </div>
    </Dialog>
  );
}

export default PreferencesDialog;
