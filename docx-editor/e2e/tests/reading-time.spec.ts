import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// Status bar shows "~N min read" alongside word count at the standard
// 200-wpm baseline. Hidden on an empty doc.
test.describe('Status bar — reading time', () => {
  test('hidden when the document is empty', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await expect(page.getByTestId('status-reading-time')).toHaveCount(0);
  });

  test('appears as ~1 min read for a short paragraph', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
    await editor.typeText('Just a quick sentence with a handful of words.');
    const cell = page.getByTestId('status-reading-time');
    await expect(cell).toBeVisible();
    await expect(cell).toHaveText('~1 min read');
  });

  test('scales linearly with word count', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
    // 410 words → ceil(410/200) = 3 min read.
    await editor.typeText(Array(410).fill('lorem').join(' '));
    await expect(page.getByTestId('status-reading-time')).toHaveText('~3 min read');
  });
});
