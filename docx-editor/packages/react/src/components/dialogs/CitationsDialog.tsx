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
import type { Citation, CitationStyle } from '../../utils/citations';
import { formatCitation } from '../../utils/citations';

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
  minWidth: 520,
  maxWidth: 640,
  width: '100%',
  margin: 20,
};

const headerStyle: CSSProperties = {
  padding: '16px 20px 12px',
  borderBottom: '1px solid var(--doc-border, #ddd)',
  fontSize: 16,
  fontWeight: 600,
  color: 'var(--doc-text-on-surface, #1f2937)',
};

const bodyStyle: CSSProperties = {
  padding: '16px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  maxHeight: '60vh',
  overflowY: 'auto',
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

const secondaryBtnStyle: CSSProperties = {
  ...btnBase,
  border: '1px solid var(--doc-border, #d1d5db)',
  background: 'transparent',
  color: 'var(--doc-text-on-surface, #1f2937)',
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

const footerStyle: CSSProperties = {
  padding: '12px 20px 16px',
  borderTop: '1px solid var(--doc-border, #ddd)',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
};

export function CitationsDialog({
  isOpen,
  onClose,
  citations,
  onAdd,
  onDelete,
  onInsert,
}: CitationsDialogProps) {
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

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

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
    <div
      className="ep-dialog-overlay"
      style={overlayStyle}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="ep-dialog-shell"
        style={dialogStyle}
        role="dialog"
        aria-label="Citations"
        data-testid="citations-dialog"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={headerStyle}>Citations</div>
        <div style={bodyStyle}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={sectionLabelStyle}>Add a citation</div>
            <div style={formRowStyle}>
              <input
                type="text"
                placeholder="Author (e.g. Knuth, D.)"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                style={inputStyle}
                data-testid="citation-author"
              />
              <input
                type="text"
                placeholder="Year"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                style={inputStyle}
                data-testid="citation-year"
              />
              <input
                type="text"
                placeholder="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{ ...inputStyle, gridColumn: '1 / span 2' }}
                data-testid="citation-title"
              />
              <input
                type="text"
                placeholder="URL (optional)"
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
                Save citation
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={sectionLabelStyle}>
              Saved citations{citations.length > 0 ? ` (${citations.length})` : ''}
            </div>
            <div style={styleRowStyle}>
              <span>Format:</span>
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
                No citations saved yet.
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
                        Insert
                      </button>
                      <button
                        type="button"
                        style={deleteBtnStyle}
                        data-testid={`citation-delete-${c.id}`}
                        onClick={() => onDelete(c.id)}
                        aria-label={`Delete citation: ${c.title}`}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <div style={footerStyle}>
          <button type="button" style={secondaryBtnStyle} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default CitationsDialog;
