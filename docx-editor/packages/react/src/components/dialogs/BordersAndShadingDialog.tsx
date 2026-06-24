/**
 * Borders and Shading Panel (Phase 1.5-PIVOT).
 *
 * Audit (Google Docs UX bar) flagged the previous tabbed modal as the
 * wrong shape. This is a right-anchored floating panel:
 *   - no darkening overlay (document stays visible behind it)
 *   - applies live on every change (no OK/Cancel)
 *   - click an edge of the SVG preview to toggle that side
 *   - inline swatch grid + hex input for colors, no native <input type=color>
 *   - inline icon row for line styles and widths, no native <select>
 *
 * The exported symbol stays `BordersAndShadingDialog` for callsite
 * stability; internally it's now a panel. Renaming and folding into
 * UnifiedSidebar is follow-up.
 */
import React, { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from '../../i18n';

export type BorderStyle = 'none' | 'single' | 'double' | 'dotted' | 'dashed' | 'thick' | 'triple';

type Side = 'top' | 'bottom' | 'left' | 'right';

export interface PerSideBorder {
  style: BorderStyle;
  /** hex without leading # (e.g. '000000'); empty string ≡ unset */
  colorHex: string;
  /** eighths of a point (1/8 pt). 4 ≡ 0.5 pt, 8 ≡ 1 pt. */
  size: number;
}

export type ShadingPattern =
  | 'clear'
  | 'solid'
  | 'pct10'
  | 'pct15'
  | 'pct20'
  | 'pct25'
  | 'pct30'
  | 'pct40'
  | 'pct50';

export interface BordersAndShadingValue {
  borders: Partial<Record<Side, PerSideBorder>>;
  shading: {
    fillHex: string;
    pattern: ShadingPattern;
    patternColorHex: string;
  };
}

export interface BordersAndShadingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialValue: BordersAndShadingValue;
  /** Called on EVERY change. Apply via setParagraphAttrs and rely on PM history to coalesce. */
  onSubmit: (value: BordersAndShadingValue) => void;
}

const STANDARD_COLORS: string[] = [
  '000000',
  '434343',
  '666666',
  '999999',
  'B7B7B7',
  'CCCCCC',
  'D9D9D9',
  'EFEFEF',
  'F3F3F3',
  'FFFFFF',
  '980000',
  'FF0000',
  'FF9900',
  'FFFF00',
  '00FF00',
  '00FFFF',
  '4A86E8',
  '0000FF',
  '9900FF',
  'FF00FF',
];

const LINE_STYLES: { value: BorderStyle; dasharray?: string; label: string }[] = [
  { value: 'single', label: 'Single' },
  { value: 'double', label: 'Double' },
  { value: 'thick', label: 'Thick' },
  { value: 'dotted', dasharray: '2 2', label: 'Dotted' },
  { value: 'dashed', dasharray: '5 3', label: 'Dashed' },
  { value: 'triple', label: 'Triple' },
];

const LINE_WIDTHS: { size: number; label: string; thickness: number }[] = [
  { size: 2, label: '¼ pt', thickness: 0.25 },
  { size: 4, label: '½ pt', thickness: 0.5 },
  { size: 8, label: '1 pt', thickness: 1 },
  { size: 12, label: '1½ pt', thickness: 1.5 },
  { size: 16, label: '2 pt', thickness: 2 },
  { size: 24, label: '3 pt', thickness: 3 },
];

const SHADING_PATTERNS: { value: ShadingPattern; label: string }[] = [
  { value: 'clear', label: 'Clear' },
  { value: 'solid', label: 'Solid' },
  { value: 'pct10', label: '10%' },
  { value: 'pct15', label: '15%' },
  { value: 'pct20', label: '20%' },
  { value: 'pct25', label: '25%' },
  { value: 'pct30', label: '30%' },
  { value: 'pct40', label: '40%' },
  { value: 'pct50', label: '50%' },
];

const panelStyle: CSSProperties = {
  position: 'fixed',
  top: 72,
  right: 24,
  width: 340,
  maxHeight: 'calc(100vh - 96px)',
  backgroundColor: 'var(--doc-surface, white)',
  borderRadius: 8,
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
  border: '1px solid var(--doc-border)',
  zIndex: 1000,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 14px',
  borderBottom: '1px solid var(--doc-border)',
};

const titleStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--doc-text-on-surface)',
};

const closeBtnStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--doc-text-muted)',
  fontSize: 18,
  lineHeight: 1,
  padding: '2px 6px',
  borderRadius: 4,
};

const bodyStyle: CSSProperties = {
  padding: '12px 14px 14px',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

const sectionHeadStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--doc-text-muted)',
  textTransform: 'uppercase',
  letterSpacing: 0.6,
  marginBottom: 6,
};

const subLabelStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--doc-text-on-surface)',
  marginBottom: 4,
};

const segGroupStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 4,
};

const segBtnStyle = (active: boolean): CSSProperties => ({
  padding: '6px 8px',
  border: `1px solid ${active ? 'var(--doc-accent, #2563eb)' : 'var(--doc-border)'}`,
  borderRadius: 4,
  background: active ? 'var(--doc-accent-soft, #eff6ff)' : 'var(--doc-surface)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 44,
  minHeight: 28,
});

const swatchGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(10, 1fr)',
  gap: 3,
  marginTop: 4,
};

const swatchStyle = (selected: boolean): CSSProperties => ({
  width: '100%',
  aspectRatio: '1 / 1',
  border: selected ? '2px solid var(--doc-accent, #2563eb)' : '1px solid var(--doc-border)',
  borderRadius: 2,
  cursor: 'pointer',
  padding: 0,
});

const hexInputRowStyle: CSSProperties = {
  display: 'flex',
  gap: 6,
  marginTop: 6,
  alignItems: 'center',
};

const hexInputStyle: CSSProperties = {
  flex: 1,
  padding: '4px 8px',
  fontSize: 12,
  fontFamily: 'monospace',
  border: '1px solid var(--doc-border)',
  borderRadius: 4,
  background: 'var(--doc-surface)',
  color: 'var(--doc-text-on-surface)',
};

