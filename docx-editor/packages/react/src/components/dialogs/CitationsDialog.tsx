/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Tools → Citations (A6 v0). Local-only citation manager.
 *
 * Two regions:
 *   1. Top — "Add citation" form (author, title, year, URL).
 *   2. Bottom — list of saved citations with Insert + Delete per row,
 *      plus a style chooser (APA / MLA / Chicago) shared across rows.
 *
 * Insert calls back to the host with the formatted text + the URL (if
 * any), so the host can wrap the URL substring in a hyperlink mark.
 * Storage is `localStorage` — same pattern as Building Blocks.
 *
 * The "real" .docx bibliography-field round-trip is a follow-up; the
 * parity note flags it as "queue last."
 */

import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from '../../i18n';
import type { Citation, CitationStyle } from '../../utils/citations';
import { formatCitation } from '../../utils/citations';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';

export interface CitationsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Saved citations, ordered newest-first by the host. */
  citations: Citation[];
  /** Save a new citation. */
  onAdd: (input: Omit<Citation, 'id' | 'createdAt'>) => void;
  /** Remove a saved citation. */
  onDelete: (id: string) => void;
  /** Insert the formatted citation text + URL at the caret. */
  onInsert: (formatted: string, url?: string) => void;
}

const bodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

const sectionLabelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--doc-text-muted, #6b7280)',
};

const formRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 8,
};

const inputStyle: CSSProperties = {
  padding: '8px 10px',
  fontSize: 13,
  border: '1px solid var(--doc-border, #d1d5db)',
  borderRadius: 4,
  outline: 'none',
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

const styleRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
  color: 'var(--doc-text-on-surface, #1f2937)',
};

const emptyStateStyle: CSSProperties = {
  padding: '12px 0',
  fontSize: 13,
  color: 'var(--doc-text-muted, #6b7280)',
  textAlign: 'center',
};

const citationRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
  padding: '10px 12px',
  borderRadius: 4,
  border: '1px solid var(--doc-border, #e5e7eb)',
};

const citationTextStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.5,
  color: 'var(--doc-text-on-surface, #1f2937)',
};

const rowActionsStyle: CSSProperties = {
  display: 'flex',
  gap: 6,
  flexShrink: 0,
};

const rowBtnStyle: CSSProperties = {
  padding: '4px 10px',
  fontSize: 12,
  border: '1px solid var(--doc-border, #d1d5db)',
  background: 'transparent',
  borderRadius: 4,
  cursor: 'pointer',
  fontWeight: 500,
};

const insertBtnStyle: CSSProperties = {
  ...rowBtnStyle,
  color: 'var(--doc-primary, #1a73e8)',
  borderColor: 'var(--doc-primary, #1a73e8)',
};

const deleteBtnStyle: CSSProperties = {
  ...rowBtnStyle,
  color: 'var(--doc-error, #d93025)',
};

export function CitationsDialog({
  isOpen,
  onClose,
  citations,
  onAdd,
  onDelete,
  onInsert,
}: CitationsDialogProps) {
  const { t } = useTranslation();
  const [author, setAuthor] = useState('');
  const [title, setTitle] = useState('');
  const [year, setYear] = useState('');
  const [url, setUrl] = useState('');
  const [style, setStyle] = useState<CitationStyle>('apa');

  useEffect(() => {
    if (isOpen) {
      setAuthor('');
      setTitle('');
      setYear('');
      setUrl('');
      setStyle('apa');
    }
  }, [isOpen]);

  const canAdd = author.trim().length > 0 && title.trim().length > 0;
  const submit = () => {
    if (!canAdd) return;
    onAdd({ author, title, year, url });
    setAuthor('');
    setTitle('');
    setYear('');
    setUrl('');
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={t('dialogs.citations.title')}
      width={640}
      testId="citations-dialog"
      footer={
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      <div style={bodyStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={sectionLabelStyle}>{t('dialogs.citations.addCitation')}</div>
          <div style={formRowStyle}>
            <input
              type="text"
              placeholder={t('dialogs.citations.authorPlaceholder')}
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              style={inputStyle}
              data-testid="citation-author"
            />
            <input
              type="text"
              placeholder={t('dialogs.citations.yearPlaceholder')}
              value={year}
              onChange={(e) => setYear(e.target.value)}
              style={inputStyle}
              data-testid="citation-year"
            />
            <input
              type="text"
              placeholder={t('dialogs.citations.titlePlaceholder')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ ...inputStyle, gridColumn: '1 / span 2' }}
              data-testid="citation-title"
            />
            <input
              type="text"
              placeholder={t('dialogs.citations.urlPlaceholder')}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              style={{ ...inputStyle, gridColumn: '1 / span 2' }}
              data-testid="citation-url"
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              style={primaryBtnStyle}
              data-testid="citation-add"
              disabled={!canAdd}
              onClick={submit}
            >
              {t('dialogs.citations.saveCitation')}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={sectionLabelStyle}>
            {t('dialogs.citations.savedCitations')}
            {citations.length > 0 ? ` (${citations.length})` : ''}
          </div>
          <div style={styleRowStyle}>
            <span>{t('dialogs.citations.format')}</span>
            {(['apa', 'mla', 'chicago'] as const).map((s) => (
              <label
                key={s}
                style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
              >
                <input
                  type="radio"
                  name="citation-style"
                  value={s}
                  checked={style === s}
                  onChange={() => setStyle(s)}
                  data-testid={`citation-style-${s}`}
                />
                {s.toUpperCase()}
              </label>
            ))}
          </div>
          {citations.length === 0 ? (
            <div style={emptyStateStyle} data-testid="citation-empty">
              {t('dialogs.citations.empty')}
            </div>
          ) : (
            citations.map((c) => {
              const formatted = formatCitation(c, style);
              return (
                <div key={c.id} style={citationRowStyle} data-testid={`citation-row-${c.id}`}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={citationTextStyle}>{formatted}</div>
                  </div>
                  <div style={rowActionsStyle}>
                    <button
                      type="button"
                      style={insertBtnStyle}
                      data-testid={`citation-insert-${c.id}`}
                      onClick={() => onInsert(formatted, c.url)}
                    >
                      {t('common.insert')}
                    </button>
                    <button
                      type="button"
                      style={deleteBtnStyle}
                      data-testid={`citation-delete-${c.id}`}
                      onClick={() => onDelete(c.id)}
                      aria-label={t('dialogs.citations.deleteCitation', { title: c.title })}
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Dialog>
  );
}

export default CitationsDialog;
