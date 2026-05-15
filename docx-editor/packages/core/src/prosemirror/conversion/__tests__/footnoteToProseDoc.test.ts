/**
 * Acceptance tests for #378 — footnote rendering routes through the body
 * pipeline so block-kind support (table, image, fields) reaches footnotes.
 *
 * Pre-PR, `convertFootnoteToContent` re-implemented run/paragraph conversion
 * by hand and silently dropped any non-paragraph content. This test exercises
 * the new converter (`footnoteToProseDoc`) which mirrors the HF unification —
 * a footnote's `content: (Paragraph | Table)[]` flows through the same
 * `toProseDoc` machinery that the body uses.
 */

import { describe, test, expect } from 'bun:test';
import { footnoteToProseDoc } from '../toProseDoc';
import { toFlowBlocks } from '../../../layout-bridge';
import type { Paragraph, Table } from '../../../types/document';

function paragraph(text: string): Paragraph {
  return {
    type: 'paragraph',
    content: [
      {
        type: 'run',
        content: [{ type: 'text', text }],
      },
    ],
  };
}

function emptyTable(): Table {
  return {
    type: 'table',
    rows: [
      {
        type: 'tableRow',
        cells: [
          {
            type: 'tableCell',
            content: [paragraph('cell text')],
          },
        ],
      },
    ],
  };
}

describe('footnoteToProseDoc — body-pipeline routing (#378)', () => {
  test('paragraph-only footnote produces a paragraph PM node', () => {
    const pmDoc = footnoteToProseDoc([paragraph('hello')]);
    expect(pmDoc.type.name).toBe('doc');
    expect(pmDoc.childCount).toBe(1);
    expect(pmDoc.firstChild?.type.name).toBe('paragraph');
    expect(pmDoc.firstChild?.textContent).toBe('hello');
  });

  test('footnote with a table produces a table PM node (acceptance)', () => {
    // Pre-PR: a footnote-with-table silently dropped the table during
    // conversion. With the body pipeline the table is preserved.
    const pmDoc = footnoteToProseDoc([paragraph('intro'), emptyTable()]);

    expect(pmDoc.childCount).toBe(2);
    expect(pmDoc.firstChild?.type.name).toBe('paragraph');
    expect(pmDoc.lastChild?.type.name).toBe('table');
  });

  test('footnote-with-table flows through toFlowBlocks as a table block', () => {
    // End-to-end: the table reaches the layout-bridge as a `kind: 'table'`
    // block, ready to be measured + rendered like any body table.
    const pmDoc = footnoteToProseDoc([paragraph('intro'), emptyTable()]);
    const blocks = toFlowBlocks(pmDoc, {});

    const tableBlock = blocks.find((b) => b.kind === 'table');
    expect(tableBlock).toBeDefined();
    expect(tableBlock?.kind).toBe('table');
  });

  test('empty footnote content produces a single empty paragraph', () => {
    // Same fallback as headerFooterToProseDoc — if no content is present,
    // emit one empty paragraph so PM has a valid doc.
    const pmDoc = footnoteToProseDoc([]);
    expect(pmDoc.childCount).toBe(1);
    expect(pmDoc.firstChild?.type.name).toBe('paragraph');
    expect(pmDoc.firstChild?.textContent).toBe('');
  });

  test('multiple paragraphs preserve order', () => {
    const pmDoc = footnoteToProseDoc([paragraph('first'), paragraph('second'), paragraph('third')]);
    expect(pmDoc.childCount).toBe(3);
    expect(pmDoc.child(0).textContent).toBe('first');
    expect(pmDoc.child(1).textContent).toBe('second');
    expect(pmDoc.child(2).textContent).toBe('third');
  });

  test('paragraph + table + paragraph preserves interleaved order', () => {
    const pmDoc = footnoteToProseDoc([paragraph('before'), emptyTable(), paragraph('after')]);
    expect(pmDoc.childCount).toBe(3);
    expect(pmDoc.child(0).type.name).toBe('paragraph');
    expect(pmDoc.child(1).type.name).toBe('table');
    expect(pmDoc.child(2).type.name).toBe('paragraph');
  });
});
