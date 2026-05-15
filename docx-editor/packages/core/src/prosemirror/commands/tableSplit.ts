/**
 * ProseMirror table cell splitting — dialog-backed split with explicit
 * row/column input.
 *
 * Uses the shared split algorithm from utils/tableSplitAlgorithm.ts for the
 * core layout computation, then maps the result back into ProseMirror
 * transactions.
 */

import type { Node as PMNode } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import { TextSelection } from 'prosemirror-state';
import {
  type CellAnchor,
  computeSplitLayout,
  computeSplitDialogDefaults,
  redistributeColumnWidths,
  sumColumnWidths,
} from '../../utils/tableSplitAlgorithm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SplitCellDialogConfig {
  minRows: number;
  minCols: number;
  initialRows: number;
  initialCols: number;
  /** Captured row index of the target cell at dialog-open time */
  capturedCellRow: number;
  /** Captured column index of the target cell at dialog-open time */
  capturedCellCol: number;
}

interface ActiveTableCellInfo {
  table: PMNode;
  tablePos: number;
  cell: PMNode;
  row: number;
  col: number;
  rowspan: number;
  colspan: number;
}

// ---------------------------------------------------------------------------
// ProseMirror-specific helpers
// ---------------------------------------------------------------------------

function findActiveTableCell(state: EditorState): ActiveTableCellInfo | null {
  const { $from } = state.selection;

  let table: PMNode | null = null;
  let tablePos: number | null = null;
  let cell: PMNode | null = null;
  let row = -1;
  let col = -1;

  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);

    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
      cell = node;
      const rowNode = $from.node(depth - 1);
      if (rowNode?.type.name === 'tableRow') {
        let currentCol = 0;
        rowNode.forEach((child, _offset, index) => {
          if (col !== -1) return;
          if (index === $from.index(depth - 1)) {
            col = currentCol;
            return;
          }
          currentCol += child.attrs.colspan || 1;
        });
      }
    } else if (node.type.name === 'tableRow') {
      const parent = $from.node(depth - 1);
      if (parent?.type.name === 'table') {
        row = $from.index(depth - 1);
      }
    } else if (node.type.name === 'table') {
      table = node;
      tablePos = $from.before(depth);
      break;
    }
  }

  if (!table || tablePos == null || !cell || row < 0 || col < 0) return null;

  return {
    table,
    tablePos,
    cell,
    row,
    col,
    rowspan: cell.attrs.rowspan || 1,
    colspan: cell.attrs.colspan || 1,
  };
}

/** Scan a ProseMirror table node and produce a list of cell anchors. */
function collectPMAnchors(table: PMNode): { anchors: CellAnchor<PMNode>[]; totalCols: number } {
  const occupied: boolean[][] = [];
  const anchors: CellAnchor<PMNode>[] = [];
  let totalCols = 0;

  for (let row = 0; row < table.childCount; row++) {
    const rowNode = table.child(row);
    let col = 0;

    rowNode.forEach((cell) => {
      while (occupied[row]?.[col]) col++;

      const rowspan = cell.attrs.rowspan || 1;
      const colspan = cell.attrs.colspan || 1;

      anchors.push({ data: cell, row, col, rowspan, colspan });

      for (let r = row; r < row + rowspan; r++) {
        const rowSlots = occupied[r] ?? [];
        occupied[r] = rowSlots;
        for (let c = col; c < col + colspan; c++) {
          rowSlots[c] = true;
        }
      }

      col += colspan;
      totalCols = Math.max(totalCols, col);
    });
  }

  return { anchors, totalCols };
}

function buildCellAttrs(
  cell: PMNode,
  colStart: number,
  colspan: number,
  rowspan: number,
  columnWidths: number[]
): Record<string, unknown> {
  const attrs = { ...cell.attrs };
  const totalWidth = columnWidths.reduce((sum, w) => sum + w, 0);
  const cellWidth = sumColumnWidths(columnWidths, colStart, colspan);
  const spansChanged =
    colspan !== (cell.attrs.colspan || 1) || rowspan !== (cell.attrs.rowspan || 1);

  attrs.colspan = colspan;
  attrs.rowspan = rowspan;
  attrs.colwidth = null;
  if (totalWidth > 0) {
    // 50ths of a percent per ECMA-376 §17.18.111 (5000 = 100%).
    attrs.width = Math.round((cellWidth / totalWidth) * 5000);
    attrs.widthType = 'pct';
  }
  if (spansChanged) {
    attrs._originalFormatting = null;
  }

  return attrs;
}

function findCellStartPos(
  table: PMNode,
  tablePos: number,
  rowIndex: number,
  colIndex: number
): number | null {
  let rowPos = tablePos + 1;

  for (let row = 0; row < table.childCount; row++) {
    const rowNode = table.child(row);
    let cellPos = rowPos + 1;
    let currentCol = 0;

    for (let cellIndex = 0; cellIndex < rowNode.childCount; cellIndex++) {
      const cell = rowNode.child(cellIndex);
      if (row === rowIndex && currentCol === colIndex) {
        return cellPos;
      }
      currentCol += cell.attrs.colspan || 1;
      cellPos += cell.nodeSize;
    }

    rowPos += rowNode.nodeSize;
  }

  return null;
}

