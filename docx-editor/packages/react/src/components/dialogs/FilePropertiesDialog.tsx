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
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10000,
};

const dialogStyle: CSSProperties = {
  backgroundColor: 'var(--doc-surface, white)',
  color: 'var(--doc-text-on-surface, #1f2937)',
  borderRadius: 8,
  boxShadow: 'var(--doc-shadow, 0 4px 20px rgba(0, 0, 0, 0.15))',
  minWidth: 460,
  maxWidth: 540,
  width: '100%',
  margin: 20,
};

const headerStyle: CSSProperties = {
  padding: '16px 20px 12px',
  borderBottom: '1px solid var(--doc-border, #ddd)',
  fontSize: 16,
  fontWeight: 600,
};

const bodyStyle: CSSProperties = {
  padding: '16px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  maxHeight: '70vh',
  overflowY: 'auto',
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

const footerStyle: CSSProperties = {
  padding: '12px 20px 16px',
  borderTop: '1px solid var(--doc-border, #ddd)',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
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

const btnStyle: CSSProperties = {
  padding: '6px 16px',
  fontSize: 13,
  border: '1px solid var(--doc-border, #ccc)',
  borderRadius: 4,
  cursor: 'pointer',
  background: 'var(--doc-surface, white)',
  color: 'var(--doc-text-on-surface, #1f2937)',
};

const primaryBtnStyle: CSSProperties = {
  ...btnStyle,
  background: 'var(--doc-primary)',
  color: 'white',
  borderColor: 'var(--doc-primary)',
};

function formatDate(d: Date | undefined): string {
  if (!d) return '—';
  try {
    return d.toLocaleString();
  } catch {
    return d.toISOString();
  }
}

export function FilePropertiesDialog({
  isOpen,
  onClose,
  onApply,
  current,
}: FilePropertiesDialogProps): React.ReactElement | null {
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

  const stop = useCallback((e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
  }, []);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="File properties"
      data-testid="file-properties-dialog"
      style={overlayStyle}
      onMouseDown={onClose}
    >
      <div style={dialogStyle} onMouseDown={stop} onClick={stop}>
        <div style={headerStyle}>File Properties</div>
        <div style={bodyStyle}>
          <section style={sectionStyle}>
            <h3 style={sectionTitleStyle}>Metadata</h3>
            <div style={rowStyle}>
              <label style={labelStyle} htmlFor="fp-title">
                Title
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
                Subject
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
                Author
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
                Keywords
              </label>
              <input
                id="fp-keywords"
                data-testid="fp-keywords"
                style={inputStyle}
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="e.g. finance; annual; report"
              />
            </div>
            <div style={rowStyle}>
              <label style={labelStyle} htmlFor="fp-category">
                Category
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
                Description
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
            <h3 style={sectionTitleStyle}>File info</h3>
            <div style={rowStyle}>
              <span style={labelStyle}>Last modified by</span>
              <span style={readonlyValueStyle} data-testid="fp-lastModifiedBy">
                {current?.lastModifiedBy ?? '—'}
              </span>
            </div>
            <div style={rowStyle}>
              <span style={labelStyle}>Revision</span>
              <span style={readonlyValueStyle}>{current?.revision ?? '—'}</span>
            </div>
            <div style={rowStyle}>
              <span style={labelStyle}>Created</span>
              <span style={readonlyValueStyle}>{formatDate(current?.created)}</span>
            </div>
            <div style={rowStyle}>
              <span style={labelStyle}>Modified</span>
              <span style={readonlyValueStyle}>{formatDate(current?.modified)}</span>
            </div>
          </section>
        </div>
        <div style={footerStyle}>
          <button type="button" style={btnStyle} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            style={primaryBtnStyle}
            data-testid="fp-apply"
            onClick={handleApply}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
