import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * After inserting a table the caret must land INSIDE the first cell's
 * paragraph (inline content), so the user can type into the cell straight
 * away — matching Google Docs / Word. A previous off-by-one placed the
 * selection on the cell boundary, which both logged a ProseMirror warning
 * ("TextSelection endpoint not pointing into a node with inline content")
 * and meant the first typed text could miss the cell.
 */
test('caret lands inside the first cell after inserting a table', async ({ page }) => {
  const ed = new EditorPage(page);
  await ed.goto();
  await ed.waitForReady();
  await ed.newDocument();
  await ed.focus();

  await ed.insertTable(2, 2);
  await page.waitForTimeout(250);

  // Type immediately, without clicking a cell first.
  await ed.typeText('hello');
  await page.waitForTimeout(200);

  // The text must have landed in cell (0,0), not outside the table.
  expect(await ed.getTableCellContent(0, 0, 0)).toContain('hello');
});