function getExistingColumnWidths(table: PMNode, totalCols: number): number[] {
  const tableWidth = (table.attrs.width as number | null) ?? 9360;
  return Array.isArray(table.attrs.columnWidths) && table.attrs.columnWidths.length > 0
    ? [...(table.attrs.columnWidths as number[])]
    : Array.from({ length: totalCols }, () => Math.floor(tableWidth / Math.max(totalCols, 1)));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getSplitCellDialogConfig(state: EditorState): SplitCellDialogConfig | null {
  const activeCell = findActiveTableCell(state);
  if (!activeCell) return null;

  return {
    ...computeSplitDialogDefaults(activeCell.rowspan, activeCell.colspan),
    capturedCellRow: activeCell.row,
    capturedCellCol: activeCell.col,
  };
}

export function splitActiveTableCell(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  rows: number,
  cols: number,
  /** Target cell row/col captured at dialog-open time. Falls back to current cursor. */
  targetRow?: number,
  targetCol?: number
): boolean {
  if (rows < 1 || cols < 1) return false;
  const resolved = findActiveTableCell(state);
  if (!resolved || !dispatch) return false;

  // Use captured coordinates from dialog-open time when available,
  // falling back to the current cursor position.
  let activeCell: ActiveTableCellInfo = resolved;
  if (targetRow != null && targetCol != null) {
    if (targetRow !== resolved.row || targetCol !== resolved.col) {
      const { anchors } = collectPMAnchors(resolved.table);
      const originalTarget = anchors.find((a) => a.row === targetRow && a.col === targetCol);
      if (!originalTarget) {
        return false;
      }
      activeCell = {
        ...resolved,
        cell: originalTarget.data,
        row: originalTarget.row,
        col: originalTarget.col,
        rowspan: originalTarget.rowspan,
        colspan: originalTarget.colspan,
      };
    }
  }

  if (rows < activeCell.rowspan || cols < activeCell.colspan) return false;
  if (rows === 1 && cols === 1) return false;

  const { anchors, totalCols } = collectPMAnchors(activeCell.table);

  const existing = getExistingColumnWidths(activeCell.table, totalCols);
  const newColumnWidths = redistributeColumnWidths(
    existing,
    activeCell.col,
    activeCell.colspan,
    cols
  );

  const target = anchors.find(
    (anchor) => anchor.row === activeCell.row && anchor.col === activeCell.col
  );
  if (!target) return false;

  const layout = computeSplitLayout(
    anchors,
    target,
    rows,
    cols,
    activeCell.table.childCount,
    (isOriginal) => {
      if (isOriginal) return target.data;
      // Create an empty cell node for non-original positions
      const paragraph = target.data.type.schema.nodes.paragraph.create();
      const emptyAttrs = buildCellAttrs(target.data, 0, 1, 1, newColumnWidths);
      return target.data.type.create(emptyAttrs, paragraph);
    }
  );

  // Build row attrs from the original table
  const targetRowEnd = activeCell.row + activeCell.rowspan;
  const rowAttrs = Array.from({ length: layout.newRowCount }, (_, rowIndex) => {
    if (rowIndex < targetRowEnd) {
      return { ...(activeCell.table.child(rowIndex)?.attrs ?? {}) };
    }
    if (rowIndex < activeCell.row + rows) {
      return { ...(activeCell.table.child(targetRowEnd - 1)?.attrs ?? {}) };
    }
    return { ...(activeCell.table.child(rowIndex - layout.deltaRows)?.attrs ?? {}) };
  });

  // Sort anchors and build row children
  const rowChildren = Array.from({ length: layout.newRowCount }, () => [] as PMNode[]);
  layout.anchors
    .sort((a, b) => (a.row === b.row ? a.col - b.col : a.row - b.row))
    .forEach((anchor) => {
      const attrs = buildCellAttrs(
        anchor.data,
        anchor.col,
        anchor.colspan,
        anchor.rowspan,
        newColumnWidths
      );
      rowChildren[anchor.row].push(anchor.data.type.create(attrs, anchor.data.content));
    });

  const rowNodes = rowChildren.map((cells, rowIndex) =>
    activeCell.table.type.schema.nodes.tableRow.create(rowAttrs[rowIndex], cells)
  );

  const newTable = activeCell.table.type.create(
    { ...activeCell.table.attrs, columnWidths: newColumnWidths },
    rowNodes
  );

  let tr = state.tr.replaceWith(
    activeCell.tablePos,
    activeCell.tablePos + activeCell.table.nodeSize,
    newTable
  );

  const replacedTable = tr.doc.nodeAt(activeCell.tablePos);
  if (replacedTable) {
    const selectionCellPos = findCellStartPos(
      replacedTable,
      activeCell.tablePos,
      activeCell.row,
      activeCell.col
    );
    if (selectionCellPos != null) {
      tr = tr.setSelection(TextSelection.near(tr.doc.resolve(selectionCellPos + 1)));
    }
  }

  dispatch(tr.scrollIntoView());
  return true;
}
