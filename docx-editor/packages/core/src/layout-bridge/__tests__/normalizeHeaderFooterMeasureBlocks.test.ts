/**
 * Unit tests for normalizeHeaderFooterMeasureBlocks.
 *
 * Covers acceptance criteria for #380 (inline-vs-inherited spacing strip)
 * and #381 (trailing empty paragraph after a table).
 */

import { describe, test, expect } from 'bun:test';
import { normalizeHeaderFooterMeasureBlocks } from '../headerFooterLayout';
import type { FlowBlock, ParagraphBlock, TableBlock } from '../../layout-engine/types';

function paragraph(opts: Partial<ParagraphBlock> = {}): ParagraphBlock {
  return {
    kind: 'paragraph',
    id: opts.id ?? 'p',
    runs: opts.runs ?? [{ kind: 'text', text: 'hi' }],
    attrs: opts.attrs,
  };
}

function emptyParagraph(opts: Partial<ParagraphBlock> = {}): ParagraphBlock {
  return paragraph({ ...opts, runs: [] });
}

function table(): TableBlock {
  return {
    kind: 'table',
    id: 't',
    rows: [],
  };
}

describe('#380 — strip inherited spacing, keep inline-explicit spacing', () => {
  test('inherited spaceBefore is zeroed', () => {
    const para = paragraph({
      attrs: { spacing: { before: 100 } },
    });
    const [out] = normalizeHeaderFooterMeasureBlocks([para]) as [ParagraphBlock];
    expect(out.attrs?.spacing?.before).toBeUndefined();
  });

  test('inline-explicit spaceBefore is preserved', () => {
    const para = paragraph({
      attrs: {
        spacing: { before: 240 },
        spacingExplicit: { before: true },
      },
    });
    const [out] = normalizeHeaderFooterMeasureBlocks([para]) as [ParagraphBlock];
    expect(out.attrs?.spacing?.before).toBe(240);
  });

  test('inherited spaceAfter is zeroed but explicit spaceBefore stays', () => {
    const para = paragraph({
      attrs: {
        spacing: { before: 240, after: 200 },
        spacingExplicit: { before: true },
      },
    });
    const [out] = normalizeHeaderFooterMeasureBlocks([para]) as [ParagraphBlock];
    expect(out.attrs?.spacing?.before).toBe(240);
    expect(out.attrs?.spacing?.after).toBeUndefined();
  });

  test('paragraphs without any spacing pass through', () => {
    const para = paragraph();
    const out = normalizeHeaderFooterMeasureBlocks([para]);
    expect(out[0]).toBe(para);
  });

  test('non-paragraph blocks pass through untouched', () => {
    const t = table();
    const [out] = normalizeHeaderFooterMeasureBlocks([t]);
    expect(out).toBe(t);
  });

  test('inherited spacing is zeroed inside table cell paragraphs too', () => {
    const t = {
      ...table(),
      rows: [
        {
          id: 'r1',
          cells: [
            {
              id: 'c1',
              blocks: [
                paragraph({
                  id: 'nested',
                  attrs: {
                    spacing: { before: 120, after: 160 },
                    spacingExplicit: { before: true },
                  },
                }),
              ],
            },
          ],
        },
      ],
    } satisfies TableBlock;

    const [out] = normalizeHeaderFooterMeasureBlocks([t]) as [TableBlock];
    const nested = out.rows[0]?.cells[0]?.blocks[0] as ParagraphBlock;
    expect(nested.attrs?.spacing?.before).toBe(120);
    expect(nested.attrs?.spacing?.after).toBeUndefined();
  });

  test('anchored image runs inside table-cell paragraphs are preserved', () => {
    const anchoredImage = {
      kind: 'image' as const,
      src: 'logo.png',
      width: 24,
      height: 24,
      position: {
        horizontal: { relativeTo: 'column', posOffset: 0 },
        vertical: { relativeTo: 'paragraph', posOffset: 0 },
      },
    };

    const t = {
      ...table(),
      rows: [
        {
          id: 'r1',
          cells: [
            {
              id: 'c1',
              blocks: [
                paragraph({
                  id: 'nested-img',
                  runs: [anchoredImage],
                }),
              ],
            },
          ],
        },
      ],
    } satisfies TableBlock;

    const [out] = normalizeHeaderFooterMeasureBlocks([t]) as [TableBlock];
    const nested = out.rows[0]?.cells[0]?.blocks[0] as ParagraphBlock;
    expect(nested.runs).toHaveLength(1);
    expect(nested.runs[0]).toEqual(anchoredImage);
  });
});