function normaliseHex(s: string): string {
  const trimmed = s.trim().replace(/^#/, '');
  return /^[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toUpperCase() : '';
}

function makeBorder(style: BorderStyle, color: string, size: number): PerSideBorder {
  return { style, colorHex: color, size };
}

// SVG sample of a line at the given style + thickness.
function LineSample({ style, thickness = 2 }: { style: BorderStyle; thickness?: number }) {
  const sample = LINE_STYLES.find((s) => s.value === style);
  const w = 28;
  const h = 14;
  if (style === 'double') {
    return (
      <svg width={w} height={h}>
        <line
          x1={2}
          y1={h / 2 - 2}
          x2={w - 2}
          y2={h / 2 - 2}
          stroke="currentColor"
          strokeWidth={1}
        />
        <line
          x1={2}
          y1={h / 2 + 2}
          x2={w - 2}
          y2={h / 2 + 2}
          stroke="currentColor"
          strokeWidth={1}
        />
      </svg>
    );
  }
  if (style === 'triple') {
    return (
      <svg width={w} height={h}>
        <line
          x1={2}
          y1={h / 2 - 3}
          x2={w - 2}
          y2={h / 2 - 3}
          stroke="currentColor"
          strokeWidth={1}
        />
        <line x1={2} y1={h / 2} x2={w - 2} y2={h / 2} stroke="currentColor" strokeWidth={1} />
        <line
          x1={2}
          y1={h / 2 + 3}
          x2={w - 2}
          y2={h / 2 + 3}
          stroke="currentColor"
          strokeWidth={1}
        />
      </svg>
    );
  }
  return (
    <svg width={w} height={h}>
      <line
        x1={2}
        y1={h / 2}
        x2={w - 2}
        y2={h / 2}
        stroke="currentColor"
        strokeWidth={style === 'thick' ? Math.max(thickness, 3) : thickness}
        strokeDasharray={sample?.dasharray}
      />
    </svg>
  );
}

// Click-to-toggle SVG preview of a paragraph with the four border sides.
function BorderEdgePreview({
  borders,
  onToggleSide,
}: {
  borders: Partial<Record<Side, PerSideBorder>>;
  onToggleSide: (side: Side) => void;
}) {
  const w = 220;
  const h = 90;
  const pad = 10;
  const sideLine = (side: Side, x1: number, y1: number, x2: number, y2: number) => {
    const active = !!borders[side];
    return (
      <g
        key={side}
        onClick={() => onToggleSide(side)}
        style={{ cursor: 'pointer' }}
        data-testid={`borders-preview-${side}`}
      >
        {/* Wide invisible hit target */}
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={12} />
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={active ? 'var(--doc-accent, #2563eb)' : 'var(--doc-border)'}
          strokeWidth={active ? 2.5 : 1}
          strokeDasharray={active ? undefined : '3 3'}
        />
      </g>
    );
  };
  return (
    <svg
      width={w}
      height={h}
      style={{
        background: 'var(--doc-surface-muted, #fafafa)',
        borderRadius: 4,
      }}
    >
      <rect x={pad} y={pad} width={w - pad * 2} height={h - pad * 2} fill="white" stroke="none" />
      <text x={w / 2} y={h / 2 + 4} textAnchor="middle" fontSize={11} fill="var(--doc-text-muted)">
        Paragraph
      </text>
      {sideLine('top', pad, pad, w - pad, pad)}
      {sideLine('bottom', pad, h - pad, w - pad, h - pad)}
      {sideLine('left', pad, pad, pad, h - pad)}
      {sideLine('right', w - pad, pad, w - pad, h - pad)}
    </svg>
  );
}

// Reusable swatch grid + hex input.
function ColorField({
  label,
  value,
  onChange,
  allowNone = false,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  allowNone?: boolean;
}) {
  const [hexDraft, setHexDraft] = useState(value);
  useEffect(() => {
    setHexDraft(value);
  }, [value]);
  return (
    <div>
      <div style={subLabelStyle}>{label}</div>
      <div style={swatchGridStyle}>
        {allowNone && (
          <button
            type="button"
            style={{
              ...swatchStyle(value === ''),
              background:
                'linear-gradient(to top right, transparent calc(50% - 1px), red 50%, transparent calc(50% + 1px))',
            }}
            aria-label="No color"
            title="No color"
            onClick={() => onChange('')}
          />
        )}
        {STANDARD_COLORS.map((hex) => (
          <button
            type="button"
            key={hex}
            style={{
              ...swatchStyle(value.toUpperCase() === hex),
              background: '#' + hex,
            }}
            aria-label={'#' + hex}
            title={'#' + hex}
            onClick={() => onChange(hex)}
          />
        ))}
      </div>
      <div style={hexInputRowStyle}>
        <span style={{ fontSize: 12, color: 'var(--doc-text-muted)' }}>#</span>
        <input
          type="text"
          value={hexDraft}
          maxLength={7}
          placeholder="000000"
          onChange={(e) => setHexDraft(e.target.value)}
          onBlur={() => {
            const h = normaliseHex(hexDraft);
            if (h) onChange(h);
            else setHexDraft(value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const h = normaliseHex(hexDraft);
              if (h) onChange(h);
              else setHexDraft(value);
            }
          }}
          style={hexInputStyle}
          aria-label={label + ' hex'}
        />
      </div>
    </div>
  );
}

export function BordersAndShadingDialog({
  isOpen,
  onClose,
  initialValue,
  onSubmit,
}: BordersAndShadingDialogProps): React.ReactElement | null {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [value, setValue] = useState<BordersAndShadingValue>(initialValue);

  // Pen state (the style/color/width used when the user toggles a side
  // ON). Pre-seeded from the first existing side on open.
  const [penStyle, setPenStyle] = useState<BorderStyle>('single');
  const [penColor, setPenColor] = useState<string>('000000');
  const [penSize, setPenSize] = useState<number>(4);

  useEffect(() => {
    if (!isOpen) return;
    setValue(initialValue);
    const sample =
      initialValue.borders.top ??
      initialValue.borders.bottom ??
      initialValue.borders.left ??
      initialValue.borders.right;
    if (sample) {
      setPenStyle(sample.style === 'none' ? 'single' : sample.style);
      setPenColor(sample.colorHex || '000000');
      setPenSize(sample.size || 4);
    } else {
      setPenStyle('single');
      setPenColor('000000');
      setPenSize(4);
    }
  }, [isOpen, initialValue]);

  // Apply-on-change: every value mutation dispatches.
  const commit = (next: BordersAndShadingValue) => {
    setValue(next);
    onSubmit(next);
  };

  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (target && panelRef.current && !panelRef.current.contains(target)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const id = requestAnimationFrame(() => document.addEventListener('mousedown', onDown));
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  const toggleSide = (side: Side) => {
    const next = { ...value.borders };
    if (next[side]) delete next[side];
    else next[side] = makeBorder(penStyle, penColor, penSize);
    commit({ ...value, borders: next });
  };

  const applyAllSides = () => {
    const b = makeBorder(penStyle, penColor, penSize);
    commit({ ...value, borders: { top: b, bottom: b, left: b, right: b } });
  };
  const clearAllSides = () => {
    commit({ ...value, borders: {} });
  };

  // Re-paint existing sides with the latest pen attrs whenever the pen changes.
  useEffect(() => {
    if (!isOpen) return;
    const sides = Object.keys(value.borders) as Side[];
    if (sides.length === 0) return;
    const same = sides.every(
      (s) =>
        value.borders[s]?.style === penStyle &&
        value.borders[s]?.colorHex === penColor &&
        value.borders[s]?.size === penSize
    );
    if (same) return;
    const next: Partial<Record<Side, PerSideBorder>> = {};
    for (const s of sides) next[s] = makeBorder(penStyle, penColor, penSize);
    commit({ ...value, borders: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [penStyle, penColor, penSize]);

  const previewBorders = useMemo(() => value.borders, [value.borders]);

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      style={panelStyle}
      role="dialog"
      aria-label={t('dialogs.bordersShading.title')}
      data-testid="borders-shading-panel"
    >
      <div style={headerStyle}>
        <span style={titleStyle}>{t('dialogs.bordersShading.title')}</span>
        <button
          type="button"
          style={closeBtnStyle}
          aria-label={t('common.close')}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div style={bodyStyle}>
        <div>
          <div style={sectionHeadStyle}>{t('dialogs.bordersShading.tabBorders')}</div>
          <BorderEdgePreview borders={previewBorders} onToggleSide={toggleSide} />
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button
              type="button"
              style={segBtnStyle(false)}
              onClick={applyAllSides}
              data-testid="borders-preset-all"
            >
              {t('dialogs.bordersShading.presetBox')}
            </button>
            <button
              type="button"
              style={segBtnStyle(false)}
              onClick={clearAllSides}
              data-testid="borders-preset-none"
            >
              {t('dialogs.bordersShading.presetNone')}
            </button>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={subLabelStyle}>{t('dialogs.bordersShading.lineStyle')}</div>
            <div style={segGroupStyle}>
              {LINE_STYLES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  style={{
                    ...segBtnStyle(penStyle === s.value),
                    color: 'var(--doc-text-on-surface)',
                  }}
                  onClick={() => setPenStyle(s.value)}
                  aria-label={s.label}
                  title={s.label}
                  data-testid={`borders-style-${s.value}`}
                >
                  <LineSample style={s.value} />
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={subLabelStyle}>{t('dialogs.bordersShading.widthPt')}</div>
            <div style={segGroupStyle}>
              {LINE_WIDTHS.map((w) => (
                <button
                  key={w.size}
                  type="button"
                  style={{
                    ...segBtnStyle(penSize === w.size),
                    color: 'var(--doc-text-on-surface)',
                  }}
                  onClick={() => setPenSize(w.size)}
                  aria-label={w.label}
                  title={w.label}
                  data-testid={`borders-width-${w.size}`}
                >
                  <LineSample style="single" thickness={w.thickness} />
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <ColorField
              label={t('dialogs.bordersShading.color')}
              value={penColor}
              onChange={setPenColor}
            />
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--doc-border-light, #f0eee9)', paddingTop: 12 }}>
          <div style={sectionHeadStyle}>{t('dialogs.bordersShading.tabShading')}</div>
          <ColorField
            label={t('dialogs.bordersShading.fillColor')}
            value={value.shading.fillHex}
            onChange={(hex) => commit({ ...value, shading: { ...value.shading, fillHex: hex } })}
            allowNone
          />

          <div style={{ marginTop: 10 }}>
            <div style={subLabelStyle}>{t('dialogs.bordersShading.pattern')}</div>
            <div style={segGroupStyle}>
              {SHADING_PATTERNS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  style={{
                    ...segBtnStyle(value.shading.pattern === p.value),
                    fontSize: 11,
                  }}
                  onClick={() =>
                    commit({ ...value, shading: { ...value.shading, pattern: p.value } })
                  }
                  data-testid={`shading-pattern-${p.value}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BordersAndShadingDialog;
