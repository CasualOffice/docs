/**
 * Image section of the Format/Properties panel — Google-Docs "Image options"
 * model: text-wrapping as labeled icon tiles (the selected mode highlighted),
 * plus editable width/height. One scannable surface instead of a wall of text
 * options. Reuses the editor's existing wrap + resize commands; this is a
 * presentation layer, not a new command path.
 */
import { useEffect, useState, type CSSProperties } from 'react';

interface WrapOption {
  value: string;
  label: string;
  /** 24×24 icon path describing the wrap mode. */
  icon: JSX.Element;
}

// Compact glyphs that read at a glance — text lines + a block standing for the
// image, arranged to suggest each wrap relationship.
const WRAP_OPTIONS: WrapOption[] = [
  {
    value: 'inline',
    label: 'In line',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="9" width="6" height="6" rx="1" fill="currentColor" />
        <path
          d="M11 10h10M11 14h10"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    value: 'squareLeft',
    label: 'Wrap left',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="6" width="8" height="8" rx="1" fill="currentColor" />
        <path
          d="M13 7h8M13 11h8M3 16h18M3 20h18"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    value: 'squareRight',
    label: 'Wrap right',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="13" y="6" width="8" height="8" rx="1" fill="currentColor" />
        <path
          d="M3 7h8M3 11h8M3 16h18M3 20h18"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    value: 'behind',
    label: 'Behind text',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="7" y="6" width="10" height="10" rx="1" fill="currentColor" opacity="0.35" />
        <path
          d="M3 8h18M3 12h18M3 16h18"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    value: 'inFront',
    label: 'In front',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M3 8h18M3 12h18M3 16h18"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.5"
        />
        <rect x="7" y="6" width="10" height="10" rx="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    value: 'topAndBottom',
    label: 'Top & bottom',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 5h18M3 8h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <rect x="6" y="10.5" width="12" height="4" rx="1" fill="currentColor" />
        <path d="M3 17h18M3 20h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
];

const GROUP_HEADER: CSSProperties = {
  padding: '14px 16px 8px',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--doc-text-muted)',
  fontWeight: 600,
};

const TILE_GRID: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 6,
  padding: '0 12px',
};

const tile = (active: boolean): CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  padding: '8px 2px 6px',
  fontSize: 10.5,
  lineHeight: 1.2,
  textAlign: 'center',
  color: active ? 'var(--doc-primary, #1a73e8)' : 'var(--doc-text, #202124)',
  background: active ? 'var(--doc-primary-light, #e8f0fe)' : 'transparent',
  border: active
    ? '1.5px solid var(--doc-primary, #1a73e8)'
    : '1.5px solid var(--doc-border, #dadce0)',
  borderRadius: 8,
  cursor: 'pointer',
});

const SIZE_ROW: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 16px 6px',
};

const sizeInput: CSSProperties = {
  width: 64,
  padding: '6px 8px',
  fontSize: 13,
  border: '1px solid var(--doc-border, #dadce0)',
  borderRadius: 6,
  background: 'var(--doc-surface, #fff)',
  color: 'var(--doc-text, #202124)',
};

const sizeLabel: CSSProperties = {
  fontSize: 12,
  color: 'var(--doc-text-muted)',
};

export type ImageTransform = 'rotateCW' | 'rotateCCW' | 'flipH' | 'flipV';

