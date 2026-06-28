/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Hyperlink Dialog Component
 *
 * Modal dialog for inserting and editing hyperlinks in the document.
 * Supports both external URLs and internal bookmark links.
 *
 * Migrated onto the shared <Dialog> shell in Phase 7 — the shell
 * handles backdrop / blur / scale-in motion / close X / focus trap /
 * Esc dismissal. This file only describes the body form (URL/bookmark
 * tabs, display text, tooltip) + footer action row.
 *
 * Features:
 * - Input for URL (http, https, mailto, tel, etc.)
 * - Input for display text
 * - Edit existing hyperlinks
 * - Remove hyperlink option
 * - Internal bookmark selection
 * - Validation and error handling
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { useTranslation } from '../../i18n';
import { Dialog } from '../ui/Dialog';

// ============================================================================
// TYPES
// ============================================================================

import type { HyperlinkData } from './useHyperlinkDialog';
export type { HyperlinkData };

export interface BookmarkOption {
  /** Bookmark name/ID */
  name: string;
  /** Optional display label */
  label?: string;
}

export interface HyperlinkDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback when dialog is closed */
  onClose: () => void;
  /** Callback when hyperlink is inserted/updated */
  onSubmit: (data: HyperlinkData) => void;
  /** Callback when hyperlink is removed */
  onRemove?: () => void;
  /** Initial data for editing existing hyperlink */
  initialData?: HyperlinkData;
  /** Currently selected text (used as default display text) */
  selectedText?: string;
  /** Whether we're editing an existing hyperlink */
  isEditing?: boolean;
  /** Available bookmarks for internal links */
  bookmarks?: BookmarkOption[];
  /** Additional CSS class (kept for backwards compat, currently unused
   *  by the new shell). */
  className?: string;
  /** Additional inline styles (kept for backwards compat). */
  style?: CSSProperties;
}

// ============================================================================
// STYLES — body / form only. Shell chrome lives in <Dialog>.
// ============================================================================

const FORM_GROUP_STYLE: CSSProperties = {
  marginBottom: '16px',
};

const LABEL_STYLE: CSSProperties = {
  display: 'block',
  marginBottom: '6px',
  fontSize: '13px',
  fontWeight: 500,
  color: 'var(--doc-text)',
  letterSpacing: '-0.003em',
};

const INPUT_STYLE: CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  border: '1px solid var(--doc-border)',
  borderRadius: '6px',
  fontSize: '14px',
  boxSizing: 'border-box',
  outline: 'none',
  background: 'var(--doc-surface)',
  color: 'var(--doc-text)',
  transition: 'border-color var(--doc-anim-fast), box-shadow var(--doc-anim-fast)',
};

const INPUT_ERROR_STYLE: CSSProperties = {
  ...INPUT_STYLE,
  borderColor: 'var(--doc-error)',
};

const SELECT_STYLE: CSSProperties = {
  ...INPUT_STYLE,
  cursor: 'pointer',
};

const ERROR_TEXT_STYLE: CSSProperties = {
  color: 'var(--doc-error)',
  fontSize: '12px',
  marginTop: '6px',
};

const HINT_TEXT_STYLE: CSSProperties = {
  color: 'var(--doc-text-muted)',
  fontSize: '12px',
  marginTop: '6px',
};

const TAB_CONTAINER_STYLE: CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid var(--doc-border-light)',
  marginBottom: '16px',
  gap: 4,
};

const TAB_BUTTON_STYLE: CSSProperties = {
  padding: '8px 14px',
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  fontSize: '13px',
  color: 'var(--doc-text-muted)',
  borderBottom: '2px solid transparent',
  marginBottom: '-1px',
  transition: 'color var(--doc-anim-fast)',
};

const TAB_BUTTON_ACTIVE_STYLE: CSSProperties = {
  ...TAB_BUTTON_STYLE,
  color: 'var(--doc-primary)',
  borderBottomColor: 'var(--doc-primary)',
  fontWeight: 600,
};

const BUTTON_BASE_STYLE: CSSProperties = {
  padding: '7px 16px',
  borderRadius: '6px',
  fontSize: '13px',
  fontWeight: 500,
  cursor: 'pointer',
  border: '1px solid transparent',
  transition: 'background var(--doc-anim-fast)',
};

const PRIMARY_BUTTON_STYLE: CSSProperties = {
  ...BUTTON_BASE_STYLE,
  backgroundColor: 'var(--doc-primary)',
  borderColor: 'var(--doc-primary)',
  color: 'white',
};

