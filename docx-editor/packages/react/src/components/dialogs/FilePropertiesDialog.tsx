/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * File → Properties dialog.
 *
 * Reads/edits the OOXML core properties (`docProps/core.xml`):
 *   - title, subject, creator (author), keywords, description
 *   - lastModifiedBy, revision (read-only)
 *   - created, modified (read-only — Word manages these)
 *
 * The dialog only edits the four user-visible fields; the rest are
 * displayed so the user can confirm what's stored on the file. On save,
 * the editor pushes edits onto `doc.package.properties`, and the next
 * repack writes them back through `applyCorePropertiesToXml`.
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from '../../i18n';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { formatSize } from '../../utils/recent-files';

export interface FilePropertiesValue {
  title?: string;
  subject?: string;
  creator?: string;
  keywords?: string;
  description?: string;
  lastModifiedBy?: string;
  revision?: number;
  created?: Date;
  modified?: Date;
  category?: string;
  contentStatus?: string;
}

export interface FilePropertiesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the four user-editable fields when the user clicks Apply. */
  onApply: (props: Partial<FilePropertiesValue>) => void;
  current?: FilePropertiesValue;
  /** The open file's name (shown read-only). */
  fileName?: string;
  /** Real on-disk byte size of the loaded file (shown read-only). */
  sizeBytes?: number;
}

const contentStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
};

const labelStyle: CSSProperties = {
  width: 130,
  fontSize: 13,
  color: 'var(--doc-text-muted, #555)',
  paddingTop: 6,
};

const inputStyle: CSSProperties = {
  flex: 1,
  padding: '6px 8px',
  border: '1px solid var(--doc-border, #ccc)',
  borderRadius: 4,
  fontSize: 13,
  fontFamily: 'inherit',
  background: 'var(--doc-bg-input, white)',
  color: 'var(--doc-text-on-surface, #1f2937)',
};

const readonlyValueStyle: CSSProperties = {
  flex: 1,
  padding: '6px 8px',
  fontSize: 13,
  color: 'var(--doc-text-muted, #666)',
};

const sectionTitleStyle: CSSProperties = {
  fontSize: 11,
  color: 'var(--doc-text-on-surface-muted, #6b7280)',
  margin: '4px 0 8px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

function formatDate(d: Date | undefined): string {
  if (!d) return '—';
  // Guard Invalid Date (e.g. an unparseable core.xml timestamp) — toLocaleString
  // would render the literal "Invalid Date".
  if (isNaN(d.getTime())) return '—';
  try {
    return d.toLocaleString();
  } catch {
    return d.toISOString();
  }
}

// Drop placeholder junk that some producers stamp into core.xml so the dialog
// shows a clean em-dash instead of "Unknown" / "null" / empty.
function sanitize(value: string | undefined): string {
  const v = value?.trim();
  if (!v || v.toLowerCase() === 'unknown' || v.toLowerCase() === 'null') return '—';
  return v;
}

export function FilePropertiesDialog({
  isOpen,
  onClose,
  onApply,
  current,
  fileName,
  sizeBytes,
}: FilePropertiesDialogProps): React.ReactElement | null {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [creator, setCreator] = useState('');
  const [keywords, setKeywords] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setTitle(current?.title ?? '');
    setSubject(current?.subject ?? '');
    setCreator(current?.creator ?? '');
    setKeywords(current?.keywords ?? '');
    setDescription(current?.description ?? '');
    setCategory(current?.category ?? '');
  }, [isOpen, current]);

  const handleApply = useCallback(() => {
    onApply({
      title,
      subject,
      creator,
      keywords,
      description,
      category,
    });
    onClose();
  }, [title, subject, creator, keywords, description, category, onApply, onClose]);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={t('dialogs.fileProperties.title')}
      ariaLabel={t('dialogs.fileProperties.title')}
      width={540}
      testId="file-properties-dialog"
      footer={
        <>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            data-testid="fp-apply"
            onClick={handleApply}
          >
            {t('common.apply')}
          </Button>
        </>
      }
    >
      <div style={contentStyle}>
        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>{t('dialogs.fileProperties.sectionMetadata')}</h3>
          <div style={rowStyle}>
            <label style={labelStyle} htmlFor="fp-title">
              {t('dialogs.fileProperties.fieldTitle')}
            </label>
            <input
              id="fp-title"
              data-testid="fp-title"
              style={inputStyle}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div style={rowStyle}>
            <label style={labelStyle} htmlFor="fp-subject">
              {t('dialogs.fileProperties.fieldSubject')}
            </label>
            <input
              id="fp-subject"
              data-testid="fp-subject"
              style={inputStyle}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div style={rowStyle}>
            <label style={labelStyle} htmlFor="fp-creator">
              {t('dialogs.fileProperties.fieldAuthor')}
            </label>
            <input
              id="fp-creator"
              data-testid="fp-creator"
              style={inputStyle}
              value={creator}
              onChange={(e) => setCreator(e.target.value)}
            />
          </div>
          <div style={rowStyle}>
            <label style={labelStyle} htmlFor="fp-keywords">
              {t('dialogs.fileProperties.fieldKeywords')}
            </label>
            <input
              id="fp-keywords"
              data-testid="fp-keywords"
              style={inputStyle}
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder={t('dialogs.fileProperties.fieldKeywordsPlaceholder')}
            />
          </div>
          <div style={rowStyle}>
            <label style={labelStyle} htmlFor="fp-category">
              {t('dialogs.fileProperties.fieldCategory')}
            </label>
            <input
              id="fp-category"
              data-testid="fp-category"
              style={inputStyle}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </div>
          <div style={rowStyle}>
            <label style={labelStyle} htmlFor="fp-description">
              {t('dialogs.fileProperties.fieldDescription')}
            </label>
            <textarea
              id="fp-description"
              data-testid="fp-description"
              style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </section>

        <section style={{ ...sectionStyle, marginTop: 16 }}>
          <h3 style={sectionTitleStyle}>{t('dialogs.fileProperties.sectionFileInfo')}</h3>
          <div style={rowStyle}>
            <span style={labelStyle}>{t('dialogs.fileProperties.fileName')}</span>
            <span style={readonlyValueStyle} data-testid="fp-fileName">
              {sanitize(fileName)}
            </span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>{t('dialogs.fileProperties.size')}</span>
            <span style={readonlyValueStyle} data-testid="fp-size">
              {typeof sizeBytes === 'number' ? formatSize(sizeBytes) : '—'}
            </span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>{t('dialogs.fileProperties.lastModifiedBy')}</span>
            <span style={readonlyValueStyle} data-testid="fp-lastModifiedBy">
              {sanitize(current?.lastModifiedBy)}
            </span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>{t('dialogs.fileProperties.revision')}</span>
            <span style={readonlyValueStyle}>{current?.revision ?? '—'}</span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>{t('dialogs.fileProperties.created')}</span>
            <span style={readonlyValueStyle}>{formatDate(current?.created)}</span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>{t('dialogs.fileProperties.modified')}</span>
            <span style={readonlyValueStyle}>{formatDate(current?.modified)}</span>
          </div>
        </section>
      </div>
    </Dialog>
  );
}