export interface ImagePropertiesSectionProps {
  /** Current wrap mode of the selected image. */
  wrapType: string;
  /** Current rendered width/height in px (drives the editable inputs). */
  width?: number | null;
  height?: number | null;
  /** Current border attrs (drive the border controls). */
  borderWidth?: number | null;
  borderColor?: string | null;
  /** Current alt text. */
  alt?: string | null;
  /** Apply a wrap mode (host wires this to setImageWrapType). */
  onSetWrap: (value: string) => void;
  /** Apply an explicit width/height (host wires this to setNodeMarkup). */
  onSetSize?: (width: number, height: number) => void;
  /** Rotate/flip the image (host wires this to handleImageTransform). */
  onTransform?: (action: ImageTransform) => void;
  /** Set border width/color/style (host wires this to setNodeMarkup). */
  onSetBorder?: (
    borderWidth: number | null,
    borderColor: string | null,
    borderStyle: string | null
  ) => void;
  /** Set alt text (host wires this to setNodeMarkup). */
  onSetAlt?: (alt: string) => void;
  /** Current distance-from-text margins (px) for wrapped images. */
  distTop?: number | null;
  distBottom?: number | null;
  distLeft?: number | null;
  distRight?: number | null;
  /** Set distance-from-text margins (host wires this to setNodeMarkup). */
  onSetDist?: (side: 'distTop' | 'distBottom' | 'distLeft' | 'distRight', value: number) => void;
}

// Distance-from-text only applies to text-wrapping floats.
const WRAPS_TEXT = new Set(['squareLeft', 'squareRight', 'topAndBottom']);

const BORDER_PRESETS: { label: string; width: number | null }[] = [
  { label: 'None', width: null },
  { label: 'Thin', width: 1 },
  { label: 'Medium', width: 2 },
  { label: 'Thick', width: 4 },
];

const ARRANGE: { action: ImageTransform; label: string; icon: JSX.Element }[] = [
  {
    action: 'rotateCCW',
    label: 'Rotate left',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M7.11 8.53 5.7 7.11C4.8 8.27 4.24 9.61 4.07 11h2.02c.14-.87.49-1.72 1.02-2.47zM6.09 13H4.07c.17 1.39.72 2.73 1.62 3.89l1.41-1.42c-.52-.75-.87-1.59-1.01-2.47zm1.01 5.32c1.16.9 2.51 1.44 3.9 1.61V17.9c-.87-.15-1.71-.49-2.46-1.03L7.1 18.32zM13 4.07V1L8.45 5.55 13 10V6.09c2.84.48 5 2.94 5 5.91s-2.16 5.43-5 5.91v2.02c3.95-.49 7-3.85 7-7.93s-3.05-7.44-7-7.93z" />
      </svg>
    ),
  },
  {
    action: 'rotateCW',
    label: 'Rotate right',
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        style={{ transform: 'scaleX(-1)' }}
      >
        <path d="M7.11 8.53 5.7 7.11C4.8 8.27 4.24 9.61 4.07 11h2.02c.14-.87.49-1.72 1.02-2.47zM6.09 13H4.07c.17 1.39.72 2.73 1.62 3.89l1.41-1.42c-.52-.75-.87-1.59-1.01-2.47zm1.01 5.32c1.16.9 2.51 1.44 3.9 1.61V17.9c-.87-.15-1.71-.49-2.46-1.03L7.1 18.32zM13 4.07V1L8.45 5.55 13 10V6.09c2.84.48 5 2.94 5 5.91s-2.16 5.43-5 5.91v2.02c3.95-.49 7-3.85 7-7.93s-3.05-7.44-7-7.93z" />
      </svg>
    ),
  },
  {
    action: 'flipH',
    label: 'Flip horizontal',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3v18" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2 2" />
        <path d="M10 6 4 12l6 6V6zM14 6v12l6-6-6-6z" fill="currentColor" opacity="0.85" />
      </svg>
    ),
  },
  {
    action: 'flipV',
    label: 'Flip vertical',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 12h18" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2 2" />
        <path d="M6 10 12 4l6 6H6zM6 14h12l-6 6-6-6z" fill="currentColor" opacity="0.85" />
      </svg>
    ),
  },
];

const arrangeBtn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 40,
  height: 36,
  border: '1px solid var(--doc-border, #dadce0)',
  borderRadius: 8,
  background: 'transparent',
  color: 'var(--doc-text, #202124)',
  cursor: 'pointer',
};

