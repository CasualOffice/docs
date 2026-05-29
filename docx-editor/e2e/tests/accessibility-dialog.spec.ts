import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// D8: Tools → Accessibility opens a read-only summary of issues found
// in the current document. Empty doc → "No issues" empty state.
test.describe('Tools > Accessibility', () => {
  test('appears in the Tools menu and shows the empty state for a clean doc', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
    await editor.typeText('Just plain prose. No images, no skipped headings.');

    // Tools menu has Accessibility…
    await page.getByRole('button', { name: 'Tools', exact: true }).click();
    await page.waitForSelector('[role="menu"]', { state: 'visible', timeout: 4000 });
    const item = page.getByRole('menuitem', { name: /Accessibility/ });
    await expect(item).toBeVisible();
    await page.screenshot({ path: 'screenshots/d8-tools.png' });
    await item.click();

    // Dialog opens with empty state.
    const dlg = page.getByTestId('accessibility-dialog');
    await expect(dlg).toBeVisible();
    await expect(page.getByTestId('accessibility-empty')).toBeVisible();
    await page.screenshot({ path: 'screenshots/d8-empty.png' });
  });
});
