import { expect, test } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';
import { modifierKey } from '../helpers/keyboard';

test.describe('Find/replace shortcuts', () => {
  test('opens editor find by default', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();

    const mod = await modifierKey(page);
    await page.keyboard.press(`${mod}+f`);

    await editor.findReplaceDialog.waitFor();
  });

  test('can leave native browser find shortcut alone', async ({ page }) => {
    await page.goto('/?e2e=1&disableFindReplaceShortcuts=1');
    const editor = new EditorPage(page);
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();

    const mod = await modifierKey(page);
    await page.keyboard.press(`${mod}+f`);

    await expect(editor.findReplaceDialog).toHaveCount(0);
  });
});
