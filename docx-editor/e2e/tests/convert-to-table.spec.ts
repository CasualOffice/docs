import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// B8 — Insert → "Convert selection to table" turns the selected paragraphs
// into a table, auto-detecting the delimiter. This spec covers the
// comma-separated case (the headline paste-from-CSV use case).
test.describe('Insert > Convert selection to table', () => {
  test('comma-separated lines become a 3-column table', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();

    // Three lines, three comma-separated fields each. Type with explicit
    // Enter so we get distinct paragraphs.
    await page.keyboard.type('Name, Role, City');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Ada, Engineer, London');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Grace, Scientist, Arlington');

    // Select everything.
    await editor.selectAll();

    // Open Insert → Convert selection to table.
    await page.getByRole('button', { name: 'Insert', exact: true }).click();
    await page.waitForSelector('[role="menu"]', { state: 'visible', timeout: 4000 });
    await page.getByRole('menuitem', { name: /Convert selection to table/ }).click();

    // A 3×3 table should appear inside the editor. Layout-painter tables
    // render as `.layout-table` (with rows / cells inside).
    const table = page.locator('.paged-editor__pages .layout-table').first();
    await expect(table).toBeVisible();
    // 3 rows of 3 cells = 9 cells total.
    await expect(table.locator('.layout-table-cell')).toHaveCount(9);
    await expect(table).toContainText(/Ada/);
    await expect(table).toContainText(/Scientist/);
    await page.screenshot({ path: 'screenshots/b8-converted.png' });
  });
});
