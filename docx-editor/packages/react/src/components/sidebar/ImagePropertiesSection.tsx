/**
 * Image section of the Format/Properties panel. First section built on the
 * panel base — proves the pattern (contextual, grouped, live). Reuses the
 * editor's existing image wrap command; size is shown read-only for now
 * (resize is via the on-canvas handles). Future: editable W/H, position,
 * border, recolor — all as groups in this same section.
 */
import type { CSSProperties } from 'react';

const WRAP_OPTIONS = [
  { value: 'inline', label: 'In line' },
  { value: 'squareLeft', label: 'Wrap text — left' },
  { value: 'squareRight', label: 'Wrap text — right' },
  { value: 'behind', label: 'Behind text' },
  { value: 'inFront', label: 'In front of text' },
] as const;

const GROUP_HEADER: CSSProperties = {
  padding: '12px 16px 6px',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--doc-text-muted)',
  fontWeight: 600,
};

const OPTION_BTN = (active: boolean): CSSProperties => ({
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '7px 16px',
  fontSize: 13,
  background: active ? 'var(--doc-primary-light, #e8f0fe)' : 'transparent',
  color: active ? 'var(--doc-primary, #1a73e8)' : 'var(--doc-text, #202124)',
  border: 'none',
  cursor: 'pointer',
});

const SIZE_ROW: CSSProperties = {
  padding: '6px 16px 14px',
  fontSize: 13,
  color: 'var(--doc-text, #202124)',
};

export interface ImagePropertiesSectionProps {
  /** Current wrap mode of the selected image. */
  wrapType: string;
  /** Rendered width/height in px (read-only display). */
  width?: number;
  height?: number;
  /** Apply a wrap mode (host wires this to setImageWrapType). */
  onSetWrap: (value: string) => void;
}

export function ImagePropertiesSection({
  wrapType,
  width,
  height,
  onSetWrap,
}: ImagePropertiesSectionProps) {
  return (
    <div data-testid="properties-image-section">
      <div style={GROUP_HEADER}>Text wrapping</div>
      <div role="group" aria-label="Text wrapping">
        {WRAP_OPTIONS.map((o) => {
          const active = wrapType === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="menuitemradio"
              aria-checked={active}
              style={OPTION_BTN(active)}
              data-testid={`properties-wrap-${o.value}`}
              onMouseDown={(e) => {
                e.preventDefault();
                onSetWrap(o.value);
              }}
            >
              {active ? '✓ ' : ''}
              {o.label}
            </button>
          );
        })}
      </div>
      {(width != null || height != null) && (
        <>
          <div style={GROUP_HEADER}>Size</div>
          <div style={SIZE_ROW} data-testid="properties-image-size">
            {Math.round(width ?? 0)} × {Math.round(height ?? 0)} px
            <div style={{ fontSize: 11, color: 'var(--doc-text-muted)', marginTop: 2 }}>
              Drag the corner handles on the image to resize.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
