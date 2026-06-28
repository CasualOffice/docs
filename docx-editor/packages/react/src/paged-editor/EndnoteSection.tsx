/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Endnote section — rendered at the END of the document (after the last page),
 * since the paged layout-painter has no endnote area of its own. Plain-text v1,
 * styled to match the page width + the footnote area. Double-click an entry to
 * edit it (mirrors footnotes); each entry carries `data-endnote-id` so the host
 * can route the edit.
 */
import { getEndnoteText } from '@eigenpal/docx-core/docx';
import type { Endnote } from '@eigenpal/docx-core/types/content';
import type { CSSProperties } from 'react';

export interface EndnoteSectionProps {
  endnotes: Endnote[];
  /** Page content width (px) so the section lines up under the pages. */
  width?: number;
  onEditEndnote?: (endnoteId: number) => void;
}

const WRAP: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  padding: '0 0 32px',
};

const CARD: CSSProperties = {
  // Paper colors, not app-surface tokens: this card is document content on
  // the page. `--doc-surface` swaps dark under [data-theme="dark"], which put
  // black endnote text (color below) on a dark card — invisible.
  background: '#fff',
  boxShadow: '0 1px 3px rgba(60,64,67,0.15)',
  padding: '24px 48px',
  fontSize: '10px',
  lineHeight: 1.4,
  color: '#000',
  boxSizing: 'border-box',
};

const TITLE: CSSProperties = { fontWeight: 700, fontSize: '12px', marginBottom: '10px' };

const ITEM: CSSProperties = { marginBottom: '4px', cursor: 'text' };

const SUP: CSSProperties = { fontSize: '7px', marginRight: '2px' };

export function EndnoteSection({ endnotes, width, onEditEndnote }: EndnoteSectionProps) {
  const items = endnotes.filter((e) => (e.noteType ?? 'normal') === 'normal');
  if (items.length === 0) return null;

  return (
    <div style={WRAP} data-testid="endnote-section">
      <div style={{ ...CARD, width: width ?? 816 }}>
        <div style={TITLE}>Endnotes</div>
        {items.map((en, i) => (
          <div
            key={en.id}
            className="layout-endnote"
            data-endnote-id={en.id}
            style={ITEM}
            title={onEditEndnote ? 'Double-click to edit endnote' : undefined}
            onDoubleClick={() => onEditEndnote?.(en.id)}
          >
            <sup style={SUP}>{i + 1}</sup>
            <span className="layout-endnote-text">{getEndnoteText(en)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
