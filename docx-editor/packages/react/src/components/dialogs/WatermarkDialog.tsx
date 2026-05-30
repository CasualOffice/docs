/**
 * Insert → Watermark.
 *
 * Text-watermark dialog. Text is required; color, opacity, font-size, and
 * rotation are exposed as knobs with Word-like defaults (gray #808080,
 * 50%, 96px, -45°) so the basic flow stays one input + Apply, but power
 * users can dial in the look without leaving the dialog.
 *
 * Painter side: every field is already plumbed through `renderPage` →
 * the layout-painter overlay; the dialog just stops hardcoding them.
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

// Defaults match the painter's own defaults so omitting a knob produces
// the same visual as if the field weren't set at all.
const DEFAULT_COLOR = '808080';
const DEFAULT_OPACITY = 0.5;
const DEFAULT_FONT_SIZE = 96;
const DEFAULT_ROTATION = -45;

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
  minWidth: 460,
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
  gap: 12,
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
  width: '100%',
};

const sliderRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '120px 1fr 64px',
  alignItems: 'center',
  gap: 12,
};

const knobsRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '120px 1fr',
  alignItems: 'center',
  gap: 12,
};

const valueStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--doc-text-muted, #6b7280)',
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
};

const hintStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--doc-text-muted, #6b7280)',
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
  marginRight: 'auto',
};

const colorInputStyle: CSSProperties = {
  width: 36,
  height: 28,
  padding: 0,
  border: '1px solid var(--doc-border, #d1d5db)',
  borderRadius: 4,
  cursor: 'pointer',
  background: 'transparent',
};

/** "808080" ↔ "#808080" — `<input type="color">` insists on the hash. */
function toHash(rgb: string): string {
  return rgb.startsWith('#') ? rgb : `#${rgb}`;
}
function stripHash(hex: string): string {
  return hex.replace(/^#/, '');
}

export function WatermarkDialog({ isOpen, onClose, current, onApply }: WatermarkDialogProps) {
  const [text, setText] = useState(current?.text ?? '');
  const [color, setColor] = useState(current?.color ?? DEFAULT_COLOR);
  const [opacity, setOpacity] = useState(current?.opacity ?? DEFAULT_OPACITY);
  const [fontSize, setFontSize] = useState(current?.fontSize ?? DEFAULT_FONT_SIZE);
  const [rotation, setRotation] = useState(current?.rotation ?? DEFAULT_ROTATION);

  useEffect(() => {
    if (isOpen) {
      setText(current?.text ?? '');
      setColor(current?.color ?? DEFAULT_COLOR);
      setOpacity(current?.opacity ?? DEFAULT_OPACITY);
      setFontSize(current?.fontSize ?? DEFAULT_FONT_SIZE);
      setRotation(current?.rotation ?? DEFAULT_ROTATION);
    }
  }, [
    isOpen,
    current?.text,
    current?.color,
    current?.opacity,
    current?.fontSize,
    current?.rotation,
  ]);

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
  const apply = () => {
    const value: WatermarkValue = { text: trimmed };
    // Only persist knobs that diverge from the painter's defaults; an
    // omitted field stays "use the default" so future default changes
    // don't get pinned by accident.
    if (color !== DEFAULT_COLOR) value.color = color;
    if (opacity !== DEFAULT_OPACITY) value.opacity = opacity;
    if (fontSize !== DEFAULT_FONT_SIZE) value.fontSize = fontSize;
    if (rotation !== DEFAULT_ROTATION) value.rotation = rotation;
    onApply(value);
    onClose();
  };

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
          <div style={knobsRowStyle}>
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
          </div>

          <div style={knobsRowStyle}>
            <label style={labelStyle} htmlFor="watermark-color">
              Color
            </label>
            <input
              id="watermark-color"
              type="color"
              value={toHash(color)}
              onChange={(e) => setColor(stripHash(e.target.value))}
              data-testid="watermark-color-input"
              style={colorInputStyle}
              aria-label="Watermark color"
            />
          </div>

          <div style={sliderRowStyle}>
            <label style={labelStyle} htmlFor="watermark-opacity">
              Opacity
            </label>
            <input
              id="watermark-opacity"
              type="range"
              min={10}
              max={100}
              step={5}
              value={Math.round(opacity * 100)}
              onChange={(e) => setOpacity(Number(e.target.value) / 100)}
              data-testid="watermark-opacity-input"
            />
            <span style={valueStyle}>{Math.round(opacity * 100)}%</span>
          </div>

          <div style={sliderRowStyle}>
            <label style={labelStyle} htmlFor="watermark-size">
              Font size
            </label>
            <input
              id="watermark-size"
              type="range"
              min={48}
              max={144}
              step={4}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              data-testid="watermark-size-input"
            />
            <span style={valueStyle}>{fontSize}px</span>
          </div>

          <div style={sliderRowStyle}>
            <label style={labelStyle} htmlFor="watermark-rotation">
              Rotation
            </label>
            <input
              id="watermark-rotation"
              type="range"
              min={-90}
              max={90}
              step={5}
              value={rotation}
              onChange={(e) => setRotation(Number(e.target.value))}
              data-testid="watermark-rotation-input"
            />
            <span style={valueStyle}>{rotation}°</span>
          </div>

          <div style={hintStyle}>
            The watermark sits behind page content, not clickable or selectable, and shows on every
            page.
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
            onClick={apply}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

export default WatermarkDialog;
