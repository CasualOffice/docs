/**
 * Paragraph Dialog (Phase 1.5 U5).
 *
 * Word's Format > Paragraph dialog. Two tabs:
 *   - Indents and Spacing: alignment, outline level, left/right indent,
 *     special (first-line/hanging) + by, before/after spacing, line
 *     spacing rule + value, contextual spacing toggle.
 *   - Line and Page Breaks: widow/orphan, keep with next, keep lines
 *     together, page break before.
 *
 * The PM extension already exposes every field as a paragraph attr and
 * the OOXML round-trip is locked in (parser + serializer). This dialog
 * just authorises a UI to edit them; it dispatches a single bulk-attr
 * transaction via `setParagraphAttrs` so each Apply is one undo step.
 */
import React, { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from '../../i18n';
import { FocusTrap } from '../ui/FocusTrap';

export type ParagraphAlignmentValue = 'left' | 'center' | 'right' | 'justify';
export type LineSpacingRuleValue = 'auto' | 'exact' | 'atLeast';
export type SpecialIndent = 'none' | 'firstLine' | 'hanging';

export interface ParagraphDialogValue {
  alignment: ParagraphAlignmentValue;
  outlineLevel: number | null;
  /** twips */
  indentLeft: number;
  /** twips */
  indentRight: number;
  special: SpecialIndent;
  /** twips, used for firstLine or hanging */
  specialBy: number;
  /** twips */
  spaceBefore: number;
  /** twips */
  spaceAfter: number;
  lineSpacingRule: LineSpacingRuleValue;
  /** twips for atLeast/exact; multiple-of-240 for auto (multiple) */
  lineSpacing: number;
  contextualSpacing: boolean;
  keepNext: boolean;
  keepLines: boolean;
  widowControl: boolean;
  pageBreakBefore: boolean;
}

export interface ParagraphDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialValue: ParagraphDialogValue;
  onSubmit: (value: ParagraphDialogValue) => void;
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
  minWidth: 'min(520px, calc(100vw - 32px))',
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

const sectionLabelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--doc-text-muted)',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginBottom: 2,
};

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 10,
};

