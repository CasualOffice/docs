import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// View menu has a "Show document outline" entry alongside Show ruler /
// Show non-printing characters. Clicking it toggles the panel; the
// checkmark prefix flips state.
test.describe('View > Show document outline', () => {
  test('clicking the menu entry opens the outline panel', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();

    await page.getByRole('button', { name: 'View', exact: true }).click();
    await page.waitForSelector('[role="menu"]', { state: 'visible', timeout: 4000 });
    const item = page.getByRole('menuitem', { name: /Show document outline/ });
    await expect(item).toBeVisible();
    await item.click();

    await expect(page.getByRole('navigation', { name: 'Document outline' })).toBeVisible();

    // Reopen → checkmark prefix.
    await page.getByRole('button', { name: 'View', exact: true }).click();
    await page.waitForSelector('[role="menu"]', { state: 'visible', timeout: 4000 });
    await expect(
      page.getByRole('menuitem', { name: /✓\s+Show document outline/ })
    ).toBeVisible();
  });
});
