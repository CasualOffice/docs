/**
 * B8 — Convert the current selection from text to a table.
 *
 * The function inspects each paragraph the selection touches and splits
 * its text by an auto-detected delimiter — tab first, then comma, then
 * one cell per paragraph if neither shows up. The covered paragraphs
 * are replaced with a single table; subsequent rows are zero-padded so
 * uneven inputs (one row with 3 fields, the next with 5) don't crash.
 *
 * Auto-detection rationale: paste-from-CSV is the headline use case
 * (per the parity doc) and that lands as tab- or comma-delimited
 * paragraphs. A delimiter dialog is a follow-up that we can layer on
 * top once people are using the action.
 *
 * The resulting table uses the same attribute shape `createTable` in
 * `TableExtension` produces — single 4px border, default row height,
 * equal column widths — so the painter doesn't need a special case.
 */

import type { EditorView } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import { getTableContext } from '@eigenpal/docx-core/prosemirror/commands';

/** Page-content width in twentieths of a point, matching `createTable`. */
const CONTENT_WIDTH_TWIPS = 9360;
/** Default row height in twips (~24px at 96 DPI). */
const DEFAULT_ROW_HEIGHT_TWIPS = 360;

type Delimiter = 'tab' | 'comma' | 'paragraph';

function detectDelimiter(lines: string[]): Delimiter {
  if (lines.some((l) => l.includes('\t'))) return 'tab';
  if (lines.some((l) => l.includes(','))) return 'comma';
  return 'paragraph';
}

function splitLine(line: string, delimiter: Delimiter): string[] {
  switch (delimiter) {
    case 'tab':
      return line.split('\t');
    case 'comma':
      return line.split(',').map((s) => s.trim());
    case 'paragraph':
      return [line];
  }
}

/**
 * Returns the document positions that fully enclose the selection's
 * containing paragraphs. PM ranges can land mid-paragraph; we need the
 * outer block bounds so the replacement consumes whole paragraphs.
 */
function paragraphBlockRange(
  view: EditorView
): { from: number; to: number; paragraphs: PMNode[] } | null {
  const { state } = view;
  const { $from, $to } = state.selection;
  // We want the outer block range so the slice yields whole paragraph
  // nodes — `start(1)` / `end(1)` land *inside* the first/last paragraph,
  // which would strip the paragraph wrappers and leave just text.
  const startBlock = $from.before(1);
  const endBlock = $to.after(1);
  const fragment = state.doc.slice(startBlock, endBlock).content;
  const paragraphs: PMNode[] = [];
  fragment.forEach((child) => {
    if (child.type.name === 'paragraph') paragraphs.push(child);
  });
  if (paragraphs.length === 0) return null;
  return { from: startBlock, to: endBlock, paragraphs };
}

export function canConvertSelectionToTable(view: EditorView): boolean {
  const range = paragraphBlockRange(view);
  if (!range) return false;
  // Need at least one paragraph with non-empty text content.
  return range.paragraphs.some((p) => p.textContent.trim().length > 0);
}

export function convertSelectionToTable(view: EditorView): boolean {
  const range = paragraphBlockRange(view);
  if (!range) return false;
  const { schema } = view.state;
  const tableType = schema.nodes.table;
  const rowType = schema.nodes.tableRow;
  const cellType = schema.nodes.tableCell;
  const paragraphType = schema.nodes.paragraph;
  if (!tableType || !rowType || !cellType || !paragraphType) return false;

  const lines = range.paragraphs.map((p) => p.textContent);
  // Empty lines at the boundaries (trailing newline paragraphs) are
  // dropped so the user doesn't get a row of blanks at the bottom.
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === '') lines.pop();
  while (lines.length > 0 && lines[0]?.trim() === '') lines.shift();
  if (lines.length === 0) return false;

  const delimiter = detectDelimiter(lines);
  const cellRows = lines.map((l) => splitLine(l, delimiter));
  const cols = Math.max(...cellRows.map((r) => r.length));
  // Pad short rows with empty cells so the table is rectangular.
  for (const row of cellRows) {
    while (row.length < cols) row.push('');
  }

  const colWidthTwips = Math.floor(CONTENT_WIDTH_TWIPS / cols);
  const defaultBorder = { style: 'single', size: 4, color: { rgb: '000000' } };
  const defaultBorders = {
    top: defaultBorder,
    bottom: defaultBorder,
    left: defaultBorder,
    right: defaultBorder,
  };

  const rows: PMNode[] = cellRows.map((cells) => {
    const cellNodes = cells.map((text) => {
      const para =
        text.length > 0 ? paragraphType.create({}, schema.text(text)) : paragraphType.create();
      return cellType.create(
        {
          colspan: 1,
          rowspan: 1,
          borders: defaultBorders,
          width: colWidthTwips,
          widthType: 'dxa',
        },
        para
      );
    });
    return rowType.create({ height: DEFAULT_ROW_HEIGHT_TWIPS, heightRule: 'atLeast' }, cellNodes);
  });
  const table = tableType.create(
    {
      columnWidths: Array(cols).fill(colWidthTwips),
      width: CONTENT_WIDTH_TWIPS,
      widthType: 'dxa',
    },
    rows
  );

  // Replace the paragraph-range with the table + a trailing empty paragraph
  // so the user can keep typing after it (PM disallows the cursor on a
  // table boundary).
  const trailing = paragraphType.create();
  const tr = view.state.tr.replaceRangeWith(range.from, range.to, table);
  tr.insert(range.from + table.nodeSize, trailing);
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}

// ---------------------------------------------------------------------------
// Reverse direction — table → text (B8 closeout).
// ---------------------------------------------------------------------------

export function canConvertTableToText(view: EditorView): boolean {
  return getTableContext(view.state).isInTable;
}

/**
 * Replaces the table at the cursor with one paragraph per row, cells
 * joined by `\t`. Inverse of `convertSelectionToTable` with tab
 * delimiter — round-trip-friendly so the user can flip back and forth
 * without lossy reformatting.
 *
 * The cursor's table position is resolved via the same `getTableContext`
 * helper the rest of the table toolbar uses, so it works whether the
 * caret is in a cell or a multi-cell selection.
 */
export function convertTableToText(view: EditorView): boolean {
  const { state } = view;
  const ctx = getTableContext(state);
  if (!ctx.isInTable || !ctx.table || ctx.tablePos === undefined) return false;
  const table = ctx.table;
  const tablePos = ctx.tablePos;
  const { schema } = state;
  const paragraphType = schema.nodes.paragraph;
  if (!paragraphType) return false;

  // Walk rows → cells, collect text. `textBetween` falls back to a
  // space at block boundaries; we strip those because they show up as
  // leading/trailing whitespace inside cells that span multiple
  // paragraphs (rare in our flow, but the strip is defensive).
  const paragraphs: PMNode[] = [];
  table.forEach((row) => {
    if (row.type.name !== 'tableRow') return;
    const cellTexts: string[] = [];
    row.forEach((cell) => {
      if (cell.type.name !== 'tableCell' && cell.type.name !== 'tableHeader') return;
      cellTexts.push(cell.textContent.trim());
    });
    const joined = cellTexts.join('\t');
    paragraphs.push(
      joined.length > 0 ? paragraphType.create({}, schema.text(joined)) : paragraphType.create()
    );
  });

  if (paragraphs.length === 0) return false;

  const tr = state.tr.replaceWith(tablePos, tablePos + table.nodeSize, paragraphs);
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}
