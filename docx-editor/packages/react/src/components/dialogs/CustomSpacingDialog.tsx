/**
 * Custom Spacing Dialog (Phase 1.5-PIVOT, replaces the old tabbed
 * ParagraphDialog).
 *
 * Mirrors Google Docs' "Custom spacing…" leaf opened from the
 * Line & paragraph spacing toolbar dropdown. Single small dialog
 * with line spacing, before/after spacing, and the four pagination
 * toggles — no tabs, no inch-based indent spinners (indent has its
 * own surface: ruler + Format > Indent options).
 *
 * Apply-on-change: changes dispatch immediately via the host's
 * onSubmit, which calls setParagraphAttrs. The dialog does not
 * gatekeep on OK/Cancel; a single Close button is provided.
 */
import React, { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from '../../i18n';

export type LineSpacingRuleValue = 'auto' | 'exact' | 'atLeast';

export interface CustomSpacingValue {
  /** twips when rule is exact/atLeast; multiple-of-240 in twips when rule is auto */
  lineSpacing: number;
  lineSpacingRule: LineSpacingRuleValue;
  /** twips */
  spaceBefore: number;
  /** twips */
  spaceAfter: number;
  contextualSpacing: boolean;
  keepNext: boolean;
  keepLines: boolean;
  widowControl: boolean;
  pageBreakBefore: boolean;
}

export interface CustomSpacingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialValue: CustomSpacingValue;
  /** Called on every change; apply via setParagraphAttrs. */
  onChange: (value: CustomSpacingValue) => void;
}

const panelStyle: CSSProperties = {
  position: 'fixed',
  top: 100,
  left: '50%',
  transform: 'translateX(-50%)',
  width: 380,
  maxHeight: 'calc(100vh - 140px)',
  backgroundColor: 'var(--doc-surface, white)',
  borderRadius: 8,
  boxShadow: '0 8px 28px rgba(0, 0, 0, 0.2)',
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
  padding: '14px',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

const rowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '130px 1fr',
  gap: 10,
  alignItems: 'center',
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

const segGroupStyle: CSSProperties = {
  display: 'flex',
  gap: 4,
  flexWrap: 'wrap',
};

const segBtnStyle = (active: boolean): CSSProperties => ({
  padding: '5px 10px',
  fontSize: 12,
  border: `1px solid ${active ? 'var(--doc-accent, #2563eb)' : 'var(--doc-border)'}`,
  borderRadius: 4,
  background: active ? 'var(--doc-accent-soft, #eff6ff)' : 'var(--doc-surface)',
  color: 'var(--doc-text-on-surface)',
  cursor: 'pointer',
});

const sectionHeadStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--doc-text-muted)',
  textTransform: 'uppercase',
  letterSpacing: 0.6,
  marginBottom: 4,
};

const checkboxLabelStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 13,
  color: 'var(--doc-text-on-surface)',
};

const twipsPerPt = 20;
function twipsToPt(twips: number): number {
  return Math.round((twips / twipsPerPt) * 100) / 100;
}
function ptToTwips(pt: number): number {
  return Math.round(pt * twipsPerPt);
}

const PRESETS: { label: string; twips: number }[] = [
  { label: '1.0', twips: 240 },
  { label: '1.15', twips: 276 },
  { label: '1.5', twips: 360 },
  { label: '2.0', twips: 480 },
];

