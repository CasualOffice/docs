/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Word Count dialog — Google Docs / Word parity.
 *
 * Surfaces the full count breakdown that the status bar can't fit:
 * pages, words, characters (with spaces), characters (no spaces),
 * paragraphs, plus a reading-time estimate. Triggered from the menu
 * or via Ctrl+Shift+C, which matches Google Docs.
 *
 * Migrated onto the shared <Dialog> shell in Phase 7 — the shell
 * handles backdrop / blur / scale-in motion / close X / focus trap /
 * Esc dismissal. This file only describes the body rows + footer
 * close button.
 *
 * Computation lives in the parent (DocxEditor) — this dialog is a
 * pure presenter. Recomputing here would re-walk the document on
 * every render even when closed.
 */

import React from 'react';
import type { CSSProperties } from 'react';
import { Dialog } from '../ui/Dialog';
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

const bodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const rowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  fontSize: 14,
  padding: '8px 0',
  borderBottom: '1px solid var(--doc-border-light)',
};

const lastRowStyle: CSSProperties = {
  ...rowStyle,
  borderBottom: 'none',
};

const labelStyle: CSSProperties = {
  color: 'var(--doc-text-muted)',
  fontWeight: 400,
};

const valueStyle: CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  fontWeight: 500,
  color: 'var(--doc-text)',
  letterSpacing: '-0.005em',
};

const closeBtnStyle: CSSProperties = {
  padding: '7px 16px',
  borderRadius: 6,
  border: '1px solid var(--doc-border)',
  background: 'var(--doc-surface)',
  color: 'var(--doc-text)',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  transition:
    'background 80ms cubic-bezier(0.4, 0, 0.2, 1), border-color 80ms cubic-bezier(0.4, 0, 0.2, 1)',
};

export function WordCountDialog({
  isOpen,
  onClose,
  stats,
}: WordCountDialogProps): React.ReactElement | null {
  const { t } = useTranslation();

  // Rows are built declaratively so the last row can drop its bottom
  // border (visual rhythm — hairline divider between every row except
  // the final one).
  const rows: { label: string; value: number | string }[] = [];
  if (stats.pages !== undefined) {
    rows.push({ label: t('dialogs.wordCount.pages'), value: stats.pages });
  }
  rows.push({ label: t('dialogs.wordCount.words'), value: stats.words });
  rows.push({ label: t('dialogs.wordCount.characters'), value: stats.characters });
  rows.push({
    label: t('dialogs.wordCount.charactersNoSpaces'),
    value: stats.charactersNoSpaces,
  });
  rows.push({ label: t('dialogs.wordCount.paragraphs'), value: stats.paragraphs });
  if (stats.words > 0) {
    // 200 wpm baseline — same convention as the status-bar estimate.
    // Rounded up so users over-budget rather than under.
    const minutes = Math.max(1, Math.ceil(stats.words / 200));
    rows.push({ label: t('dialogs.wordCount.readingTime'), value: `~${minutes} min` });
  }

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={t('dialogs.wordCount.title')}
      width={400}
      testId="word-count-dialog"
      footer={
        <button
          type="button"
          onClick={onClose}
          style={closeBtnStyle}
          data-testid="word-count-dialog-close"
        >
          {t('common.close')}
        </button>
      }
    >
      <div style={bodyStyle}>
        {rows.map((r, i) => (
          <Row key={r.label} label={r.label} value={r.value} isLast={i === rows.length - 1} />
        ))}
      </div>
    </Dialog>
  );
}

function Row({
  label,
  value,
  isLast,
}: {
  label: string;
  value: number | string;
  isLast: boolean;
}): React.ReactElement {
  return (
    <div style={isLast ? lastRowStyle : rowStyle}>
      <span style={labelStyle}>{label}</span>
      <span style={valueStyle}>{typeof value === 'number' ? value.toLocaleString() : value}</span>
    </div>
  );
}

export default WordCountDialog;
