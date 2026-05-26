/**
 * Borders and Shading Dialog (Phase 1.5 U6).
 *
 * Word's Format > Borders and Shading dialog, scoped to paragraph
 * (not Page Border / Table). Two tabs:
 *   - Borders: preset (none/box/shadow), style + color + width,
 *     per-side toggles for top/bottom/left/right.
 *   - Shading: fill color, pattern, pattern color.
 *
 * The PM extension exposes paragraph `borders` and `shading` as node
 * attrs; OOXML round-trip (w:pBdr per-side + w:shd) was already wired.
 * This dialog dispatches `setParagraphAttrs({ borders, shading })`.
 */
import React, { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from '../../i18n';
import { FocusTrap } from '../ui/FocusTrap';

export type BorderStyle = 'none' | 'single' | 'double' | 'dotted' | 'dashed' | 'thick' | 'triple';

type Side = 'top' | 'bottom' | 'left' | 'right';

export interface PerSideBorder {
  style: BorderStyle;
  /** hex without leading # (e.g. '000000'); empty string ≡ unset */
  colorHex: string;
  /** eighths of a point (1/8 pt). 4 ≡ 0.5 pt, 8 ≡ 1 pt. */
  size: number;
}

export interface BordersAndShadingValue {
  borders: Partial<Record<Side, PerSideBorder>>;
  shading: {
    fillHex: string;
    pattern: ShadingPattern;
    patternColorHex: string;
  };
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

export interface BordersAndShadingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialValue: BordersAndShadingValue;
  onSubmit: (value: BordersAndShadingValue) => void;
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
  minWidth: 'min(540px, calc(100vw - 32px))',
  maxWidth: 640,
  width: '100%',
  margin: 'clamp(8px, 2.5vw, 20px)',
  display: 'flex',
  flexDirection: 'column',
  maxHeight: '90vh',
};

const headerStyle: CSSProperties = {
  padding: '14px 20px',
  borderBottom: '1px solid var(--doc-border)',
  fontSize: 16,
  fontWeight: 600,
};

const tabBarStyle: CSSProperties = {
  display: 'flex',
  gap: 2,
  padding: '8px 12px 0',
  borderBottom: '1px solid var(--doc-border)',
};

const tabBtnStyle = (active: boolean): CSSProperties => ({
  padding: '6px 14px',
  fontSize: 13,
  border: '1px solid var(--doc-border)',
  borderBottom: active ? 'none' : '1px solid var(--doc-border)',
  background: active ? 'var(--doc-surface)' : 'var(--doc-surface-muted, #f4f4f4)',
  color: 'var(--doc-text-on-surface)',
  cursor: 'pointer',
  borderRadius: '4px 4px 0 0',
  marginBottom: -1,
});

const bodyStyle: CSSProperties = {
  padding: '14px 20px',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

const rowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '120px 1fr',
  alignItems: 'center',
  gap: 10,
};

const labelStyle: CSSProperties = {
  fontSize: 13,
  color: 'var(--doc-text-on-surface)',
};

const inputStyle: CSSProperties = {
  padding: '5px 8px',
  border: '1px solid var(--doc-border)',
  borderRadius: 4,
  fontSize: 13,
  background: 'var(--doc-surface)',
  color: 'var(--doc-text-on-surface)',
  boxSizing: 'border-box',
  width: '100%',
};

const sectionLabelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--doc-text-muted)',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginBottom: 6,
};

const footerStyle: CSSProperties = {
  padding: '12px 20px',
  borderTop: '1px solid var(--doc-border)',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
};

const btnStyle: CSSProperties = {
  fontSize: 13,
  padding: '6px 16px',
  borderRadius: 4,
  border: '1px solid var(--doc-border)',
  background: 'var(--doc-surface)',
  color: 'var(--doc-text-on-surface)',
  cursor: 'pointer',
};

const primaryBtnStyle: CSSProperties = {
  ...btnStyle,
  background: 'var(--doc-accent, #2563eb)',
  borderColor: 'var(--doc-accent, #2563eb)',
  color: 'white',
};

const SIDES: Side[] = ['top', 'bottom', 'left', 'right'];

