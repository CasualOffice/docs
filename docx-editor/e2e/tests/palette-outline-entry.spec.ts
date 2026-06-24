import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';
import { modifierKey } from '../helpers/keyboard';

// Outline toggle is now in the command palette too. Label flips with
// state, so "Show" → "Hide" after first run.
test('Command palette can toggle the document outline', async ({ page, context }) => {
  await context.addInitScript(() => {
    try {
      window.localStorage.removeItem('docx-editor-palette-recents');
    } catch {
      /* private mode */
    }
  });
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.newDocument();
  await editor.focus();
  const mod = await modifierKey(page);
  await page.keyboard.press(`${mod}+Shift+p`);

  const input = page.getByTestId('command-palette-input');
  await input.fill('outline');
  await expect(page.locator('[data-cp-index="0"]')).toContainText('Show document outline');
  await page.keyboard.press('Enter');

  await expect(page.getByRole('navigation', { name: 'Document outline' })).toBeVisible();

  // Reopen → label flipped to Hide.
  await page.keyboard.press(`${mod}+Shift+p`);
  await page.getByTestId('command-palette-input').fill('outline');
  await expect(page.locator('[data-cp-index="0"]')).toContainText('Hide document outline');
});
