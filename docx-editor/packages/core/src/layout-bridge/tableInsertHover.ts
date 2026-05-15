/**
 * Table-insert "+" hover hit-test.
 *
 * Pure DOM logic for the floating row/column insert button that shows
 * when the mouse is near the left or top edge of a layout table. Lives
 * in core so React + Vue + any future adapter can share the hit-test
 * and just wire up their own UI rendering of the button.
 *
 * The function is gated by `hfEditMode`: tables in inactive HF/body
 * regions don't surface the affordance. A header table only matches
 * when the user is editing the header; a body table only matches when
 * not in any HF edit mode.
 */

import { PAGE_CLASS_NAMES } from '../layout-painter/renderPage';
import { TABLE_CLASS_NAMES } from '../layout-painter/renderTable';

export const TABLE_INSERT_EDGE_PROXIMITY = 30;
export const TABLE_INSERT_HIDE_DELAY_MS = 200;

const ROW_BUTTON_OFFSET_X = 24;
const ROW_BUTTON_OFFSET_Y = 10;
const COL_BUTTON_OFFSET_X = 10;
const COL_BUTTON_OFFSET_Y = 24;

export type TableInsertHoverHit = {
  type: 'row' | 'column';
  /** Client-coordinate anchor for the button. Caller converts to its UI frame. */
  clientX: number;
  clientY: number;
  /** PM position of the cell the button targets. */
  cellPmPos: number;
};

export type TableInsertHoverInput = {
  mouseX: number;
  mouseY: number;
  pagesContainer: HTMLElement;
  /** Element under the cursor at the time of the event (e.target). */
  target: HTMLElement;
  hfEditMode: 'header' | 'footer' | null;
  /** Override edge proximity in pixels (defaults to TABLE_INSERT_EDGE_PROXIMITY). */
  edgeProximity?: number;
};

/**
 * Detect whether a mousemove should surface a row/column insert "+" button.
 *
 * Returns the button anchor + target cell PM position, or `null` if the
 * mouse isn't near a row's left edge or a column's top edge — or if the
 * relevant table belongs to an inactive HF/body region.
 */
export function detectTableInsertHover(input: TableInsertHoverInput): TableInsertHoverHit | null {
  const {
    mouseX,
    mouseY,
    pagesContainer,
    target,
    hfEditMode,
    edgeProximity = TABLE_INSERT_EDGE_PROXIMITY,
  } = input;

  const tableSelector = `.${TABLE_CLASS_NAMES.table}`;
  const rowSelector = `.${TABLE_CLASS_NAMES.row}`;
  const cellSelector = `.${TABLE_CLASS_NAMES.cell}`;
  const headerSelector = `.${PAGE_CLASS_NAMES.header}`;
  const footerSelector = `.${PAGE_CLASS_NAMES.footer}`;

  const tableIsActive = (t: HTMLElement): boolean => {
    const inHeader = !!t.closest(headerSelector);
    const inFooter = !!t.closest(footerSelector);
    if (!inHeader && !inFooter) return !hfEditMode;
    if (inHeader) return hfEditMode === 'header';
    return hfEditMode === 'footer';
  };

  // Find the table — either directly under the cursor or nearby (edge hover).
  let tableEl = target.closest(tableSelector) as HTMLElement | null;
  if (tableEl && !tableIsActive(tableEl)) tableEl = null;
  if (!tableEl) {
    const tables = pagesContainer.querySelectorAll<HTMLElement>(tableSelector);
    for (const t of Array.from(tables)) {
      if (!tableIsActive(t)) continue;
      const r = t.getBoundingClientRect();
      const nearLeft = mouseX >= r.left - edgeProximity && mouseX < r.left;
      const nearTop = mouseY >= r.top - edgeProximity && mouseY < r.top;
      const withinX = mouseX >= r.left - edgeProximity && mouseX <= r.right;
      const withinY = mouseY >= r.top - edgeProximity && mouseY <= r.bottom;
      if ((nearLeft && withinY) || (nearTop && withinX)) {
        tableEl = t;
        break;
      }
    }
  }

  if (!tableEl) return null;

  const tableRect = tableEl.getBoundingClientRect();

  const nearLeftEdge =
    mouseX < tableRect.left + edgeProximity && mouseX >= tableRect.left - edgeProximity;
  const nearTopEdge =
    mouseY < tableRect.top + edgeProximity && mouseY >= tableRect.top - edgeProximity;

  if (!nearLeftEdge && !nearTopEdge) return null;

  const rows = tableEl.querySelectorAll<HTMLElement>(`:scope > ${rowSelector}`);
  if (rows.length === 0) return null;

  const getCellPmPos = (el: HTMLElement | null): number =>
    el ? Number(el.dataset.pmStart) || 0 : 0;

  if (nearLeftEdge) {
    for (let i = 0; i < rows.length; i++) {
      const rowRect = rows[i].getBoundingClientRect();
      if (mouseY >= rowRect.top && mouseY <= rowRect.bottom) {
        const cell = rows[i].querySelector<HTMLElement>(cellSelector);
        const pmPos = getCellPmPos(cell);
        if (!pmPos) break;
        return {
          type: 'row',
          clientX: tableRect.left - ROW_BUTTON_OFFSET_X,
          clientY: rowRect.top + rowRect.height / 2 - ROW_BUTTON_OFFSET_Y,
          cellPmPos: pmPos,
        };
      }
    }
  }

  if (nearTopEdge) {
    const cells = rows[0].querySelectorAll<HTMLElement>(`:scope > ${cellSelector}`);
    for (let i = 0; i < cells.length; i++) {
      const cellRect = cells[i].getBoundingClientRect();
      if (mouseX >= cellRect.left && mouseX <= cellRect.right) {
        const pmPos = getCellPmPos(cells[i]);
        if (!pmPos) break;
        return {
          type: 'column',
          clientX: cellRect.left + cellRect.width / 2 - COL_BUTTON_OFFSET_X,
          clientY: tableRect.top - COL_BUTTON_OFFSET_Y,
          cellPmPos: pmPos,
        };
      }
    }
  }

  // Mouse is near the table edges but not over any row/column.
  // Caller schedules the hide-with-delay.
  return null;
}
