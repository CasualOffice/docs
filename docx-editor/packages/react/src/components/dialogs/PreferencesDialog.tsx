/**
 * Tools → Preferences.
 *
 * Visual language mirrors AboutDialog (overlay + dialog shell with
 * header/body/footer split + primary button) for consistency.
 *
 * Owns no state — the host (DocxEditor) keeps the canonical
 * EditorPreferences in React state, mutates `editorPreferences` (the
 * core singleton the extensions read), and persists to localStorage.
 * The dialog is a dumb view that renders toggles and reports changes.
 */

import { useEffect, useRef, type CSSProperties } from 'react';
import type { EditorPreferences } from '@eigenpal/docx-core/prosemirror/extensions';

export interface PreferencesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  preferences: EditorPreferences;
  onChange: <K extends keyof EditorPreferences>(key: K, value: EditorPreferences[K]) => void;
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10000,
};

const dialogStyle: CSSProperties = {
  backgroundColor: 'var(--doc-surface, white)',
  borderRadius: 8,
  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
  minWidth: 440,
  maxWidth: 520,
  width: '100%',
  margin: 20,
};

const headerStyle: CSSProperties = {
  padding: '16px 20px 12px',
  borderBottom: '1px solid var(--doc-border, #ddd)',
  fontSize: 16,
  fontWeight: 600,
  color: 'var(--doc-text-on-surface, #1f2937)',
};

const bodyStyle: CSSProperties = {
  padding: '16px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
  padding: '6px 0',
};

const labelTextStyle: CSSProperties = {
  fontSize: 14,
  color: 'var(--doc-text-on-surface, #1f2937)',
  fontWeight: 500,
  cursor: 'pointer',
};

const hintStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--doc-text-muted, #6b7280)',
  marginTop: 2,
};

const footerStyle: CSSProperties = {
  padding: '12px 20px 16px',
  borderTop: '1px solid var(--doc-border, #ddd)',
  display: 'flex',
  justifyContent: 'flex-end',
};

const primaryBtnStyle: CSSProperties = {
  padding: '6px 16px',
  fontSize: 13,
  border: '1px solid var(--doc-primary, #1a73e8)',
  background: 'var(--doc-primary, #1a73e8)',
  color: 'white',
  borderRadius: 4,
  cursor: 'pointer',
  fontWeight: 500,
};

export function PreferencesDialog({
  isOpen,
  onClose,
  preferences,
  onChange,
}: PreferencesDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on Escape so the dialog behaves like every other modal here.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="ep-dialog-overlay"
      style={overlayStyle}
      onMouseDown={(e) => {
        // Click on the backdrop closes; clicks inside the dialog don't.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="ep-dialog-shell"
        style={dialogStyle}
        role="dialog"
        aria-label="Preferences"
        data-testid="preferences-dialog"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={headerStyle}>Preferences</div>
        <div style={bodyStyle}>
          <label style={rowStyle}>
            <input
              type="checkbox"
              checked={preferences.smartQuotes}
              onChange={(e) => onChange('smartQuotes', e.target.checked)}
              data-testid="pref-smartquotes"
              style={{ marginTop: 3, width: 16, height: 16, cursor: 'pointer' }}
            />
            <span>
              <div style={labelTextStyle}>Use smart quotes</div>
              <div style={hintStyle}>
                Replace straight quotes, dashes, and ellipses as you type (<code>" → "</code>,{' '}
                <code>-- → —</code>, <code>... → …</code>).
              </div>
            </span>
          </label>
          <label style={rowStyle}>
            <input
              type="checkbox"
              checked={preferences.autocorrect}
              onChange={(e) => onChange('autocorrect', e.target.checked)}
              data-testid="pref-autocorrect"
              style={{ marginTop: 3, width: 16, height: 16, cursor: 'pointer' }}
            />
            <span>
              <div style={labelTextStyle}>Autocorrect</div>
              <div style={hintStyle}>
                Symbol sequences (<code>(c) → ©</code>) and common-typo fixes (
                <code>teh → the</code>).
              </div>
            </span>
          </label>
        </div>
        <div style={footerStyle}>
          <button type="button" style={primaryBtnStyle} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export default PreferencesDialog;
