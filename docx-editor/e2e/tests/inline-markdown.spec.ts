/**
 * Inline-markdown autoformat: typing `*italic*` / `**bold**` applies the mark.
 * Spaced asterisks (`2 * 3`) must NOT trigger.
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

const PM = '.paged-editor__hidden-pm .ProseMirror';

test.describe('Inline markdown', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
  });

  test('**bold** applies bold and removes the asterisks', async ({ page }) => {
    await editor.typeText('say **hi** now');
    const strong = page.locator(`${PM} strong`);
    await expect(strong).toHaveText('hi', { timeout: 2000 });
    const text = await page.locator(PM).innerText();
    expect(text).toContain('say hi now');
    expect(text).not.toContain('*');
  });

  test('*italic* applies italic and removes the asterisks', async ({ page }) => {
    await editor.typeText('an *em* word');
    const em = page.locator(`${PM} em`);
    await expect(em).toHaveText('em', { timeout: 2000 });
    const text = await page.locator(PM).innerText();
    expect(text).toContain('an em word');
    expect(text).not.toContain('*');
  });

  test('spaced asterisks (2 * 3) do NOT trigger italic', async ({ page }) => {
    await editor.typeText('2 * 3 * 4');
    await expect(page.locator(`${PM} em`)).toHaveCount(0);
    await expect(page.locator(`${PM} strong`)).toHaveCount(0);
    const text = await page.locator(PM).innerText();
    expect(text).toContain('2 * 3 * 4');
  });
});