const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const labelStyle: CSSProperties = {
  fontSize: 12,
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

const checkboxLabelStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 13,
  color: 'var(--doc-text-on-surface)',
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

const twipsPerInch = 1440;
const twipsPerPt = 20;

function twipsToInch(twips: number): number {
  return Math.round((twips / twipsPerInch) * 1000) / 1000;
}
function inchToTwips(inch: number): number {
  return Math.round(inch * twipsPerInch);
}
function twipsToPt(twips: number): number {
  return Math.round((twips / twipsPerPt) * 100) / 100;
}
function ptToTwips(pt: number): number {
  return Math.round(pt * twipsPerPt);
}

export function ParagraphDialog({
  isOpen,
  onClose,
  initialValue,
  onSubmit,
}: ParagraphDialogProps): React.ReactElement | null {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'indents' | 'pagination'>('indents');
  const [value, setValue] = useState<ParagraphDialogValue>(initialValue);

  useEffect(() => {
    if (isOpen) {
      setValue(initialValue);
      setTab('indents');
    }
  }, [isOpen, initialValue]);

  if (!isOpen) return null;

  const update = <K extends keyof ParagraphDialogValue>(key: K, v: ParagraphDialogValue[K]) =>
    setValue((prev) => ({ ...prev, [key]: v }));

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
          aria-label={t('dialogs.paragraph.title')}
          data-testid="paragraph-dialog"
        >
          <div style={headerStyle}>{t('dialogs.paragraph.title')}</div>
          <div style={tabBarStyle}>
            <button
              type="button"
              style={tabBtnStyle(tab === 'indents')}
              onClick={() => setTab('indents')}
              data-testid="paragraph-tab-indents"
            >
              {t('dialogs.paragraph.tabIndents')}
            </button>
            <button
              type="button"
              style={tabBtnStyle(tab === 'pagination')}
              onClick={() => setTab('pagination')}
              data-testid="paragraph-tab-pagination"
            >
              {t('dialogs.paragraph.tabPagination')}
            </button>
          </div>

          <div style={bodyStyle}>
            {tab === 'indents' ? (
              <>
                <div>
                  <div style={sectionLabelStyle}>{t('dialogs.paragraph.general')}</div>
                  <div style={gridStyle}>
                    <div style={fieldStyle}>
                      <label style={labelStyle} htmlFor="pd-alignment">
                        {t('dialogs.paragraph.alignment')}
                      </label>
                      <select
                        id="pd-alignment"
                        style={inputStyle}
                        value={value.alignment}
                        onChange={(e) =>
                          update('alignment', e.target.value as ParagraphAlignmentValue)
                        }
                        data-testid="paragraph-alignment"
                      >
                        <option value="left">{t('dialogs.paragraph.alignLeft')}</option>
                        <option value="center">{t('dialogs.paragraph.alignCenter')}</option>
                        <option value="right">{t('dialogs.paragraph.alignRight')}</option>
                        <option value="justify">{t('dialogs.paragraph.alignJustify')}</option>
                      </select>
                    </div>
                    <div style={fieldStyle}>
                      <label style={labelStyle} htmlFor="pd-outline">
                        {t('dialogs.paragraph.outlineLevel')}
                      </label>
                      <select
                        id="pd-outline"
                        style={inputStyle}
                        value={value.outlineLevel ?? ''}
                        onChange={(e) =>
                          update(
                            'outlineLevel',
                            e.target.value === '' ? null : Number(e.target.value)
                          )
                        }
                      >
                        <option value="">{t('dialogs.paragraph.bodyText')}</option>
                        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((lvl) => (
                          <option key={lvl} value={lvl}>
                            {t('dialogs.paragraph.level')} {lvl + 1}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div>
                  <div style={sectionLabelStyle}>{t('dialogs.paragraph.indentation')}</div>
                  <div style={gridStyle}>
                    <div style={fieldStyle}>
                      <label style={labelStyle} htmlFor="pd-ind-left">
                        {t('dialogs.paragraph.leftInch')}
                      </label>
                      <input
                        id="pd-ind-left"
                        type="number"
                        step={0.1}
                        style={inputStyle}
                        value={twipsToInch(value.indentLeft)}
                        onChange={(e) => update('indentLeft', inchToTwips(Number(e.target.value)))}
                        data-testid="paragraph-indent-left"
                      />
                    </div>
                    <div style={fieldStyle}>
                      <label style={labelStyle} htmlFor="pd-ind-right">
                        {t('dialogs.paragraph.rightInch')}
                      </label>
                      <input
                        id="pd-ind-right"
                        type="number"
                        step={0.1}
                        style={inputStyle}
                        value={twipsToInch(value.indentRight)}
                        onChange={(e) => update('indentRight', inchToTwips(Number(e.target.value)))}
                        data-testid="paragraph-indent-right"
                      />
                    </div>
                    <div style={fieldStyle}>
                      <label style={labelStyle} htmlFor="pd-special">
                        {t('dialogs.paragraph.special')}
                      </label>
                      <select
                        id="pd-special"
                        style={inputStyle}
                        value={value.special}
                        onChange={(e) => update('special', e.target.value as SpecialIndent)}
                        data-testid="paragraph-special"
                      >
                        <option value="none">{t('dialogs.paragraph.specialNone')}</option>
                        <option value="firstLine">{t('dialogs.paragraph.specialFirstLine')}</option>
                        <option value="hanging">{t('dialogs.paragraph.specialHanging')}</option>
                      </select>
                    </div>
                    <div style={fieldStyle}>
                      <label style={labelStyle} htmlFor="pd-special-by">
                        {t('dialogs.paragraph.byInch')}
                      </label>
                      <input
                        id="pd-special-by"
                        type="number"
                        step={0.1}
                        min={0}
                        disabled={value.special === 'none'}
                        style={inputStyle}
                        value={twipsToInch(value.specialBy)}
                        onChange={(e) => update('specialBy', inchToTwips(Number(e.target.value)))}
                        data-testid="paragraph-special-by"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <div style={sectionLabelStyle}>{t('dialogs.paragraph.spacing')}</div>
                  <div style={gridStyle}>
                    <div style={fieldStyle}>
                      <label style={labelStyle} htmlFor="pd-before">
                        {t('dialogs.paragraph.beforePt')}
                      </label>
                      <input
                        id="pd-before"
                        type="number"
                        step={1}
                        min={0}
                        style={inputStyle}
                        value={twipsToPt(value.spaceBefore)}
                        onChange={(e) => update('spaceBefore', ptToTwips(Number(e.target.value)))}
                        data-testid="paragraph-space-before"
                      />
                    </div>
                    <div style={fieldStyle}>
                      <label style={labelStyle} htmlFor="pd-after">
                        {t('dialogs.paragraph.afterPt')}
                      </label>
                      <input
                        id="pd-after"
                        type="number"
                        step={1}
                        min={0}
                        style={inputStyle}
                        value={twipsToPt(value.spaceAfter)}
                        onChange={(e) => update('spaceAfter', ptToTwips(Number(e.target.value)))}
                        data-testid="paragraph-space-after"
                      />
                    </div>
                    <div style={fieldStyle}>
                      <label style={labelStyle} htmlFor="pd-line-rule">
                        {t('dialogs.paragraph.lineSpacingRule')}
                      </label>
                      <select
                        id="pd-line-rule"
                        style={inputStyle}
                        value={value.lineSpacingRule}
                        onChange={(e) =>
                          update('lineSpacingRule', e.target.value as LineSpacingRuleValue)
                        }
                        data-testid="paragraph-line-rule"
                      >
                        <option value="auto">{t('dialogs.paragraph.lineMultiple')}</option>
                        <option value="atLeast">{t('dialogs.paragraph.lineAtLeast')}</option>
                        <option value="exact">{t('dialogs.paragraph.lineExact')}</option>
                      </select>
                    </div>
                    <div style={fieldStyle}>
                      <label style={labelStyle} htmlFor="pd-line-value">
                        {value.lineSpacingRule === 'auto'
                          ? t('dialogs.paragraph.lineValueMultiple')
                          : t('dialogs.paragraph.lineValuePt')}
                      </label>
                      <input
                        id="pd-line-value"
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
                        data-testid="paragraph-line-value"
                      />
                    </div>
                  </div>
                  <label style={{ ...checkboxLabelStyle, marginTop: 8 }}>
                    <input
                      type="checkbox"
                      checked={value.contextualSpacing}
                      onChange={(e) => update('contextualSpacing', e.target.checked)}
                      data-testid="paragraph-contextual-spacing"
                    />
                    {t('dialogs.paragraph.contextualSpacing')}
                  </label>
                </div>
              </>
            ) : (
              <div>
                <div style={sectionLabelStyle}>{t('dialogs.paragraph.pagination')}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={checkboxLabelStyle}>
                    <input
                      type="checkbox"
                      checked={value.widowControl}
                      onChange={(e) => update('widowControl', e.target.checked)}
                      data-testid="paragraph-widow"
                    />
                    {t('dialogs.paragraph.widowControl')}
                  </label>
                  <label style={checkboxLabelStyle}>
                    <input
                      type="checkbox"
                      checked={value.keepNext}
                      onChange={(e) => update('keepNext', e.target.checked)}
                      data-testid="paragraph-keep-next"
                    />
                    {t('dialogs.paragraph.keepNext')}
                  </label>
                  <label style={checkboxLabelStyle}>
                    <input
                      type="checkbox"
                      checked={value.keepLines}
                      onChange={(e) => update('keepLines', e.target.checked)}
                      data-testid="paragraph-keep-lines"
                    />
                    {t('dialogs.paragraph.keepLines')}
                  </label>
                  <label style={checkboxLabelStyle}>
                    <input
                      type="checkbox"
                      checked={value.pageBreakBefore}
                      onChange={(e) => update('pageBreakBefore', e.target.checked)}
                      data-testid="paragraph-page-break-before"
                    />
                    {t('dialogs.paragraph.pageBreakBefore')}
                  </label>
                </div>
              </div>
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
              data-testid="paragraph-ok"
            >
              {t('common.ok')}
            </button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}

export default ParagraphDialog;
