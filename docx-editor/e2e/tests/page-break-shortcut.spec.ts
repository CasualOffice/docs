import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';
import { modifierKey } from '../helpers/keyboard';

// Cmd/Ctrl+Enter inserts a page break — Word convention. The painter
// renders pageBreak nodes as `div.docx-page-break` (see PageBreakExtension
// `toDOM`), so the spec asserts that element shows up in the hidden PM
// view after the keypress.
test('Cmd+Enter inserts a page break', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.newDocument();
  await editor.focus();
  await editor.typeText('before break');

  // No page break yet.
  await expect(page.locator('.ProseMirror .docx-page-break')).toHaveCount(0);

  const mod = await modifierKey(page);
  await page.keyboard.press(`${mod}+Enter`);

  await expect(page.locator('.ProseMirror .docx-page-break')).toHaveCount(1);
});
