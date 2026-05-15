/**
 * @internal Helpers for resolving DOCX table-width metadata into pixel widths.
 */

import type { TableBlock } from '../layout-engine';
import { twipsToPixels } from '../utils/units';

/**
 * Resolve a DOCX width pair to pixels. `pct` values are 50ths of a percent
 * (ECMA-376 §17.18.111 — 5000 means 100%). `dxa` / `auto` / unset are twips.
 *
 * @internal
 */
export function resolveTableWidthPx(
  value: number | undefined,
  widthType: string | undefined,
  parentWidth: number
): number | undefined {
  if (!value || value <= 0) return undefined;
  if (widthType === 'pct') {
    return (parentWidth * value) / 5000;
  }
  if (!widthType || widthType === 'dxa' || widthType === 'auto') {
    return twipsToPixels(value);
  }
  return undefined;
}

/** Total grid columns, derived from the widest row's accumulated colSpans. */
export function countTableColumns(tableBlock: TableBlock): number {
  return Math.max(
    1,
    ...tableBlock.rows.map((row) =>
      row.cells.reduce((sum, cell) => sum + Math.max(1, cell.colSpan ?? 1), 0)
    )
  );
}

/**
 * Make `columnWidths` exactly `colCount` long with every entry positive.
 * Missing trailing columns inherit the average of existing positives; zero
 * or negative entries split the leftover `targetWidth` evenly. Callers
 * scale down totals that exceed the target — this helper only fills gaps.
 */
export function normalizeTableColumnWidths(
  columnWidths: number[],
  colCount: number,
  targetWidth: number
): number[] {
  if (colCount <= 0) return [];

  const evenWidth = targetWidth > 0 ? targetWidth / colCount : 0;

  if (columnWidths.length === 0) {
    return Array(colCount).fill(evenWidth);
  }

  let normalized = columnWidths.slice(0, colCount);
  const missingColumns = colCount - normalized.length;
  if (missingColumns > 0) {
    const existingPositive = normalized.filter((width) => width > 0);
    const fallbackWidth =
      existingPositive.length > 0
        ? existingPositive.reduce((sum, width) => sum + width, 0) / existingPositive.length
        : evenWidth;
    normalized = normalized.concat(Array(missingColumns).fill(fallbackWidth));
  }

  const positiveTotal = normalized.reduce((sum, width) => sum + (width > 0 ? width : 0), 0);
  const nonPositiveCount = normalized.filter((width) => width <= 0).length;

  if (positiveTotal <= 0) return Array(colCount).fill(evenWidth);
  if (nonPositiveCount === 0) return normalized;

  const remainingWidth = Math.max(0, targetWidth - positiveTotal);
  const fallbackWidth =
    remainingWidth > 0
      ? remainingWidth / nonPositiveCount
      : positiveTotal / Math.max(1, colCount - nonPositiveCount);

  return normalized.map((width) => (width > 0 ? width : fallbackWidth));
}
