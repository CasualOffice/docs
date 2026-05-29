import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

test.describe('File > Make a copy', () => {
  test('appears in the File menu and downloads "Copy of <name>.docx"', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
    await editor.typeText('Content to copy.');

    // Open File menu and confirm the item is present.
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.waitForSelector('[role="menu"]', { state: 'visible', timeout: 4000 });
    const item = page.getByRole('menuitem', { name: 'Make a copy' });
    await expect(item).toBeVisible();

    // Click it and capture the resulting download.
    const downloadPromise = page.waitForEvent('download', { timeout: 8000 });
    await page.evaluate(() => {
      const it = Array.from(document.querySelectorAll('[role="menuitem"]')).find(
        (e) => (e.textContent || '').trim().toLowerCase().startsWith('make a copy')
      );
      (it as HTMLElement | undefined)?.click();
    });
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^Copy of .+\.docx$/);
  });
});
