import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';
import { modifierKey } from '../helpers/keyboard';

// The Keyboard Shortcuts dialog now documents the shortcuts wired in
// DocxEditor's global keydown handler (palette, word count, dictionary,
// mode cycle, comment, bullet list). This spec pins them.
test('Keyboard Shortcuts dialog lists the global shortcuts', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.newDocument();
  await editor.focus();

  const mod = await modifierKey(page);
  await page.keyboard.press(`${mod}+/`);

  // Wait for the dialog. It uses a focus trap; the search input shows up.
  const search = page.getByPlaceholder(/search/i).first();
  await search.waitFor({ state: 'visible', timeout: 4000 });

  for (const name of [
    'Search the menus',
    'Word count',
    'Dictionary',
    'Cycle editing mode',
    'New comment',
    'Bullet list',
  ]) {
    await search.fill(name);
    await expect(page.locator('body')).toContainText(name);
  }
});
