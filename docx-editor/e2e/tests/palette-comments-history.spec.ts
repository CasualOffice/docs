import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';
import { modifierKey } from '../helpers/keyboard';

// PanelRail owns the Comments + Version-history toggles; the palette
// now mirrors them so Cmd+Shift+P finds them by name.
test.describe('Command palette — rail toggles', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      try {
        window.localStorage.removeItem('docx-editor-palette-recents');
      } catch {
        /* private mode */
      }
    });
  });

  test('"comments" finds Show comments and clicking it presses the rail button', async ({
    page,
  }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();

    const mod = await modifierKey(page);
    await page.keyboard.press(`${mod}+Shift+p`);
    await page.getByPlaceholder('Type a command…').fill('Show comments');
    await expect(page.locator('[data-cp-index="0"]')).toContainText('Show comments');
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('rail-comments')).toHaveAttribute('aria-pressed', 'true');
  });

  test('"version history" finds Show version history', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();

    const mod = await modifierKey(page);
    await page.keyboard.press(`${mod}+Shift+p`);
    await page.getByPlaceholder('Type a command…').fill('version history');
    await expect(page.locator('[data-cp-index="0"]')).toContainText('Show version history');
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('rail-history')).toHaveAttribute('aria-pressed', 'true');
  });
});