const SECONDARY_BUTTON_STYLE: CSSProperties = {
  ...BUTTON_BASE_STYLE,
  backgroundColor: 'var(--doc-surface)',
  color: 'var(--doc-text)',
  borderColor: 'var(--doc-border)',
};

const DANGER_BUTTON_STYLE: CSSProperties = {
  ...BUTTON_BASE_STYLE,
  backgroundColor: 'transparent',
  color: 'var(--doc-error)',
  borderColor: 'var(--doc-border)',
};

const DISABLED_BUTTON_STYLE: CSSProperties = {
  ...PRIMARY_BUTTON_STYLE,
  opacity: 0.5,
  cursor: 'not-allowed',
};

// ============================================================================
// URL VALIDATION
// ============================================================================

/**
 * Validate URL format. Accepts http, https, mailto, tel, ftp, sftp,
 * file. Returns true when the input looks like a URL we can normalise
 * into a real link.
 */
export function isValidUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (/^(https?|ftp|sftp|file|mailto|tel|sms):/i.test(trimmed)) {
    try {
      // mailto: and tel: don't parse via URL() in all engines.
      if (/^(mailto|tel|sms):/i.test(trimmed)) return true;
      // eslint-disable-next-line no-new
      new URL(trimmed);
      return true;
    } catch {
      return false;
    }
  }
  // Allow bare domain forms — normalize will prefix https://
  return /^[^\s]+\.[^\s]+$/.test(trimmed);
}

/**
 * Normalize a URL into a canonical form for storage.
 */
export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (/^(https?|ftp|sftp|file|mailto|tel|sms):/i.test(trimmed)) {
    return trimmed;
  }
  // Email-ish patterns become mailto:
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return `mailto:${trimmed}`;
  }
  // Phone-ish patterns become tel:
  if (/^\+?[\d\s\-().]{7,}$/.test(trimmed)) {
    return `tel:${trimmed.replace(/[^\d+]/g, '')}`;
  }
  return `https://${trimmed}`;
}

/**
 * Classify a URL for downstream handling. Currently informational —
 * exposed for tests + future per-type UI hints.
 */
export function getUrlType(url: string): 'web' | 'email' | 'phone' | 'ftp' | 'unknown' {
  if (/^mailto:/i.test(url)) return 'email';
  if (/^tel:/i.test(url)) return 'phone';
  if (/^(ftp|sftp):/i.test(url)) return 'ftp';
  if (/^https?:/i.test(url)) return 'web';
  return 'unknown';
}

// ============================================================================
// COMPONENT
// ============================================================================

type LinkType = 'url' | 'bookmark';

