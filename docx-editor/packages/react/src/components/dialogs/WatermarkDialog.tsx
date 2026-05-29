/**
 * Insert → Watermark.
 *
 * Minimal text-watermark dialog: a single text input plus Apply / Remove /
 * Cancel. Color, opacity, font-size, and rotation use sane Word-like
 * defaults (gray, 50%, 96px, -45°); knobs for those can come later.
 *
 * Visual language mirrors AboutDialog / PreferencesDialog (overlay + shell
 * with header/body/footer split + primary button) for consistency.
 */

import { useEffect, useState, type CSSProperties } from 'react';

export interface WatermarkValue {
  text: string;
  color?: string;
  opacity?: number;
  fontSize?: number;
  rotation?: number;
}

export interface WatermarkDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Current watermark (if any) so the dialog opens prefilled. */
  current?: WatermarkValue;
  /** Apply / clear callback. Pass `undefined` to remove. */
  onApply: (next: WatermarkValue | undefined) => void;
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
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
  minWidth: 420,
  maxWidth: 480,
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
  gap: 8,
};

const labelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--doc-text-on-surface, #1f2937)',
};

const inputStyle: CSSProperties = {
  padding: '8px 10px',
  fontSize: 14,
  border: '1px solid var(--doc-border, #d1d5db)',
  borderRadius: 4,
  outline: 'none',
};

const hintStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--doc-text-muted, #6b7280)',
  marginTop: 4,
};

const footerStyle: CSSProperties = {
  padding: '12px 20px 16px',
  borderTop: '1px solid var(--doc-border, #ddd)',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
};

const btnBase: CSSProperties = {
  padding: '6px 16px',
  fontSize: 13,
  borderRadius: 4,
  cursor: 'pointer',
  fontWeight: 500,
};

const primaryBtnStyle: CSSProperties = {
  ...btnBase,
  border: '1px solid var(--doc-primary, #1a73e8)',
  background: 'var(--doc-primary, #1a73e8)',
  color: 'white',
};

const secondaryBtnStyle: CSSProperties = {
  ...btnBase,
  border: '1px solid var(--doc-border, #d1d5db)',
  background: 'transparent',
  color: 'var(--doc-text-on-surface, #1f2937)',
};

const dangerBtnStyle: CSSProperties = {
  ...btnBase,
  border: '1px solid var(--doc-border, #d1d5db)',
  background: 'transparent',
  color: 'var(--doc-error, #d93025)',
  marginRight: 'auto', // push to the left, away from primary/secondary
};

export function WatermarkDialog({ isOpen, onClose, current, onApply }: WatermarkDialogProps) {
  const [text, setText] = useState(current?.text ?? '');

  // Reset the field when the dialog opens with a (potentially) new current
  // value — otherwise stale text from a previous open would bleed through.
  useEffect(() => {
    if (isOpen) setText(current?.text ?? '');
  }, [isOpen, current?.text]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const trimmed = text.trim();

  return (
    <div
      className="ep-dialog-overlay"
      style={overlayStyle}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="ep-dialog-shell"
        style={dialogStyle}
        role="dialog"
        aria-label="Watermark"
        data-testid="watermark-dialog"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={headerStyle}>Watermark</div>
        <div style={bodyStyle}>
          <label style={labelStyle} htmlFor="watermark-text">
            Text
          </label>
          <input
            id="watermark-text"
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. DRAFT, CONFIDENTIAL"
            data-testid="watermark-text-input"
            style={inputStyle}
            autoFocus
          />
          <div style={hintStyle}>
            Drawn diagonally, gray, behind the page content. Visible on every page.
          </div>
        </div>
        <div style={footerStyle}>
          {current && (
            <button
              type="button"
              style={dangerBtnStyle}
              data-testid="watermark-remove"
              onClick={() => {
                onApply(undefined);
                onClose();
              }}
            >
              Remove
            </button>
          )}
          <button type="button" style={secondaryBtnStyle} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            style={primaryBtnStyle}
            data-testid="watermark-apply"
            disabled={trimmed.length === 0}
            onClick={() => {
              onApply({ text: trimmed });
              onClose();
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

export default WatermarkDialog;
