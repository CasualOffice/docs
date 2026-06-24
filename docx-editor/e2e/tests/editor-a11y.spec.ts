/**
 * Editor accessibility contract
 *
 * The editor paints the visible document as a static, `aria-hidden` layer and
 * keeps the real ProseMirror off-screen. For screen-reader users that only works
 * if the off-screen editor is (a) NOT hidden from the accessibility tree, (b)
 * named and typed as a multi-line textbox, and (c) actually carrying the
 * document's text. This guards that contract so a future refactor can't silently
 * turn the editor into an anonymous or invisible edit field.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EMPTY_DOCX = path.join(__dirname, '..', 'fixtures', 'empty.docx');

test.describe('Editor accessibility', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.loadDocxFile(EMPTY_DOCX);
  });

  test('visible pages are hidden from AT; off-screen editor is a named textbox carrying the text', async ({
    page,
  }) => {
    // Visual layer is decorative — must not be double-read by screen readers.
    await expect(page.locator('.paged-editor__pages')).toHaveAttribute('aria-hidden', 'true');

    const pm = page.locator('.paged-editor__hidden-pm .ProseMirror');
    await expect(pm).toHaveAttribute('role', 'textbox');
    await expect(pm).toHaveAttribute('aria-multiline', 'true');
    await expect(pm).toHaveAttribute('aria-label', /\S+/); // non-empty accessible name
    await expect(pm).toHaveAttribute('contenteditable', 'true');

    // The named editor must not be buried under an aria-hidden ancestor, or AT
    // would skip it entirely despite the attributes above.
    const buried = await page.evaluate(() => {
      const host = document.querySelector('.paged-editor__hidden-pm');
      for (let el = host?.parentElement; el; el = el.parentElement) {
        if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') {
          return el.className || el.tagName;
        }
      }
      return null;
    });
    expect(buried).toBeNull();

    // AT reads the real document content, not an empty shell.
    await editor.focus();
    await page.keyboard.type('Screen reader visible text.');
    await expect(pm).toContainText('Screen reader visible text.');
  });
});
