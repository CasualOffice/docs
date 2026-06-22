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
  gridTemplateColumns: 'repeat(5, 1fr)',
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

export interface ImagePropertiesSectionProps {
  /** Current wrap mode of the selected image. */
  wrapType: string;
  /** Current rendered width/height in px (drives the editable inputs). */
  width?: number | null;
  height?: number | null;
  /** Apply a wrap mode (host wires this to setImageWrapType). */
  onSetWrap: (value: string) => void;
  /** Apply an explicit width/height (host wires this to setNodeMarkup). */
  onSetSize?: (width: number, height: number) => void;
}

export function ImagePropertiesSection({
  wrapType,
  width,
  height,
  onSetWrap,
  onSetSize,
}: ImagePropertiesSectionProps) {
  // Local, editable copies so typing doesn't fight the live node attrs. They
  // re-sync whenever the selected image (its size) changes underneath.
  const [w, setW] = useState<string>(width != null ? String(Math.round(width)) : '');
  const [h, setH] = useState<string>(height != null ? String(Math.round(height)) : '');
  const [lockAspect, setLockAspect] = useState(true);

  useEffect(() => {
    setW(width != null ? String(Math.round(width)) : '');
    setH(height != null ? String(Math.round(height)) : '');
  }, [width, height]);

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
    </div>
  );
}
