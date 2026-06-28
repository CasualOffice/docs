import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * Delete/Backspace over a multi-cell selection clears the selected cells'
 * contents and keeps the table — matching Word and Google Docs. Selecting the
 * whole table and pressing Delete previously removed the entire table, which
 * surprised users who selected all cells just to clear them. Deleting the table
 * is an explicit right-click / menu action (covered by table-delete.spec.ts).
 */
test('full-table selection + Delete clears contents and keeps the table', async ({ page }) => {
  test.setTimeout(60000);
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.newDocument();
  await editor.focus();
  await editor.insertTable(2, 2);
  await page.waitForTimeout(300);

  const cells = page.locator('.layout-table-cell');
  for (let i = 0; i < 4; i++) {
    await cells.nth(i).click();
    await page.waitForTimeout(50);
    await editor.typeText('C' + i);
  }

  // Drag across all four cells to build a CellSelection.
  const r0 = await cells.nth(0).boundingBox();
  const r3 = await cells.nth(3).boundingBox();
  await page.mouse.move(r0!.x + r0!.width / 2, r0!.y + r0!.height / 2);
  await page.mouse.down();
  await page.mouse.move(r3!.x + r3!.width / 2, r3!.y + r3!.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(180);

  await page.keyboard.press('Delete');
  await page.waitForTimeout(250);

  // Table survives; all cells cleared.
  expect(await page.locator('.layout-table').count()).toBe(1);
  expect(await cells.count()).toBe(4);
  expect((await cells.allInnerTexts()).every((t) => t.trim() === '')).toBe(true);
});

test('partial cell selection + Backspace clears only the selected cells', async ({ page }) => {
  test.setTimeout(60000);
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.newDocument();
  await editor.focus();
  await editor.insertTable(2, 2);
  await page.waitForTimeout(300);

  const cells = page.locator('.layout-table-cell');
  for (let i = 0; i < 4; i++) {
    await cells.nth(i).click();
    await page.waitForTimeout(50);
    await editor.typeText('D' + i);
  }

  // Select the top row (cells 0 and 1).
  const a0 = await cells.nth(0).boundingBox();
  const a1 = await cells.nth(1).boundingBox();
  await page.mouse.move(a0!.x + a0!.width / 2, a0!.y + a0!.height / 2);
  await page.mouse.down();
  await page.mouse.move(a1!.x + a1!.width / 2, a1!.y + a1!.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(150);

  await page.keyboard.press('Backspace');
  await page.waitForTimeout(220);

  const texts = (await cells.allInnerTexts()).map((t) => t.trim());
  expect(await cells.count()).toBe(4);
  expect(texts[0]).toBe('');
  expect(texts[1]).toBe('');
  expect(texts[2]).toContain('D2');
  expect(texts[3]).toContain('D3');
});
