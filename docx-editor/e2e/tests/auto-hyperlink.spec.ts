/**
 * Auto-hyperlink: typing a URL then space auto-links it (Word/GDocs
 * autoformat), and pasting a bare URL over a selection wraps the SELECTED
 * text in a link to that URL (Google Docs behaviour) rather than replacing it.
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

test.describe('Auto-hyperlink', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
  });

  test('typing a URL followed by a space auto-links it', async ({ page }) => {
    await editor.typeText('Visit http://example.com ');
    // The URL is now an anchor; the surrounding text is not.
    const link = page.locator('.paged-editor__hidden-pm .ProseMirror a[href="http://example.com"]');
    await expect(link).toHaveCount(1, { timeout: 2000 });
    await expect(link).toHaveText('http://example.com');
  });

  test('normalises a bare www. URL to an absolute href', async ({ page }) => {
    await editor.typeText('see www.example.org ');
    await expect(
      page.locator('.paged-editor__hidden-pm .ProseMirror a[href="http://www.example.org"]')
    ).toHaveCount(1, { timeout: 2000 });
  });

  test('trailing sentence punctuation is left out of the link', async ({ page }) => {
    await editor.typeText('see http://example.com. ');
    const link = page.locator('.paged-editor__hidden-pm .ProseMirror a[href="http://example.com"]');
    await expect(link).toHaveCount(1, { timeout: 2000 });
    await expect(link).toHaveText('http://example.com'); // not "http://example.com."
    // the period survives as plain text after the link
    await expect(page.locator('.paged-editor__hidden-pm .ProseMirror')).toContainText('com.');
  });

  test('a trailing unbalanced closing paren is left out of the link', async ({ page }) => {
    await editor.typeText('link http://example.com) ');
    const link = page.locator('.paged-editor__hidden-pm .ProseMirror a[href="http://example.com"]');
    await expect(link).toHaveCount(1, { timeout: 2000 });
    await expect(link).toHaveText('http://example.com');
  });

  test('a balanced paren inside the URL is kept', async ({ page }) => {
    await editor.typeText('ref www.example.org/a_(b) ');
    const link = page.locator(
      '.paged-editor__hidden-pm .ProseMirror a[href="http://www.example.org/a_(b)"]'
    );
    await expect(link).toHaveCount(1, { timeout: 2000 });
  });

  test('pasting a URL over a selection links the selection (keeps the text)', async ({ page }) => {
    await editor.typeText('Anchor text');
    await editor.selectText('Anchor text');

    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'https://example.com/page');
      const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'clipboardData', { value: dt });
      const target = document.querySelector('.paged-editor__hidden-pm .ProseMirror');
      target?.dispatchEvent(ev);
    });

    const link = page.locator(
      '.paged-editor__hidden-pm .ProseMirror a[href="https://example.com/page"]'
    );
    await expect(link).toHaveCount(1, { timeout: 2000 });
    // The original text is preserved (not replaced by the URL).
    await expect(link).toHaveText('Anchor text');
  });
});
