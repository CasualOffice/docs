import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// E3 — when editingMode === 'suggesting', a thin yellow banner sits
// between the toolbar and the pages. The banner is purely visual chrome;
// the actual "track changes" plumbing is exercised elsewhere. Clicking
// "Switch to editing" flips the mode back and the banner disappears.
test.describe('Suggesting-mode banner (E3)', () => {
  test('appears when switching to Suggesting and the switch button restores Editing', async ({
    page,
  }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();

    // Banner is absent in Editing mode.
    await expect(page.getByTestId('suggesting-mode-banner')).toHaveCount(0);

    // Open the mode dropdown and pick Suggesting.
    const trigger = page.getByRole('button', { name: /Ctrl\+Shift\+E/ }).first();
    await trigger.click();
    await page.getByRole('button', { name: /Suggesting/ }).click();

    // Banner is visible now.
    const banner = page.getByTestId('suggesting-mode-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/Suggesting/);
    await page.screenshot({ path: 'screenshots/e3-banner.png' });

    // Click "Switch to editing" → banner disappears.
    await page.getByTestId('suggesting-banner-switch').click();
    await expect(page.getByTestId('suggesting-mode-banner')).toHaveCount(0);
  });
});
