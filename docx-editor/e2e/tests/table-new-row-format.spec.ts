import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * Insert row above/below preserves cell formatting — openspec
 * `table-editing-polish`.
 *
 * `buildCellAttrsFromTemplate` in `TableExtension.ts:798` already
 * clones every formatting attr (borders, backgroundColor, margins,
 * verticalAlign, width, widthType, textDirection, noWrap) from the
 * template cell when building the new row. This spec pins the working
 * behavior so it doesn't regress.
 *
 * The test sets a non-default background color on a row's cells via
 * the editor handle (the toolbar's cell-fill-color dropdown is a
 * deeper UI interaction not worth roping in here), then inserts a row
 * above and a row below, and confirms the new cells carry the same
 * background color.
 */

interface CellSnapshot {
  rowIdx: number;
  colIdx: number;
  backgroundColor: string | null;
}

async function snapshotCells(page: import('@playwright/test').Page): Promise<CellSnapshot[]> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = (window as any).__editorRef?.current;
    if (!handle) return [];
    const view = handle.getEditorRef?.()?.getView?.();
    if (!view) return [];
    const out: Array<{ rowIdx: number; colIdx: number; backgroundColor: string | null }> = [];
    view.state.doc.descendants((node: { type: { name: string } }, _pos: number) => {
      if (node.type.name === 'table') {
        let rowIdx = 0;
        node.descendants((row: { type: { name: string }; descendants: (cb: (c: { type: { name: string }; attrs: Record<string, unknown> }) => void) => void }) => {
          if (row.type.name === 'tableRow') {
            let colIdx = 0;
            row.descendants((cell) => {
              if (cell.type.name === 'tableCell') {
                out.push({
                  rowIdx,
                  colIdx,
                  backgroundColor: (cell.attrs.backgroundColor as string | null) ?? null,
                });
                colIdx++;
              }
            });
            rowIdx++;
          }
        });
        // Only first table.
        return false;
      }
      return true;
    });
    return out;
  });
}

async function setCellBackground(
  page: import('@playwright/test').Page,
  rowIdx: number,
  colIdx: number,
  color: string
): Promise<void> {
  await page.evaluate(
    ({ rowIdx, colIdx, color }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handle = (window as any).__editorRef?.current;
      const view = handle?.getEditorRef?.()?.getView?.();
      if (!view) return;
      const tr = view.state.tr;
      let curRow = 0;
      view.state.doc.descendants((node: { type: { name: string } }, pos: number) => {
        if (node.type.name !== 'tableRow') return true;
        if (curRow === rowIdx) {
          let curCol = 0;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (node as any).forEach((cell: { type: { name: string }; attrs: Record<string, unknown>; nodeSize: number }, offset: number) => {
            if (cell.type.name === 'tableCell' && curCol === colIdx) {
              tr.setNodeMarkup(pos + 1 + offset, undefined, {
                ...cell.attrs,
                backgroundColor: color,
              });
            }
            if (cell.type.name === 'tableCell') curCol++;
          });
          return false;
        }
        curRow++;
        return false;
      });
      view.dispatch(tr);
    },
    { rowIdx, colIdx, color }
  );
}

test.describe('Insert row preserves cell formatting', () => {
  test('addRowAbove + addRowBelow clone the source row cell backgroundColor', async ({
    page,
  }) => {
    const editor = new EditorPage(page);
    await page.goto('/?e2e=1');
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();

    await editor.insertTable(2, 2);
    await page.waitForTimeout(200);

    // Tint row 0's cells red.
    await setCellBackground(page, 0, 0, '#FFCDD2');
    await setCellBackground(page, 0, 1, '#FFCDD2');
    await page.waitForTimeout(200);

    const baseline = await snapshotCells(page);
    expect(baseline.filter((c) => c.rowIdx === 0)).toHaveLength(2);
    expect(baseline.filter((c) => c.rowIdx === 0)[0].backgroundColor).toBe('#FFCDD2');

    // Cursor into row 0 (the tinted row). Both addRowAbove and
    // addRowBelow take their template from `context.rowIndex` — i.e.
    // the row containing the cursor — so a row inserted before or
    // after this row should clone its tint.
    await editor.clickTableCell(0, 0, 0);
    await page.waitForTimeout(100);

    await editor.addRowAbove();
    await page.waitForTimeout(200);

    let cells = await snapshotCells(page);
    // After addRowAbove, the new row is at index 0 — should be tinted.
    expect(cells.filter((c) => c.rowIdx === 0)).toHaveLength(2);
    expect(
      cells.filter((c) => c.rowIdx === 0)[0].backgroundColor,
      'addRowAbove: new col 0 fill'
    ).toBe('#FFCDD2');
    expect(
      cells.filter((c) => c.rowIdx === 0)[1].backgroundColor,
      'addRowAbove: new col 1 fill'
    ).toBe('#FFCDD2');

    // Cursor back into the (still-tinted) row that was originally
    // row 0 — now at index 1.
    await editor.clickTableCell(0, 1, 0);
    await page.waitForTimeout(100);
    await editor.addRowBelow();
    await page.waitForTimeout(200);

    cells = await snapshotCells(page);
    // After addRowBelow on row 1, new row appears at index 2 and
    // should also be tinted.
    expect(cells.filter((c) => c.rowIdx === 2)).toHaveLength(2);
    expect(
      cells.filter((c) => c.rowIdx === 2)[0].backgroundColor,
      'addRowBelow: new col 0 fill'
    ).toBe('#FFCDD2');
    expect(
      cells.filter((c) => c.rowIdx === 2)[1].backgroundColor,
      'addRowBelow: new col 1 fill'
    ).toBe('#FFCDD2');
  });
});
