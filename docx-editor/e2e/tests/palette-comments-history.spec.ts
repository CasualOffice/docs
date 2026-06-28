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
    await page.getByTestId('command-palette-input').fill('Show comments');
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
    await page.getByTestId('command-palette-input').fill('version history');
    // Two commands match now — the File-menu "Version history" (discoverability)
    // and the View "Show version history" toggle. Either as the top hit is fine;
    // both open the panel, which is what we assert below.
    await expect(page.locator('[data-cp-index="0"]')).toContainText(/version history/i);
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('rail-history')).toHaveAttribute('aria-pressed', 'true');
  });
});