function normaliseHex(s: string): string {
  const trimmed = s.trim().replace(/^#/, '');
  return /^[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toUpperCase() : '';
}

function makeBorder(style: BorderStyle, color: string, size: number): PerSideBorder {
  return { style, colorHex: color, size };
}

export function BordersAndShadingDialog({
  isOpen,
  onClose,
  initialValue,
  onSubmit,
}: BordersAndShadingDialogProps): React.ReactElement | null {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'borders' | 'shading'>('borders');
  const [value, setValue] = useState<BordersAndShadingValue>(initialValue);

  // "Apply to all" working state (default style/color/size used by presets).
  const [defaultStyle, setDefaultStyle] = useState<BorderStyle>('single');
  const [defaultColor, setDefaultColor] = useState<string>('000000');
  const [defaultSize, setDefaultSize] = useState<number>(4);

  useEffect(() => {
    if (isOpen) {
      setValue(initialValue);
      setTab('borders');
      const sample = initialValue.borders.top ?? initialValue.borders.bottom;
      if (sample) {
        setDefaultStyle(sample.style === 'none' ? 'single' : sample.style);
        setDefaultColor(sample.colorHex || '000000');
        setDefaultSize(sample.size || 4);
      }
    }
  }, [isOpen, initialValue]);

  if (!isOpen) return null;

  const applyPreset = (preset: 'none' | 'box' | 'shadow') => {
    if (preset === 'none') {
      setValue((prev) => ({ ...prev, borders: {} }));
      return;
    }
    const border = makeBorder(defaultStyle, defaultColor, defaultSize);
    setValue((prev) => ({
      ...prev,
      borders: { top: border, bottom: border, left: border, right: border },
    }));
  };

  const toggleSide = (side: Side) => {
    setValue((prev) => {
      const next = { ...prev.borders };
      if (next[side]) {
        delete next[side];
      } else {
        next[side] = makeBorder(defaultStyle, defaultColor, defaultSize);
      }
      return { ...prev, borders: next };
    });
  };

  const submit = () => {
    onSubmit(value);
    onClose();
  };

  return (
    <div
      style={overlayStyle}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <FocusTrap>
        <div
          style={dialogStyle}
          role="dialog"
          aria-modal="true"
          aria-label={t('dialogs.bordersShading.title')}
          data-testid="borders-shading-dialog"
        >
          <div style={headerStyle}>{t('dialogs.bordersShading.title')}</div>
          <div style={tabBarStyle}>
            <button
              type="button"
              style={tabBtnStyle(tab === 'borders')}
              onClick={() => setTab('borders')}
              data-testid="borders-shading-tab-borders"
            >
              {t('dialogs.bordersShading.tabBorders')}
            </button>
            <button
              type="button"
              style={tabBtnStyle(tab === 'shading')}
              onClick={() => setTab('shading')}
              data-testid="borders-shading-tab-shading"
            >
              {t('dialogs.bordersShading.tabShading')}
            </button>
          </div>

          <div style={bodyStyle}>
            {tab === 'borders' ? (
              <>
                <div>
                  <div style={sectionLabelStyle}>{t('dialogs.bordersShading.setting')}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      style={btnStyle}
                      onClick={() => applyPreset('none')}
                      data-testid="borders-preset-none"
                    >
                      {t('dialogs.bordersShading.presetNone')}
                    </button>
                    <button
                      type="button"
                      style={btnStyle}
                      onClick={() => applyPreset('box')}
                      data-testid="borders-preset-box"
                    >
                      {t('dialogs.bordersShading.presetBox')}
                    </button>
                  </div>
                </div>

                <div>
                  <div style={sectionLabelStyle}>{t('dialogs.bordersShading.style')}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={rowStyle}>
                      <label style={labelStyle} htmlFor="bs-style">
                        {t('dialogs.bordersShading.lineStyle')}
                      </label>
                      <select
                        id="bs-style"
                        style={inputStyle}
                        value={defaultStyle}
                        onChange={(e) => setDefaultStyle(e.target.value as BorderStyle)}
                        data-testid="borders-style"
                      >
                        <option value="single">{t('dialogs.bordersShading.styleSingle')}</option>
                        <option value="double">{t('dialogs.bordersShading.styleDouble')}</option>
                        <option value="thick">{t('dialogs.bordersShading.styleThick')}</option>
                        <option value="dotted">{t('dialogs.bordersShading.styleDotted')}</option>
                        <option value="dashed">{t('dialogs.bordersShading.styleDashed')}</option>
                        <option value="triple">{t('dialogs.bordersShading.styleTriple')}</option>
                      </select>
                    </div>
                    <div style={rowStyle}>
                      <label style={labelStyle} htmlFor="bs-color">
                        {t('dialogs.bordersShading.color')}
                      </label>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          id="bs-color"
                          type="color"
                          value={`#${defaultColor || '000000'}`}
                          onChange={(e) => setDefaultColor(normaliseHex(e.target.value))}
                          style={{ width: 40, height: 32, padding: 0, border: 'none' }}
                          data-testid="borders-color"
                        />
                        <input
                          type="text"
                          value={defaultColor}
                          onChange={(e) => setDefaultColor(normaliseHex(e.target.value))}
                          style={{ ...inputStyle, fontFamily: 'monospace', maxWidth: 120 }}
                          aria-label={t('dialogs.bordersShading.colorHex')}
                        />
                      </div>
                    </div>
                    <div style={rowStyle}>
                      <label style={labelStyle} htmlFor="bs-size">
                        {t('dialogs.bordersShading.widthPt')}
                      </label>
                      <select
                        id="bs-size"
                        style={inputStyle}
                        value={defaultSize}
                        onChange={(e) => setDefaultSize(Number(e.target.value))}
                        data-testid="borders-size"
                      >
                        <option value={2}>¼ pt</option>
                        <option value={4}>½ pt</option>
                        <option value={6}>¾ pt</option>
                        <option value={8}>1 pt</option>
                        <option value={12}>1½ pt</option>
                        <option value={18}>2¼ pt</option>
                        <option value={24}>3 pt</option>
                        <option value={36}>4½ pt</option>
                        <option value={48}>6 pt</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div>
                  <div style={sectionLabelStyle}>{t('dialogs.bordersShading.sides')}</div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, 1fr)',
                      gap: 6,
                    }}
                  >
                    {SIDES.map((side) => (
                      <label key={side} style={{ display: 'flex', gap: 6, fontSize: 13 }}>
                        <input
                          type="checkbox"
                          checked={Boolean(value.borders[side])}
                          onChange={() => toggleSide(side)}
                          data-testid={`borders-side-${side}`}
                        />
                        {t(`dialogs.bordersShading.side.${side}`)}
                      </label>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <div style={sectionLabelStyle}>{t('dialogs.bordersShading.fill')}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={rowStyle}>
                      <label style={labelStyle} htmlFor="bs-fill">
                        {t('dialogs.bordersShading.fillColor')}
                      </label>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          id="bs-fill"
                          type="color"
                          value={`#${value.shading.fillHex || 'FFFFFF'}`}
                          onChange={(e) =>
                            setValue((prev) => ({
                              ...prev,
                              shading: { ...prev.shading, fillHex: normaliseHex(e.target.value) },
                            }))
                          }
                          style={{ width: 40, height: 32, padding: 0, border: 'none' }}
                          data-testid="shading-fill"
                        />
                        <input
                          type="text"
                          value={value.shading.fillHex}
                          onChange={(e) =>
                            setValue((prev) => ({
                              ...prev,
                              shading: { ...prev.shading, fillHex: normaliseHex(e.target.value) },
                            }))
                          }
                          style={{ ...inputStyle, fontFamily: 'monospace', maxWidth: 120 }}
                          aria-label={t('dialogs.bordersShading.fillHex')}
                          placeholder={t('dialogs.bordersShading.noFill')}
                        />
                      </div>
                    </div>
                    <div style={rowStyle}>
                      <label style={labelStyle} htmlFor="bs-pattern">
                        {t('dialogs.bordersShading.pattern')}
                      </label>
                      <select
                        id="bs-pattern"
                        style={inputStyle}
                        value={value.shading.pattern}
                        onChange={(e) =>
                          setValue((prev) => ({
                            ...prev,
                            shading: { ...prev.shading, pattern: e.target.value as ShadingPattern },
                          }))
                        }
                        data-testid="shading-pattern"
                      >
                        <option value="clear">{t('dialogs.bordersShading.patternClear')}</option>
                        <option value="solid">{t('dialogs.bordersShading.patternSolid')}</option>
                        <option value="pct10">10%</option>
                        <option value="pct15">15%</option>
                        <option value="pct20">20%</option>
                        <option value="pct25">25%</option>
                        <option value="pct30">30%</option>
                        <option value="pct40">40%</option>
                        <option value="pct50">50%</option>
                      </select>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div style={footerStyle}>
            <button type="button" style={btnStyle} onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              style={primaryBtnStyle}
              onClick={submit}
              data-testid="borders-shading-ok"
            >
              {t('common.ok')}
            </button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}

export default BordersAndShadingDialog;
