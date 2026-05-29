import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// F6 — View → "Show non-printing characters" toggles a CSS class on the
// pages container; the painter output isn't touched. Verify the toggle
// reaches the DOM (class flip) and the rendered ¶ glyph is visible.
test.describe('View > Show non-printing characters', () => {
  test('toggle flips the .paged-editor--show-marks class and surfaces ¶', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
    await editor.typeText('Hello world');

    const pages = page.locator('.paged-editor__pages');
    await expect(pages).toBeVisible();
    await expect(pages).not.toHaveClass(/paged-editor--show-marks/);
    await page.screenshot({ path: 'screenshots/f6-off.png' });

    // Toggle on via View menu.
    await page.getByRole('button', { name: 'View', exact: true }).click();
    await page.waitForSelector('[role="menu"]', { state: 'visible', timeout: 4000 });
    const menuItem = page.getByRole('menuitem', { name: /Show non-printing characters/ });
    await expect(menuItem).toBeVisible();
    await menuItem.click();

    // The class arrives; the ¶ pseudo-element is rendered by CSS so we can't
    // text-match it in the DOM — instead we sanity-check the class flip and
    // capture a screenshot for visual inspection.
    await expect(pages).toHaveClass(/paged-editor--show-marks/);
    await page.screenshot({ path: 'screenshots/f6-on.png' });

    // Reopen menu — checkmark prefix is on the active item.
    await page.getByRole('button', { name: 'View', exact: true }).click();
    await page.waitForSelector('[role="menu"]', { state: 'visible', timeout: 4000 });
    await expect(
      page.getByRole('menuitem', { name: /✓\s+Show non-printing characters/ })
    ).toBeVisible();
    await page.keyboard.press('Escape');

    // Toggling off removes the class again.
    await page.getByRole('button', { name: 'View', exact: true }).click();
    await page.getByRole('menuitem', { name: /Show non-printing characters/ }).click();
    await expect(pages).not.toHaveClass(/paged-editor--show-marks/);
  });
});