export function CustomSpacingDialog({
  isOpen,
  onClose,
  initialValue,
  onChange,
}: CustomSpacingDialogProps): React.ReactElement | null {
  const { t } = useTranslation();
  const [value, setValue] = useState<CustomSpacingValue>(initialValue);

  useEffect(() => {
    if (isOpen) setValue(initialValue);
  }, [isOpen, initialValue]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const commit = (next: CustomSpacingValue) => {
    setValue(next);
    onChange(next);
  };
  const update = <K extends keyof CustomSpacingValue>(key: K, v: CustomSpacingValue[K]) =>
    commit({ ...value, [key]: v });

  return (
    <div
      style={panelStyle}
      role="dialog"
      aria-label={t('dialogs.customSpacing.title')}
      data-testid="custom-spacing-dialog"
    >
      <div style={headerStyle}>
        <span style={titleStyle}>{t('dialogs.customSpacing.title')}</span>
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
          <div style={sectionHeadStyle}>{t('dialogs.customSpacing.lineSpacing')}</div>
          <div style={segGroupStyle}>
            {PRESETS.map((p) => (
              <button
                key={p.twips}
                type="button"
                style={segBtnStyle(
                  value.lineSpacingRule === 'auto' && value.lineSpacing === p.twips
                )}
                onClick={() => commit({ ...value, lineSpacingRule: 'auto', lineSpacing: p.twips })}
                data-testid={`spacing-preset-${p.label}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div style={{ ...rowStyle, marginTop: 8 }}>
            <label style={labelStyle} htmlFor="cs-rule">
              {t('dialogs.customSpacing.rule')}
            </label>
            <div style={segGroupStyle}>
              {(['auto', 'atLeast', 'exact'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  style={segBtnStyle(value.lineSpacingRule === r)}
                  onClick={() => update('lineSpacingRule', r)}
                >
                  {t(`dialogs.customSpacing.rule_${r}`)}
                </button>
              ))}
            </div>
          </div>
          <div style={{ ...rowStyle, marginTop: 8 }}>
            <label style={labelStyle} htmlFor="cs-line-value">
              {value.lineSpacingRule === 'auto'
                ? t('dialogs.customSpacing.multipleOf')
                : t('dialogs.customSpacing.atPt')}
            </label>
            <input
              id="cs-line-value"
              type="number"
              step={value.lineSpacingRule === 'auto' ? 0.05 : 1}
              min={0}
              style={inputStyle}
              value={
                value.lineSpacingRule === 'auto'
                  ? Math.round((value.lineSpacing / 240) * 100) / 100 || 1
                  : twipsToPt(value.lineSpacing)
              }
              onChange={(e) => {
                const n = Number(e.target.value);
                update(
                  'lineSpacing',
                  value.lineSpacingRule === 'auto' ? Math.round(n * 240) : ptToTwips(n)
                );
              }}
              data-testid="spacing-line-value"
            />
          </div>
        </div>

        <div>
          <div style={sectionHeadStyle}>{t('dialogs.customSpacing.paragraphSpacing')}</div>
          <div style={rowStyle}>
            <label style={labelStyle} htmlFor="cs-before">
              {t('dialogs.customSpacing.beforePt')}
            </label>
            <input
              id="cs-before"
              type="number"
              step={1}
              min={0}
              style={inputStyle}
              value={twipsToPt(value.spaceBefore)}
              onChange={(e) => update('spaceBefore', ptToTwips(Number(e.target.value)))}
              data-testid="spacing-before"
            />
          </div>
          <div style={{ ...rowStyle, marginTop: 6 }}>
            <label style={labelStyle} htmlFor="cs-after">
              {t('dialogs.customSpacing.afterPt')}
            </label>
            <input
              id="cs-after"
              type="number"
              step={1}
              min={0}
              style={inputStyle}
              value={twipsToPt(value.spaceAfter)}
              onChange={(e) => update('spaceAfter', ptToTwips(Number(e.target.value)))}
              data-testid="spacing-after"
            />
          </div>
          <label style={{ ...checkboxLabelStyle, marginTop: 8 }}>
            <input
              type="checkbox"
              checked={value.contextualSpacing}
              onChange={(e) => update('contextualSpacing', e.target.checked)}
              data-testid="spacing-contextual"
            />
            {t('dialogs.customSpacing.contextualSpacing')}
          </label>
        </div>

        <div>
          <div style={sectionHeadStyle}>{t('dialogs.customSpacing.pagination')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                checked={value.widowControl}
                onChange={(e) => update('widowControl', e.target.checked)}
                data-testid="spacing-widow"
              />
              {t('dialogs.customSpacing.widowControl')}
            </label>
            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                checked={value.keepNext}
                onChange={(e) => update('keepNext', e.target.checked)}
                data-testid="spacing-keep-next"
              />
              {t('dialogs.customSpacing.keepNext')}
            </label>
            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                checked={value.keepLines}
                onChange={(e) => update('keepLines', e.target.checked)}
                data-testid="spacing-keep-lines"
              />
              {t('dialogs.customSpacing.keepLines')}
            </label>
            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                checked={value.pageBreakBefore}
                onChange={(e) => update('pageBreakBefore', e.target.checked)}
                data-testid="spacing-page-break-before"
              />
              {t('dialogs.customSpacing.pageBreakBefore')}
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CustomSpacingDialog;
