import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// Status-bar zoom readout now opens a small presets popover (50/75/100/
// 125/150/200%) instead of resetting on click. Cmd+0 still resets, so
// the old reset path is unaffected.
test.describe('Status bar — zoom presets', () => {
  test('opens a popover with preset values and applies the picked one', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();

    const readout = page.getByTestId('zoom-readout');
    await expect(readout).toBeVisible();
    await expect(readout).toHaveText('100%');

    // No menu yet.
    await expect(page.getByTestId('zoom-presets-menu')).toHaveCount(0);

    await readout.click();
    const menu = page.getByTestId('zoom-presets-menu');
    await expect(menu).toBeVisible();
    // 6 presets.
    await expect(menu.getByRole('menuitem')).toHaveCount(6);
    // 100% is checked.
    await expect(menu.getByRole('menuitem', { name: /^100%/ })).toContainText('✓');

    // Pick 150%.
    await menu.getByRole('menuitem', { name: /^150%$/ }).click();
    await expect(menu).toHaveCount(0);
    await expect(readout).toHaveText('150%');
  });

  test('outside click closes the popover', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();

    await page.getByTestId('zoom-readout').click();
    await expect(page.getByTestId('zoom-presets-menu')).toBeVisible();

    // Click somewhere harmless on the doc area.
    await page.mouse.click(20, 20);
    await expect(page.getByTestId('zoom-presets-menu')).toHaveCount(0);
  });
});
