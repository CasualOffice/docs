import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// Quick translate path: when the user has translated something
// before (target language remembered in localStorage), the right-
// click menu shows a "Translate to <lang>" entry that fires the
// instant format-preserving replace. Without a remembered target,
// only the "Translate selection…" dialog entry is offered.
test.describe('Quick translate (right-click)', () => {
  test('no last target → only the dialog entry is in the menu', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await page.evaluate(() => window.localStorage.removeItem('translate:last-target'));
    await editor.typeText('Hello world quick translate');

    const isMac = await page.evaluate(() => /Mac/.test(navigator.platform));
    await page.keyboard.press(isMac ? 'Meta+a' : 'Control+a');

    const pages = page.locator('.paged-editor__pages').first();
    await pages.click({ button: 'right' });

    await expect(page.getByRole('menuitem', { name: /Translate selection/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Translate to/i })).toHaveCount(0);
  });

  test('remembered target shows "Translate to <lang>" entry', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await page.evaluate(() => window.localStorage.setItem('translate:last-target', 'es'));
    await editor.typeText('Hello world quick translate');

    const isMac = await page.evaluate(() => /Mac/.test(navigator.platform));
    await page.keyboard.press(isMac ? 'Meta+a' : 'Control+a');

    const pages = page.locator('.paged-editor__pages').first();
    await pages.click({ button: 'right' });

    await expect(page.getByRole('menuitem', { name: /Translate to Spanish/i })).toBeVisible();
  });
});
