/**
 * Auto-list: typing a list marker at the start of a paragraph followed by a
 * space converts it to a list (Word / Google Docs autoformat).
 *   "-" / "*" / "+"  → bullet list
 *   "1." / "1)"      → numbered list
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

test.describe('Auto-list', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
  });

  test('"- " at line start creates a bullet list and consumes the marker', async ({ page }) => {
    await editor.typeText('- Buy milk');
    // A list marker is painted, and the typed "-" is gone from the content.
    await expect(page.locator('.layout-list-marker')).toHaveCount(1, { timeout: 2000 });
    const text = await page.locator('.paged-editor__hidden-pm .ProseMirror').innerText();
    expect(text).toContain('Buy milk');
    expect(text).not.toContain('- Buy milk');
  });

  test('"1. " at line start creates a numbered list', async ({ page }) => {
    await editor.typeText('1. First');
    const marker = page.locator('.layout-list-marker');
    await expect(marker).toHaveCount(1, { timeout: 2000 });
    await expect(marker).toContainText('1');
  });

  test('a marker mid-paragraph does NOT trigger auto-list', async ({ page }) => {
    await editor.typeText('a - b');
    await expect(page.locator('.layout-list-marker')).toHaveCount(0);
  });
});
