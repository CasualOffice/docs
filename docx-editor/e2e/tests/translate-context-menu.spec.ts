import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// Right-click translate flow:
// - Selection in document → right-click → "Translate selection…" entry
//   appears.
// - Clicking it opens the TranslateDialog seeded with the selection.
// - The dialog now has a "Replace in document" button (not just Copy)
//   because the editor opened it with a saved selection range.
test.describe('Right-click translate', () => {
  test('selection right-click opens the translate dialog with Replace button', async ({
    page,
  }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();

    // Type something so there's a selection
    await editor.typeText('Hello world from playwright');
    // Select everything we just typed
    const isMac = await page.evaluate(() => /Mac/.test(navigator.platform));
    await page.keyboard.press(isMac ? 'Meta+a' : 'Control+a');

    // Right-click in the editor surface to surface the context menu
    const pages = page.locator('.paged-editor__pages').first();
    await pages.click({ button: 'right' });

    // The "Translate selection…" entry should be present
    const translateItem = page.getByRole('menuitem', { name: /Translate selection/i });
    await expect(translateItem).toBeVisible();
    await translateItem.click();

    // Dialog opens; Replace button is mounted (translateRange was set)
    const dialog = page.getByTestId('translate-dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('translate-replace')).toBeVisible();
  });

  test('no selection — Translate entry is not in the menu', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();

    const pages = page.locator('.paged-editor__pages').first();
    await pages.click({ button: 'right' });

    await expect(
      page.getByRole('menuitem', { name: /Translate selection/i })
    ).toHaveCount(0);
  });
});