export function HyperlinkDialog({
  isOpen,
  onClose,
  onSubmit,
  onRemove,
  initialData,
  selectedText = '',
  isEditing = false,
  bookmarks = [],
}: HyperlinkDialogProps): React.ReactElement | null {
  const { t } = useTranslation();

  const [linkType, setLinkType] = useState<LinkType>('url');
  const [url, setUrl] = useState('');
  const [displayText, setDisplayText] = useState('');
  const [bookmark, setBookmark] = useState('');
  const [tooltip, setTooltip] = useState('');
  const [urlError, setUrlError] = useState('');
  const [touched, setTouched] = useState(false);

  const urlInputRef = useRef<HTMLInputElement>(null);
  const bookmarkSelectRef = useRef<HTMLSelectElement>(null);

  // Initialize form with initial data or selected text
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        if (initialData.bookmark) {
          setLinkType('bookmark');
          setBookmark(initialData.bookmark);
        } else {
          setLinkType('url');
          setUrl(initialData.url || '');
        }
        setDisplayText(initialData.displayText || '');
        setTooltip(initialData.tooltip || '');
      } else {
        setLinkType('url');
        setUrl('');
        setDisplayText(selectedText);
        setBookmark('');
        setTooltip('');
      }
      setUrlError('');
      setTouched(false);
    }
  }, [isOpen, initialData, selectedText]);

  // Focus input when dialog opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (linkType === 'url') {
          urlInputRef.current?.focus();
        } else {
          bookmarkSelectRef.current?.focus();
        }
      }, 100);
    }
  }, [isOpen, linkType]);

  const validateUrl = useCallback(() => {
    if (linkType === 'url' && url.trim()) {
      if (!isValidUrl(url)) {
        setUrlError(t('dialogs.hyperlink.invalidUrl'));
      } else {
        setUrlError('');
      }
    } else {
      setUrlError('');
    }
  }, [linkType, url, t]);

  const handleSubmit = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      if (linkType === 'url') {
        if (!url.trim()) {
          setUrlError(t('dialogs.hyperlink.urlRequired'));
          setTouched(true);
          return;
        }
        if (!isValidUrl(url)) {
          setUrlError(t('dialogs.hyperlink.invalidUrl'));
          setTouched(true);
          return;
        }
      } else if (linkType === 'bookmark') {
        if (!bookmark) return;
      }

      const data: HyperlinkData = {
        displayText: displayText.trim() || undefined,
        tooltip: tooltip.trim() || undefined,
      };
      if (linkType === 'url') {
        data.url = normalizeUrl(url);
      } else {
        data.bookmark = bookmark;
      }
      onSubmit(data);
    },
    [linkType, url, bookmark, displayText, tooltip, onSubmit, t]
  );

  const hasBookmarks = bookmarks.length > 0;
  const canSubmit =
    (linkType === 'url' && url.trim() && !urlError) || (linkType === 'bookmark' && bookmark);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={
        <span id="hyperlink-dialog-title">
          {isEditing ? t('dialogs.hyperlink.titleEdit') : t('dialogs.hyperlink.titleInsert')}
        </span>
      }
      width={520}
      testId="hyperlink-dialog"
      footer={
        <>
          {isEditing && onRemove && (
            <button
              type="button"
              className="docx-hyperlink-dialog-remove"
              style={{ ...DANGER_BUTTON_STYLE, marginRight: 'auto' }}
              onClick={onRemove}
            >
              {t('dialogs.hyperlink.removeLink')}
            </button>
          )}
          <button
            type="button"
            className="docx-hyperlink-dialog-cancel"
            style={SECONDARY_BUTTON_STYLE}
            onClick={onClose}
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            className="docx-hyperlink-dialog-submit"
            style={canSubmit ? PRIMARY_BUTTON_STYLE : DISABLED_BUTTON_STYLE}
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {isEditing ? t('common.update') : t('common.insert')}
          </button>
        </>
      }
    >
      <form
        // Legacy classes kept for backwards-compat with the
        // hyperlinks.spec.ts e2e selectors that pre-date the Phase 7
        // <Dialog> migration. `docx-hyperlink-dialog` is the wrapper
        // they look for; `docx-hyperlink-dialog-body` was the form's
        // original class.
        className="docx-hyperlink-dialog docx-hyperlink-dialog-body"
        onSubmit={handleSubmit}
        // Submit-on-Enter falls back to the form. preventDefault inside
        // handleSubmit keeps the dialog from closing on validation
        // failure.
      >
        {hasBookmarks && (
          <div className="docx-hyperlink-dialog-tabs" style={TAB_CONTAINER_STYLE} role="tablist">
            <button
              type="button"
              role="tab"
              className={`docx-hyperlink-dialog-tab ${linkType === 'url' ? 'active' : ''}`}
              style={linkType === 'url' ? TAB_BUTTON_ACTIVE_STYLE : TAB_BUTTON_STYLE}
              onClick={() => setLinkType('url')}
              aria-selected={linkType === 'url'}
            >
              {t('dialogs.hyperlink.tabWebAddress')}
            </button>
            <button
              type="button"
              role="tab"
              className={`docx-hyperlink-dialog-tab ${linkType === 'bookmark' ? 'active' : ''}`}
              style={linkType === 'bookmark' ? TAB_BUTTON_ACTIVE_STYLE : TAB_BUTTON_STYLE}
              onClick={() => setLinkType('bookmark')}
              aria-selected={linkType === 'bookmark'}
            >
              {t('dialogs.hyperlink.tabBookmark')}
            </button>
          </div>
        )}

        {linkType === 'url' && (
          <div className="docx-hyperlink-dialog-field" style={FORM_GROUP_STYLE}>
            <label htmlFor="hyperlink-url" style={LABEL_STYLE}>
              {t('dialogs.hyperlink.urlLabel')}
            </label>
            <input
              ref={urlInputRef}
              id="hyperlink-url"
              type="text"
              className="docx-hyperlink-dialog-input"
              style={urlError && touched ? INPUT_ERROR_STYLE : INPUT_STYLE}
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (touched) setUrlError('');
              }}
              onBlur={() => {
                setTouched(true);
                validateUrl();
              }}
              placeholder={t('dialogs.hyperlink.urlPlaceholder')}
              aria-invalid={!!urlError}
              aria-describedby={urlError ? 'url-error' : 'url-hint'}
            />
            {urlError && touched && (
              <div id="url-error" style={ERROR_TEXT_STYLE}>
                {urlError}
              </div>
            )}
            {!urlError && (
              <div id="url-hint" style={HINT_TEXT_STYLE}>
                {t('dialogs.hyperlink.urlHint')}
              </div>
            )}
          </div>
        )}

        {linkType === 'bookmark' && (
          <div className="docx-hyperlink-dialog-field" style={FORM_GROUP_STYLE}>
            <label htmlFor="hyperlink-bookmark" style={LABEL_STYLE}>
              {t('dialogs.hyperlink.bookmarkLabel')}
            </label>
            <select
              ref={bookmarkSelectRef}
              id="hyperlink-bookmark"
              className="docx-hyperlink-dialog-select"
              style={SELECT_STYLE}
              value={bookmark}
              onChange={(e) => setBookmark(e.target.value)}
            >
              <option value="">{t('dialogs.hyperlink.bookmarkPlaceholder')}</option>
              {bookmarks.map((bm) => (
                <option key={bm.name} value={bm.name}>
                  {bm.label || bm.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="docx-hyperlink-dialog-field" style={FORM_GROUP_STYLE}>
          <label htmlFor="hyperlink-display-text" style={LABEL_STYLE}>
            {t('dialogs.hyperlink.displayTextLabel')}
          </label>
          <input
            id="hyperlink-display-text"
            type="text"
            className="docx-hyperlink-dialog-input"
            style={INPUT_STYLE}
            value={displayText}
            onChange={(e) => setDisplayText(e.target.value)}
            placeholder={t('dialogs.hyperlink.displayTextPlaceholder')}
          />
          <div style={HINT_TEXT_STYLE}>{t('dialogs.hyperlink.displayTextHint')}</div>
        </div>

        <div className="docx-hyperlink-dialog-field" style={FORM_GROUP_STYLE}>
          <label htmlFor="hyperlink-tooltip" style={LABEL_STYLE}>
            {t('dialogs.hyperlink.tooltipLabel')}
          </label>
          <input
            id="hyperlink-tooltip"
            type="text"
            className="docx-hyperlink-dialog-input"
            style={INPUT_STYLE}
            value={tooltip}
            onChange={(e) => setTooltip(e.target.value)}
            placeholder={t('dialogs.hyperlink.tooltipPlaceholder')}
          />
        </div>
      </form>
    </Dialog>
  );
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create HyperlinkData from a URL string
 */
export function createHyperlinkData(url: string, displayText?: string): HyperlinkData {
  return {
    url: normalizeUrl(url),
    displayText,
  };
}

/**
 * Create HyperlinkData for an internal bookmark
 */
export function createBookmarkLinkData(bookmark: string, displayText?: string): HyperlinkData {
  return {
    bookmark,
    displayText,
  };
}

/**
 * Check if HyperlinkData is for an external URL
 */
export function isExternalHyperlinkData(data: HyperlinkData): boolean {
  return !!data.url && !data.bookmark;
}

/**
 * Check if HyperlinkData is for an internal bookmark
 */
export function isBookmarkHyperlinkData(data: HyperlinkData): boolean {
  return !!data.bookmark;
}

/**
 * Get display text from HyperlinkData, falling back to URL/bookmark
 */
export function getDisplayText(data: HyperlinkData): string {
  if (data.displayText) return data.displayText;
  if (data.url) return data.url.replace(/^https?:\/\//, '');
  if (data.bookmark) return data.bookmark;
  return '';
}

/**
 * Convert email address to mailto: link
 */
export function emailToMailto(email: string): string {
  if (email.startsWith('mailto:')) return email;
  return `mailto:${email}`;
}

/**
 * Convert phone number to tel: link
 */
export function phoneToTel(phone: string): string {
  if (phone.startsWith('tel:')) return phone;
  const cleaned = phone.replace(/[\s\-().]/g, '');
  return `tel:${cleaned}`;
}

/**
 * Extract bookmarks from document for the dialog
 */
export function extractBookmarksForDialog(
  bookmarks: { name: string; id: number }[]
): BookmarkOption[] {
  return bookmarks
    .filter((bm) => !bm.name.startsWith('_'))
    .map((bm) => ({ name: bm.name, label: bm.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ============================================================================
// HOOK — moved to `./useHyperlinkDialog.ts`. Re-exported below.
// ============================================================================
export {
  useHyperlinkDialog,
  type UseHyperlinkDialogState,
  type UseHyperlinkDialogReturn,
} from './useHyperlinkDialog';

export default HyperlinkDialog;