export function ImagePropertiesSection({
  wrapType,
  width,
  height,
  borderWidth,
  borderColor,
  alt,
  onSetWrap,
  onSetSize,
  onTransform,
  onSetBorder,
  onSetAlt,
  distTop,
  distBottom,
  distLeft,
  distRight,
  onSetDist,
}: ImagePropertiesSectionProps) {
  // Local, editable copies so typing doesn't fight the live node attrs. They
  // re-sync whenever the selected image (its size) changes underneath.
  const [w, setW] = useState<string>(width != null ? String(Math.round(width)) : '');
  const [h, setH] = useState<string>(height != null ? String(Math.round(height)) : '');
  const [lockAspect, setLockAspect] = useState(true);
  const [color, setColor] = useState<string>(borderColor || '#000000');
  const [altText, setAltText] = useState<string>(alt || '');

  useEffect(() => {
    setW(width != null ? String(Math.round(width)) : '');
    setH(height != null ? String(Math.round(height)) : '');
  }, [width, height]);
  useEffect(() => {
    setColor(borderColor || '#000000');
  }, [borderColor]);
  useEffect(() => {
    setAltText(alt || '');
  }, [alt]);

  const aspect = width && height ? width / height : null;

  const commitWidth = () => {
    const nw = Number(w);
    if (!Number.isFinite(nw) || nw <= 0 || !onSetSize) return;
    const nh = lockAspect && aspect ? Math.round(nw / aspect) : Number(h) || nw;
    setH(String(nh));
    onSetSize(nw, nh);
  };
  const commitHeight = () => {
    const nh = Number(h);
    if (!Number.isFinite(nh) || nh <= 0 || !onSetSize) return;
    const nw = lockAspect && aspect ? Math.round(nh * aspect) : Number(w) || nh;
    setW(String(nw));
    onSetSize(nw, nh);
  };
  const onKey = (e: React.KeyboardEvent, commit: () => void) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    }
  };

  return (
    <div data-testid="properties-image-section">
      <div style={GROUP_HEADER}>Text wrapping</div>
      <div style={TILE_GRID} role="group" aria-label="Text wrapping">
        {WRAP_OPTIONS.map((o) => {
          const active = wrapType === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="menuitemradio"
              aria-checked={active}
              aria-label={o.label}
              title={o.label}
              style={tile(active)}
              data-testid={`properties-wrap-${o.value}`}
              onMouseDown={(e) => {
                e.preventDefault();
                onSetWrap(o.value);
              }}
            >
              {o.icon}
              <span>{o.label}</span>
            </button>
          );
        })}
      </div>

      {onSetSize && (width != null || height != null) && (
        <>
          <div style={GROUP_HEADER}>Size</div>
          <div style={SIZE_ROW} data-testid="properties-image-size">
            <label style={sizeLabel}>
              W
              <input
                style={{ ...sizeInput, marginLeft: 6 }}
                type="number"
                min={8}
                max={2000}
                value={w}
                data-testid="properties-image-width"
                onChange={(e) => setW(e.target.value)}
                onBlur={commitWidth}
                onKeyDown={(e) => onKey(e, commitWidth)}
              />
            </label>
            <label style={sizeLabel}>
              H
              <input
                style={{ ...sizeInput, marginLeft: 6 }}
                type="number"
                min={8}
                max={2000}
                value={h}
                data-testid="properties-image-height"
                onChange={(e) => setH(e.target.value)}
                onBlur={commitHeight}
                onKeyDown={(e) => onKey(e, commitHeight)}
              />
            </label>
          </div>
          <label
            style={{
              ...sizeLabel,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 16px 14px',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={lockAspect}
              data-testid="properties-image-lock-aspect"
              onChange={(e) => setLockAspect(e.target.checked)}
            />
            Lock aspect ratio
          </label>
        </>
      )}

      {onSetDist && WRAPS_TEXT.has(wrapType) && (
        <>
          <div style={GROUP_HEADER}>Distance from text</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '6px 12px',
              padding: '0 16px 14px',
            }}
            data-testid="properties-image-dist"
          >
            {(
              [
                ['distTop', 'Top', distTop],
                ['distBottom', 'Bottom', distBottom],
                ['distLeft', 'Left', distLeft],
                ['distRight', 'Right', distRight],
              ] as const
            ).map(([side, label, val]) => (
              <label
                key={side}
                style={{ ...sizeLabel, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {label}
                <input
                  style={{ ...sizeInput, width: 56 }}
                  type="number"
                  min={0}
                  max={200}
                  defaultValue={val != null ? Math.round(val) : 0}
                  data-testid={`properties-image-${side}`}
                  onBlur={(e) => onSetDist(side, Number(e.target.value) || 0)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      onSetDist(side, Number((e.target as HTMLInputElement).value) || 0);
                    }
                  }}
                />
              </label>
            ))}
          </div>
        </>
      )}

      {onTransform && (
        <>
          <div style={GROUP_HEADER}>Arrange</div>
          <div
            style={{ display: 'flex', gap: 6, padding: '0 16px 4px' }}
            role="group"
            aria-label="Arrange"
          >
            {ARRANGE.map((a) => (
              <button
                key={a.action}
                type="button"
                title={a.label}
                aria-label={a.label}
                style={arrangeBtn}
                data-testid={`properties-image-${a.action}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onTransform(a.action);
                }}
              >
                {a.icon}
              </button>
            ))}
          </div>
        </>
      )}

      {onSetBorder && (
        <>
          <div style={GROUP_HEADER}>Border</div>
          <div
            style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 16px 6px' }}
            role="group"
            aria-label="Border width"
          >
            {BORDER_PRESETS.map((b) => {
              const active = (borderWidth ?? null) === b.width;
              return (
                <button
                  key={b.label}
                  type="button"
                  style={{
                    ...arrangeBtn,
                    width: 'auto',
                    padding: '0 12px',
                    fontSize: 12.5,
                    color: active ? 'var(--doc-primary, #1a73e8)' : 'var(--doc-text, #202124)',
                    background: active ? 'var(--doc-primary-light, #e8f0fe)' : 'transparent',
                    borderColor: active
                      ? 'var(--doc-primary, #1a73e8)'
                      : 'var(--doc-border, #dadce0)',
                  }}
                  data-testid={`properties-image-border-${b.label.toLowerCase()}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSetBorder(
                      b.width,
                      b.width == null ? null : color,
                      b.width == null ? null : 'solid'
                    );
                  }}
                >
                  {b.label}
                </button>
              );
            })}
          </div>
          <label style={{ ...SIZE_ROW, ...sizeLabel, paddingBottom: 14 }}>
            Color
            <input
              type="color"
              value={color}
              data-testid="properties-image-border-color"
              style={{
                marginLeft: 8,
                width: 36,
                height: 26,
                padding: 0,
                border: '1px solid var(--doc-border, #dadce0)',
                borderRadius: 6,
                background: 'none',
                cursor: 'pointer',
              }}
              onChange={(e) => {
                setColor(e.target.value);
                // Apply immediately if a border is already on; else just stage.
                if (borderWidth) onSetBorder(borderWidth, e.target.value, 'solid');
              }}
            />
          </label>
        </>
      )}

      {onSetAlt && (
        <>
          <div style={GROUP_HEADER}>Alt text</div>
          <div style={{ padding: '0 16px 16px' }}>
            <textarea
              value={altText}
              data-testid="properties-image-alt"
              placeholder="Describe this image"
              rows={2}
              style={{
                width: '100%',
                resize: 'vertical',
                padding: '6px 8px',
                fontSize: 13,
                border: '1px solid var(--doc-border, #dadce0)',
                borderRadius: 6,
                background: 'var(--doc-surface, #fff)',
                color: 'var(--doc-text, #202124)',
                boxSizing: 'border-box',
              }}
              onChange={(e) => setAltText(e.target.value)}
              onBlur={() => onSetAlt(altText)}
            />
          </div>
        </>
      )}
    </div>
  );
}
