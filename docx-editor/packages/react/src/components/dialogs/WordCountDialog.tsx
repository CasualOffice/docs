/**
 * Word Count dialog — Google Docs / Word parity.
 *
 * Surfaces the full count breakdown that the status bar can't fit:
 * pages, words, characters (with spaces), characters (no spaces),
 * paragraphs. Triggered from the menu or via Ctrl+Shift+C, which
 * matches Google Docs.
 *
 * Computation lives in the parent (DocxEditor) — this dialog is a
 * pure presenter. Recomputing here would re-walk the document on
 * every render even when closed.
 */

import React, { useCallback, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { FocusTrap } from '../ui/FocusTrap';
import { useTranslation } from '../../i18n';

export interface WordCountStats {
  words: number;
  /** Characters including spaces. */
  characters: number;
  /** Characters excluding whitespace. Matches Word's "Characters
   *  (no spaces)" row. */
  charactersNoSpaces: number;
  /** Total pages, or undefined if pagination hasn't run yet. */
  pages?: number;
  /** Paragraphs with at least one non-whitespace character. */
  paragraphs: number;
}

export interface WordCountDialogProps {
  isOpen: boolean;
  onClose: () => void;
  stats: WordCountStats;
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
  minWidth: 320,
  maxWidth: 420,
  width: '100%',
  margin: 'clamp(8px, 2.5vw, 20px)',
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
  gap: 10,
};

const rowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  fontSize: 13,
};

const labelStyle: CSSProperties = {
  color: 'var(--doc-text-muted, #555)',
};

const valueStyle: CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  fontWeight: 500,
};

const footerStyle: CSSProperties = {
  padding: '12px 20px',
  borderTop: '1px solid var(--doc-border, #ddd)',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
};

const buttonStyle: CSSProperties = {
  padding: '6px 14px',
  borderRadius: 4,
  border: '1px solid var(--doc-border, #ccc)',
  background: 'var(--doc-bg-hover, #f5f5f5)',
  color: 'var(--doc-text-on-surface, #1f2937)',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
};

export function WordCountDialog({
  isOpen,
  onClose,
  stats,
}: WordCountDialogProps): React.ReactElement | null {
  const { t } = useTranslation();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      style={overlayStyle}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <FocusTrap>
        <div
          style={dialogStyle}
          role="dialog"
          aria-modal="true"
          aria-labelledby="word-count-dialog-title"
        >
          <div id="word-count-dialog-title" style={headerStyle}>
            {t('dialogs.wordCount.title')}
          </div>
          <div style={bodyStyle}>
            {stats.pages !== undefined && (
              <Row label={t('dialogs.wordCount.pages')} value={stats.pages} />
            )}
            <Row label={t('dialogs.wordCount.words')} value={stats.words} />
            <Row label={t('dialogs.wordCount.characters')} value={stats.characters} />
            <Row
              label={t('dialogs.wordCount.charactersNoSpaces')}
              value={stats.charactersNoSpaces}
            />
            <Row label={t('dialogs.wordCount.paragraphs')} value={stats.paragraphs} />
            {stats.words > 0 &&
              (() => {
                // 200 wpm baseline — same convention as the status-bar
                // estimate. Rounded up so users over-budget rather than
                // under, and shown as a `~N min` string (the dialog cell
                // expects a value, so we render via a number-as-label trick).
                const minutes = Math.max(1, Math.ceil(stats.words / 200));
                return <Row label={t('dialogs.wordCount.readingTime')} value={`~${minutes} min`} />;
              })()}
          </div>
          <div style={footerStyle}>
            <button
              type="button"
              onClick={onClose}
              style={buttonStyle}
              data-testid="word-count-dialog-close"
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number | string }): React.ReactElement {
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <span style={valueStyle}>{typeof value === 'number' ? value.toLocaleString() : value}</span>
    </div>
  );
}

export default WordCountDialog;
