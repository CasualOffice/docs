/**
 * Integration test — per-side cell-margin cascade (ECMA-376 §17.4.41).
 *
 * Covers the table-cell padding pipeline:
 *   Document model (inline w:tblCellMar with only top/bottom)
 *     + default table style (w:tblCellMar with left/right = 108 twips)
 *     → toProseDoc (PM table, `resolvedCellMargins` attr)
 *     → toFlowBlocks (cell.padding in px)
 *
 * Regression guard: before this fix the whole `w:tblCellMar` object was
 * resolved with a single `??`, so a table whose inline tblCellMar set only
 * top/bottom zeroed the unspecified left/right instead of inheriting them
 * from the default table style. That let cell text run to the cell edge,
 * widening the text area vs LibreOffice and drifting wrap points/row heights
 * (the medical-incident-form visual-fidelity regression). The sides must
 * cascade independently. `cellMargins` (round-trip) still mirrors the verbatim
 * inline values; `resolvedCellMargins` (layout-only) carries the inherited sides.
 */

import { describe, test, expect } from 'bun:test';
import { toProseDoc } from '../../prosemirror/conversion/toProseDoc';
import { toFlowBlocks } from '../toFlowBlocks';
import { twipsToPixels } from '../../utils/units';
import type { Document, Table } from '../../types/document';
import type { StyleDefinitions } from '../../types/styles';

/** Default table style with the Word-default 108-twip left/right cell margins. */
const STYLES_WITH_DEFAULT_TABLE: StyleDefinitions = {
  styles: [
    {
      styleId: 'TableNormal',
      type: 'table',
      default: true,
      tblPr: {
        cellMargins: {
          top: { value: 0, type: 'dxa' },
          left: { value: 108, type: 'dxa' },
          bottom: { value: 0, type: 'dxa' },
          right: { value: 108, type: 'dxa' },
        },
      },
    },
  ],
};

/** A one-cell table whose inline tblCellMar specifies ONLY top/bottom (57 twips). */
function makeTopBottomOnlyTable(): Table {
  return {
    type: 'table',
    formatting: {
      cellMargins: {
        top: { value: 57, type: 'dxa' },
        bottom: { value: 57, type: 'dxa' },
      },
    },
    columnWidths: [3397],
    rows: [
      {
        type: 'tableRow',
        cells: [
          {
            type: 'tableCell',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'run', content: [{ type: 'text', text: 'Label' }] }],
              },
            ],
          },
        ],
      },
    ],
  };
}

function makeDocument(table: Table): Document {
  return { package: { document: { content: [table] } } };
}

function firstCellPadding(doc: Document, styles?: StyleDefinitions) {
  const pmDoc = toProseDoc(doc, styles ? { styles } : undefined);
  const blocks = toFlowBlocks(pmDoc);
  const table = blocks.find((b) => b.kind === 'table');
  if (!table || table.kind !== 'table') throw new Error('no table block');
  return table.rows[0].cells[0].padding;
}

describe('toFlowBlocks — per-side cell-margin cascade', () => {
  test('partial inline tblCellMar inherits left/right from default table style', () => {
    const padding = firstCellPadding(
      makeDocument(makeTopBottomOnlyTable()),
      STYLES_WITH_DEFAULT_TABLE
    );
    // top/bottom come from the inline tblCellMar (57 twips)…
    expect(padding?.top).toBeCloseTo(twipsToPixels(57), 5);
    expect(padding?.bottom).toBeCloseTo(twipsToPixels(57), 5);
    // …left/right are inherited from the default table style (108 twips),
    // NOT zeroed. 108 twips ≈ 7.2 px.
    expect(padding?.left).toBeCloseTo(twipsToPixels(108), 5);
    expect(padding?.right).toBeCloseTo(twipsToPixels(108), 5);
  });

  test('inline tblCellMar still wins per-side where it is specified', () => {
    const table = makeTopBottomOnlyTable();
    // Give the inline tblCellMar an explicit left that should override the style.
    table.formatting!.cellMargins!.left = { value: 200, type: 'dxa' };
    const padding = firstCellPadding(makeDocument(table), STYLES_WITH_DEFAULT_TABLE);
    expect(padding?.left).toBeCloseTo(twipsToPixels(200), 5);
    // right is unspecified inline → still inherits the style's 108.
    expect(padding?.right).toBeCloseTo(twipsToPixels(108), 5);
  });

  test('round-trip cellMargins attr mirrors only the verbatim inline sides', () => {
    const pmDoc = toProseDoc(makeDocument(makeTopBottomOnlyTable()), {
      styles: STYLES_WITH_DEFAULT_TABLE,
    });
    let tableNode: import('prosemirror-model').Node | undefined;
    pmDoc.descendants((node) => {
      if (node.type.name === 'table') tableNode = node;
      return !tableNode;
    });
    expect(tableNode).toBeDefined();
    // The serialized-side attr keeps left/right undefined (inline had none)…
    expect(tableNode!.attrs.cellMargins).toEqual({
      top: 57,
      bottom: 57,
      left: undefined,
      right: undefined,
    });
    // …while the layout-only attr carries the inherited sides.
    expect(tableNode!.attrs.resolvedCellMargins).toEqual({
      top: 57,
      bottom: 57,
      left: 108,
      right: 108,
    });
  });
});
