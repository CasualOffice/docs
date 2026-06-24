import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// B8 (closeout) — round-trip: text → table → text. The reverse direction
// renders the table back as one paragraph per row, cells joined by tab.
test.describe('Insert > Convert table to text (B8 closeout)', () => {
  test('appears in the Insert menu only when the cursor is in a table', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();

    // No table yet — "Convert table to text" should be hidden.
    await page.getByRole('button', { name: 'Insert', exact: true }).click();
    await page.waitForSelector('[role="menu"]', { state: 'visible', timeout: 4000 });
    await expect(page.getByRole('menuitem', { name: /Convert table to text/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    // Reclaim editor focus — Escape returns focus to the menu trigger.
    await editor.focus();

    // Build a table via the forward conversion.
    await page.keyboard.type('Name, City');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Ada, London');
    await editor.selectAll();
    await page.getByRole('button', { name: 'Insert', exact: true }).click();
    await page.getByRole('menuitem', { name: /Convert selection to table/ }).click();

    const table = page.locator('.paged-editor__pages .layout-table').first();
    await expect(table).toBeVisible();

    // Put cursor inside the table — click into a cell.
    const cell = table.locator('.layout-table-cell').first();
    await cell.click();

    // Now "Convert table to text" should be available.
    await page.getByRole('button', { name: 'Insert', exact: true }).click();
    await page.waitForSelector('[role="menu"]', { state: 'visible', timeout: 4000 });
    const item = page.getByRole('menuitem', { name: /Convert table to text/ });
    await expect(item).toBeVisible();
    await item.click();

    // Table disappears; text content remains (joined by tab → renders as
    // tab whitespace, but the text is still in the doc).
    await expect(page.locator('.paged-editor__pages .layout-table')).toHaveCount(0);
    await expect(page.locator('.paged-editor__pages')).toContainText(/Ada/);
    await expect(page.locator('.paged-editor__pages')).toContainText(/London/);
    await page.screenshot({ path: 'screenshots/b8-roundtrip.png' });
  });
});
