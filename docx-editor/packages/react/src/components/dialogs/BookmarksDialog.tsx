/**
 * Bookmarks Dialog (Phase 1.5 U14).
 *
 * Insert > Bookmark surfaces the bookmarks already parsed from the
 * document (`paragraph.attrs.bookmarks`) and round-tripped through PM
 * conversion. v1 scope: list + go-to. Insert / delete bookmark
 * mutations live as separate commands to be wired later.
 */
import React, { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from '../../i18n';
import { FocusTrap } from '../ui/FocusTrap';

export interface BookmarkEntry {
  /** Stable bookmark id (paraId of the host paragraph). */
  paraId: string;
  /** Bookmark name as authored. */
  name: string;
}

export interface BookmarksDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Bookmark list collected from the live PM doc. */
  bookmarks: BookmarkEntry[];
  /** Called when the user clicks Go-to on an entry. */
  onGoTo: (paraId: string) => void;
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
  minWidth: 'min(420px, calc(100vw - 32px))',
  maxWidth: 540,
  width: '100%',
  margin: 'clamp(8px, 2.5vw, 20px)',
  display: 'flex',
  flexDirection: 'column',
};

const headerStyle: CSSProperties = {
  padding: '16px 20px 12px',
  borderBottom: '1px solid var(--doc-border)',
  fontSize: 16,
  fontWeight: 600,
};

const bodyStyle: CSSProperties = {
  padding: '12px 20px',
  maxHeight: '60vh',
  overflowY: 'auto',
};

const emptyStyle: CSSProperties = {
  padding: '24px 8px',
  textAlign: 'center',
  fontSize: 13,
  color: 'var(--doc-text-muted)',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '8px 4px',
  borderBottom: '1px solid var(--doc-border-light, #f0eee9)',
};

const nameStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--doc-text-on-surface)',
  flex: 1,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const goToBtnStyle: CSSProperties = {
  fontSize: 12,
  padding: '4px 10px',
  borderRadius: 4,
  border: '1px solid var(--doc-border)',
  background: 'var(--doc-surface)',
  color: 'var(--doc-text-on-surface)',
  cursor: 'pointer',
};

const footerStyle: CSSProperties = {
  padding: '12px 20px',
  borderTop: '1px solid var(--doc-border)',
  display: 'flex',
  justifyContent: 'flex-end',
};

const closeBtnStyle: CSSProperties = {
  fontSize: 13,
  padding: '6px 16px',
  borderRadius: 4,
  border: '1px solid var(--doc-border)',
  background: 'var(--doc-surface)',
  color: 'var(--doc-text-on-surface)',
  cursor: 'pointer',
};

export function BookmarksDialog({
  isOpen,
  onClose,
  bookmarks,
  onGoTo,
}: BookmarksDialogProps): React.ReactElement | null {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (isOpen) setFilter('');
  }, [isOpen]);

  if (!isOpen) return null;

  const filtered = filter
    ? bookmarks.filter((b) => b.name.toLowerCase().includes(filter.toLowerCase()))
    : bookmarks;

  return (
    <div
      style={overlayStyle}
      onMouseDown={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <FocusTrap>
        <div
          style={dialogStyle}
          onMouseDown={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={t('dialogs.bookmarks.title')}
          data-testid="bookmarks-dialog"
        >
          <div style={headerStyle}>{t('dialogs.bookmarks.title')}</div>
          <div style={bodyStyle}>
            {bookmarks.length > 0 && (
              <input
                type="text"
                placeholder={t('dialogs.bookmarks.filterPlaceholder')}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  border: '1px solid var(--doc-border)',
                  borderRadius: 4,
                  fontSize: 13,
                  marginBottom: 8,
                  boxSizing: 'border-box',
                }}
                data-testid="bookmarks-filter"
              />
            )}
            {bookmarks.length === 0 ? (
              <div style={emptyStyle}>{t('dialogs.bookmarks.noBookmarks')}</div>
            ) : filtered.length === 0 ? (
              <div style={emptyStyle}>{t('dialogs.bookmarks.noMatches')}</div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {filtered.map((b) => (
                  <li key={b.paraId + ':' + b.name} style={rowStyle}>
                    <span style={nameStyle} title={b.name}>
                      {b.name}
                    </span>
                    <button
                      type="button"
                      style={goToBtnStyle}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        onGoTo(b.paraId);
                        onClose();
                      }}
                      data-testid={`bookmarks-goto-${b.name}`}
                    >
                      {t('dialogs.bookmarks.goTo')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div style={footerStyle}>
            <button type="button" style={closeBtnStyle} onClick={onClose}>
              {t('common.close')}
            </button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
