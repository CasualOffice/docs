/**
 * Integration test — numbered list markers stay continuous when a list spans
 * body → table cell → body, all sharing the same numId.
 *
 * Regression guard: parser-side resolution used to run only for body
 * paragraphs, leaving table-cell paragraphs with raw "%1." templates. The
 * combined effect was duplicate / skipped numbers across containers. The fix
 * routes resolution through toFlowBlocks for every container, sharing one
 * counter map.
 */

import { describe, test, expect } from 'bun:test';
import { toProseDoc } from '../../prosemirror/conversion/toProseDoc';
import { fromProseDoc } from '../../prosemirror/conversion/fromProseDoc';
import { toFlowBlocks } from '../toFlowBlocks';
import type { Document, Paragraph, Table, TableCell, TableRow } from '../../types/document';

function listPara(numId: number, ilvl: number, text: string, marker = '%1.'): Paragraph {
  return {
    type: 'paragraph',
    formatting: { numPr: { numId, ilvl } },
    content: [{ type: 'run', content: [{ type: 'text', text }] }],
    listRendering: {
      marker,
      level: ilvl,
      numId,
      isBullet: false,
      numFmt: 'decimal',
      levelNumFmts: Array(ilvl + 1).fill('decimal'),
    },
  };
}

function cell(content: (Paragraph | Table)[]): TableCell {
  return { type: 'tableCell', content };
}

function row(cells: TableCell[]): TableRow {
  return { type: 'tableRow', cells };
}

function table(rows: TableRow[]): Table {
  return { type: 'table', rows };
}

function doc(content: Array<Paragraph | Table>): Document {
  return { package: { document: { content } } };
}

function markersOf(blocks: ReturnType<typeof toFlowBlocks>): string[] {
  const out: string[] = [];
  const visit = (block: (typeof blocks)[number]) => {
    if (block.kind === 'paragraph' && block.attrs?.listMarker) {
      out.push(block.attrs.listMarker);
    } else if (block.kind === 'table') {
      for (const r of block.rows) {
        for (const c of r.cells) {
          for (const cb of c.blocks) visit(cb);
        }
      }
    }
  };
  for (const b of blocks) visit(b);
  return out;
}

describe('toFlowBlocks — list markers across containers', () => {
  test('body → table-cell → body keeps numbering continuous on shared numId', () => {
    const d = doc([
      listPara(1, 0, 'first'),
      listPara(1, 0, 'second'),
      table([row([cell([listPara(1, 0, 'in-table')])])]),
      listPara(1, 0, 'fourth'),
    ]);
    const pm = toProseDoc(d);
    const blocks = toFlowBlocks(pm, {});
    expect(markersOf(blocks)).toEqual(['1.', '2.', '3.', '4.']);
  });

  test('body markers are not pre-resolved by the parser (single source of truth)', () => {
    // Two body paragraphs sharing a numId. Markers should be 1., 2. — not
    // 1., 1. (which would happen if both parser and toFlowBlocks resolved
    // and the parser's pre-resolution was kept verbatim while toFlowBlocks
    // also incremented its own counter).
    const d = doc([listPara(1, 0, 'a'), listPara(1, 0, 'b'), listPara(1, 0, 'c')]);
    const pm = toProseDoc(d);
    const blocks = toFlowBlocks(pm, {});
    expect(markersOf(blocks)).toEqual(['1.', '2.', '3.']);
  });

  test('different numIds keep independent counters', () => {
    const d = doc([
      listPara(1, 0, 'a'),
      listPara(2, 0, 'x'),
      listPara(1, 0, 'b'),
      listPara(2, 0, 'y'),
    ]);
    const pm = toProseDoc(d);
    const blocks = toFlowBlocks(pm, {});
    expect(markersOf(blocks)).toEqual(['1.', '1.', '2.', '2.']);
  });

  test('numId === 0 is treated as "no numbering" — no marker emitted', () => {
    // ECMA-376: numId 0 is the sentinel for "this paragraph has numbering
    // markup but no actual numbering". Must not consume a counter slot.
    const noNum: Paragraph = {
      type: 'paragraph',
      formatting: { numPr: { numId: 0, ilvl: 0 } },
      content: [{ type: 'run', content: [{ type: 'text', text: 'no num' }] }],
    };
    const d = doc([listPara(1, 0, 'a'), noNum, listPara(1, 0, 'b')]);
    const pm = toProseDoc(d);
    const blocks = toFlowBlocks(pm, {});
    // Only the two real list items should produce markers; numId=0 is skipped.
    expect(markersOf(blocks)).toEqual(['1.', '2.']);
  });

  test('bullet glyphs in table cells get Unicode conversion', () => {
    // Table-cell paragraphs bypass parser-side resolveBulletMarker. Without
    // toFlowBlocks-side conversion, a Symbol-font glyph (private-use area)
    // would leak through to the painter as a non-rendering character.
    const symbolBullet = ''; // private-use bullet from Symbol font
    const cellPara: Paragraph = {
      type: 'paragraph',
      formatting: { numPr: { numId: 1, ilvl: 0 } },
      content: [{ type: 'run', content: [{ type: 'text', text: 'in cell' }] }],
      listRendering: {
        marker: symbolBullet,
        level: 0,
        numId: 1,
        isBullet: true,
        numFmt: 'bullet',
      },
    };
    const d = doc([table([row([cell([cellPara])])])]);
    const pm = toProseDoc(d);
    const blocks = toFlowBlocks(pm, {});
    expect(markersOf(blocks)).toEqual(['•']);
  });

  test('round-trip preserves numPr through fromProseDoc (save path)', () => {
    // Round-trip safety check: the new render-side attrs (listMarker,
    // listLevelNumFmts) must NOT be relied on by the save path. fromProseDoc
    // reads only numPr — numbering.xml supplies the rest on reopen.
    const d = doc([listPara(1, 0, 'a'), listPara(1, 0, 'b'), listPara(7, 1, 'nested')]);
    const pm = toProseDoc(d);
    const back = fromProseDoc(pm);
    const paras = back.package.document.content.filter(
      (b): b is Paragraph => b.type === 'paragraph'
    );
    expect(paras.map((p) => p.formatting?.numPr)).toEqual([
      { numId: 1, ilvl: 0 },
      { numId: 1, ilvl: 0 },
      { numId: 7, ilvl: 1 },
    ]);
  });

  test('bullet items on a shared numId do not consume number slots', () => {
    const numbered = (text: string): Paragraph => listPara(1, 0, text);
    const bullet = (text: string): Paragraph => ({
      type: 'paragraph',
      formatting: { numPr: { numId: 1, ilvl: 0 } },
      content: [{ type: 'run', content: [{ type: 'text', text }] }],
      listRendering: {
        marker: '•',
        level: 0,
        numId: 1,
        isBullet: true,
        numFmt: 'bullet',
      },
    });
    const d = doc([numbered('a'), bullet('b'), numbered('c')]);
    const pm = toProseDoc(d);
    const blocks = toFlowBlocks(pm, {});
    // bullet shouldn't advance the numbered counter
    expect(markersOf(blocks)).toEqual(['1.', '•', '2.']);
  });
});
