import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';
import { modifierKey } from '../helpers/keyboard';

// Mod+Shift+H toggles the document outline panel. Tooltip on the
// floating button surfaces the shortcut chip.
test.describe('Outline keyboard shortcut', () => {
  test('Mod+Shift+H opens and closes the outline', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();

    // Closed initially — the panel's <nav> isn't in the DOM.
    await expect(page.getByRole('navigation', { name: 'Document outline' })).toHaveCount(0);

    const mod = await modifierKey(page);
    await page.keyboard.press(`${mod}+Shift+h`);
    await expect(page.getByRole('navigation', { name: 'Document outline' })).toBeVisible();

    // Toggle off.
    await page.keyboard.press(`${mod}+Shift+h`);
    await expect(page.getByRole('navigation', { name: 'Document outline' })).toHaveCount(0);
  });
});
