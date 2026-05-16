import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * table-indent-offset — openspec `table-rendering-fidelity`.
 *
 * OOXML §17.4.8 + Word's de-facto behavior: `<w:tblInd>` is the distance
 * from the page margin to the first cell's *content* area, not to the
 * first cell's outer border. Pre-fix, the painter rendered
 * `marginLeft = tblInd_px` directly, so the first cell's content ended
 * up ~7 px further right than Word's render (the table's default
 * 108-twip left cell margin).
 *
 * The fix subtracts the table-level left cell margin in
 * `toFlowBlocks.ts`:
 *   marginLeft = (tblInd - leftCellMargin) / 1440 * 96
 * and defaults a missing `tblInd` to `-leftCellMargin` so flush tables
 * (no explicit indent) still line up their cell content at the page
 * margin.
 *
 * Spec checks both shapes:
 *   - INDENTED: tblInd=720 twips, leftCellMargin=108 (default)
 *     → expected marginLeft = (720-108)/1440 * 96 ≈ 40.8 px
 *   - FLUSH: no tblInd, leftCellMargin=108 (default)
 *     → expected marginLeft = -108/1440 * 96 ≈ -7.2 px
 */

test('table marginLeft compensates for the default left cell margin', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/table-indent.docx');
  await page.waitForTimeout(600);

  const data = await page.evaluate(() => {
    const tables = Array.from(document.querySelectorAll<HTMLElement>('.layout-table')).filter(
      (el) => !el.closest('.paged-editor__hidden-pm')
    );
    const findByCellText = (text: string) =>
      tables.find((t) => t.textContent?.includes(text)) ?? null;
    const indented = findByCellText('INDENTED-TABLE-CELL-1');
    const flush = findByCellText('FLUSH-TABLE-CELL-1');
    // Body-level tables render with `position: absolute` and the indent
    // flows into `left`. The nested-table path (e.g. inside text boxes)
    // uses `marginLeft` on a relative wrapper; we check both so the
    // test stays robust if the painter changes.
    const leftOrMargin = (el: HTMLElement | null) =>
      el ? el.style.left || el.style.marginLeft || '' : '';
    return {
      indentedLeft: leftOrMargin(indented),
      flushLeft: leftOrMargin(flush),
    };
  });

  const TOL = 0.5;
  const indentedPx = parseFloat(data.indentedLeft);
  expect(Number.isFinite(indentedPx)).toBe(true);
  expect(Math.abs(indentedPx - 40.8)).toBeLessThan(TOL);

  const flushPx = parseFloat(data.flushLeft);
  expect(Number.isFinite(flushPx)).toBe(true);
  expect(Math.abs(flushPx - -7.2)).toBeLessThan(TOL);
});
