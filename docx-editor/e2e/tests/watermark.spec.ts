import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// C5 Pass 1+2: Watermark dialog + rendering. Round-trip is a follow-up.
test.describe('Insert > Watermark', () => {
  test('apply sets a rendered overlay; remove clears it', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
    await editor.typeText('Body content that the watermark sits behind.');

    // Insert > Watermark…
    await page.getByRole('button', { name: 'Insert', exact: true }).click();
    await page.waitForSelector('[role="menu"]', { state: 'visible', timeout: 4000 });
    await page.screenshot({ path: 'screenshots/c5-insert-menu.png' });
    await page.getByRole('menuitem', { name: /Watermark/ }).click();

    // Dialog open.
    const dlg = page.getByTestId('watermark-dialog');
    await expect(dlg).toBeVisible();
    await page.screenshot({ path: 'screenshots/c5-dialog.png' });

    // Set text, apply.
    await page.getByTestId('watermark-text-input').fill('DRAFT');
    await page.getByTestId('watermark-apply').click();
    await expect(dlg).not.toBeVisible();
    await page.waitForTimeout(300);

    // Overlay rendered on the page.
    const wm = page.locator('.layout-page-watermark span').first();
    await expect(wm).toBeVisible();
    await expect(wm).toHaveText('DRAFT');
    await page.screenshot({ path: 'screenshots/c5-rendered.png' });

    // Re-open dialog (current value is now set), Remove.
    await page.getByRole('button', { name: 'Insert', exact: true }).click();
    await page.getByRole('menuitem', { name: /Watermark/ }).click();
    await expect(page.getByTestId('watermark-text-input')).toHaveValue('DRAFT');
    await page.getByTestId('watermark-remove').click();
    await page.waitForTimeout(300);
    await expect(page.locator('.layout-page-watermark')).toHaveCount(0);
  });
});