describe('#381 — trailing empty paragraph after a table is zero-height', () => {
  test('empty paragraph immediately after table gets suppressEmptyParagraphHeight', () => {
    const blocks: FlowBlock[] = [table(), emptyParagraph({ id: 'trailing' })];
    const out = normalizeHeaderFooterMeasureBlocks(blocks);
    expect(out[0]).toBe(blocks[0]);
    const trailing = out[1] as ParagraphBlock;
    expect(trailing.attrs?.suppressEmptyParagraphHeight).toBe(true);
  });

  test('non-empty paragraph after a table is NOT suppressed', () => {
    const blocks: FlowBlock[] = [table(), paragraph({ id: 'normal' })];
    const out = normalizeHeaderFooterMeasureBlocks(blocks);
    const after = out[1] as ParagraphBlock;
    expect(after.attrs?.suppressEmptyParagraphHeight).toBeUndefined();
  });

  test('empty paragraph NOT after a table is NOT suppressed', () => {
    const blocks: FlowBlock[] = [emptyParagraph({ id: 'lead' }), table()];
    const out = normalizeHeaderFooterMeasureBlocks(blocks);
    const lead = out[0] as ParagraphBlock;
    expect(lead.attrs?.suppressEmptyParagraphHeight).toBeUndefined();
  });

  test('trailing paragraph still exists in the output (click-to-position)', () => {
    const blocks: FlowBlock[] = [table(), emptyParagraph({ id: 'trailing' })];
    const out = normalizeHeaderFooterMeasureBlocks(blocks);
    expect(out.length).toBe(2);
    expect(out[1].id).toBe('trailing');
  });

  test('empty paragraph after table with bottom border is NOT suppressed (it is a horizontal rule)', () => {
    // Word lets authors place a "horizontal rule" by giving the trailing
    // empty paragraph a `<w:pBdr><w:bottom>` border. The paragraph has no
    // runs, but the border is real visual content and must render.
    const blocks: FlowBlock[] = [
      table(),
      emptyParagraph({
        id: 'rule',
        attrs: { borders: { bottom: { style: 'solid', color: '#7A1F2B', width: 1 } } },
      }),
    ];
    const out = normalizeHeaderFooterMeasureBlocks(blocks);
    const rule = out[1] as ParagraphBlock;
    expect(rule.attrs?.suppressEmptyParagraphHeight).toBeUndefined();
  });

  test('empty paragraph after table with explicit spaceBefore is NOT suppressed', () => {
    const blocks: FlowBlock[] = [
      table(),
      emptyParagraph({
        id: 'spaced',
        attrs: { spacing: { before: 120 }, spacingExplicit: { before: true } },
      }),
    ];
    const out = normalizeHeaderFooterMeasureBlocks(blocks);
    const spaced = out[1] as ParagraphBlock;
    expect(spaced.attrs?.suppressEmptyParagraphHeight).toBeUndefined();
  });

  test('two empty paragraphs after table — only the first is suppressed', () => {
    const blocks: FlowBlock[] = [
      table(),
      emptyParagraph({ id: 'first' }),
      emptyParagraph({ id: 'second' }),
    ];
    const out = normalizeHeaderFooterMeasureBlocks(blocks);
    expect((out[1] as ParagraphBlock).attrs?.suppressEmptyParagraphHeight).toBe(true);
    expect((out[2] as ParagraphBlock).attrs?.suppressEmptyParagraphHeight).toBeUndefined();
  });
});
