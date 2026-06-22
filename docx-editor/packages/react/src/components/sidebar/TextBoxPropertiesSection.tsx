/**
 * Text box section of the Format/Properties panel. A text box is edited by
 * clicking inside it (caret model), so its Format chip appears while the caret
 * is in the box; this section gives the box-level properties that aren't text
 * formatting: size (resize by number), fill, and outline.
 *
 * All edits go through setNodeMarkup on the textBox node in the host, so they
 * round-trip and the painter re-renders — no drag overlay needed for resize.
 */
import { useEffect, useState, type CSSProperties } from 'react';

const GROUP_HEADER: CSSProperties = {
  padding: '14px 16px 8px',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--doc-text-muted)',
  fontWeight: 600,
};

const ROW: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '2px 16px 6px',
  fontSize: 12,
  color: 'var(--doc-text-muted)',
};

const numInput: CSSProperties = {
  width: 64,
  padding: '6px 8px',
  fontSize: 13,
  border: '1px solid var(--doc-border, #dadce0)',
  borderRadius: 6,
  background: 'var(--doc-surface, #fff)',
  color: 'var(--doc-text, #202124)',
};

const swatch: CSSProperties = {
  width: 36,
  height: 26,
  padding: 0,
  border: '1px solid var(--doc-border, #dadce0)',
  borderRadius: 6,
  background: 'none',
  cursor: 'pointer',
};

const OUTLINE_PRESETS: { label: string; width: number | null }[] = [
  { label: 'None', width: null },
  { label: 'Thin', width: 1 },
  { label: 'Medium', width: 2 },
  { label: 'Thick', width: 4 },
];

const presetBtn = (active: boolean): CSSProperties => ({
  height: 36,
  padding: '0 12px',
  fontSize: 12.5,
  borderRadius: 8,
  cursor: 'pointer',
  color: active ? 'var(--doc-primary, #1a73e8)' : 'var(--doc-text, #202124)',
  background: active ? 'var(--doc-primary-light, #e8f0fe)' : 'transparent',
  border: active ? '1px solid var(--doc-primary, #1a73e8)' : '1px solid var(--doc-border, #dadce0)',
});

export interface TextBoxPropertiesSectionProps {
  width?: number | null;
  height?: number | null;
  fillColor?: string | null;
  outlineWidth?: number | null;
  outlineColor?: string | null;
  onSetSize: (width: number, height: number | null) => void;
  onSetFill: (fillColor: string | null) => void;
  onSetOutline: (outlineWidth: number | null, outlineColor: string | null) => void;
}

export function TextBoxPropertiesSection({
  width,
  height,
  fillColor,
  outlineWidth,
  outlineColor,
  onSetSize,
  onSetFill,
  onSetOutline,
}: TextBoxPropertiesSectionProps) {
  const [w, setW] = useState(width != null ? String(Math.round(width)) : '');
  const [h, setH] = useState(height != null ? String(Math.round(height)) : '');
  const [fill, setFill] = useState(fillColor || '#ffffff');
  const [stroke, setStroke] = useState(outlineColor || '#000000');

  useEffect(() => setW(width != null ? String(Math.round(width)) : ''), [width]);
  useEffect(() => setH(height != null ? String(Math.round(height)) : ''), [height]);
  useEffect(() => setFill(fillColor || '#ffffff'), [fillColor]);
  useEffect(() => setStroke(outlineColor || '#000000'), [outlineColor]);

  const commitSize = () => {
    const nw = Number(w);
    if (!Number.isFinite(nw) || nw <= 0) return;
    const nh = h.trim() === '' ? null : Number(h);
    onSetSize(nw, Number.isFinite(nh as number) ? (nh as number) : null);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitSize();
    }
  };

  return (
    <div data-testid="properties-textbox-section">
      <div style={GROUP_HEADER}>Size</div>
      <div style={ROW} data-testid="properties-textbox-size">
        <label style={{ color: 'inherit' }}>
          W
          <input
            style={{ ...numInput, marginLeft: 6 }}
            type="number"
            min={24}
            max={2000}
            value={w}
            data-testid="properties-textbox-width"
            onChange={(e) => setW(e.target.value)}
            onBlur={commitSize}
            onKeyDown={onKey}
          />
        </label>
        <label style={{ color: 'inherit' }}>
          H
          <input
            style={{ ...numInput, marginLeft: 6 }}
            type="number"
            min={16}
            max={2000}
            value={h}
            placeholder="auto"
            data-testid="properties-textbox-height"
            onChange={(e) => setH(e.target.value)}
            onBlur={commitSize}
            onKeyDown={onKey}
          />
        </label>
      </div>

      <div style={GROUP_HEADER}>Fill</div>
      <div style={ROW}>
        <input
          type="color"
          value={fill}
          data-testid="properties-textbox-fill"
          style={swatch}
          onChange={(e) => {
            setFill(e.target.value);
            onSetFill(e.target.value);
          }}
        />
        <button
          type="button"
          style={{ ...presetBtn(false), height: 26 }}
          data-testid="properties-textbox-fill-none"
          onMouseDown={(e) => {
            e.preventDefault();
            onSetFill(null);
          }}
        >
          No fill
        </button>
      </div>

      <div style={GROUP_HEADER}>Outline</div>
      <div
        style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 16px 6px' }}
        role="group"
        aria-label="Outline width"
      >
        {OUTLINE_PRESETS.map((o) => {
          const active = (outlineWidth ?? null) === o.width;
          return (
            <button
              key={o.label}
              type="button"
              style={presetBtn(active)}
              data-testid={`properties-textbox-outline-${o.label.toLowerCase()}`}
              onMouseDown={(e) => {
                e.preventDefault();
                onSetOutline(o.width, o.width == null ? null : stroke);
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <label style={ROW}>
        Color
        <input
          type="color"
          value={stroke}
          data-testid="properties-textbox-outline-color"
          style={{ ...swatch, marginLeft: 8 }}
          onChange={(e) => {
            setStroke(e.target.value);
            if (outlineWidth) onSetOutline(outlineWidth, e.target.value);
          }}
        />
      </label>
    </div>
  );
}
