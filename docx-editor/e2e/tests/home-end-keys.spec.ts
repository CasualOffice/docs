import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * Home / End move the caret to the start / end of the current VISUAL line,
 * measured against the painted (paginated) layout. The real editing state
 * lives in an off-screen ProseMirror whose native Home/End map to ITS line
 * wrapping, not what the user sees — so the nav hook handles them explicitly.
 */
test('Home and End move to line start and end', async ({ page }) => {
  const ed = new EditorPage(page);
  await ed.goto();
  await ed.waitForReady();
  await ed.newDocument();
  await ed.focus();
  await ed.typeText('hello world');
  await page.waitForTimeout(120);

  await page.keyboard.press('Home');
  await page.waitForTimeout(80);
  await ed.typeText('X');
  await page.waitForTimeout(120);
  expect(await page.locator('.paged-editor__pages').innerText()).toContain('Xhello world');

  await page.keyboard.press('End');
  await page.waitForTimeout(80);
  await ed.typeText('Y');
  await page.waitForTimeout(120);
  expect(await page.locator('.paged-editor__pages').innerText()).toContain('Xhello worldY');
});

test('Shift+Home extends the selection to line start', async ({ page }) => {
  const ed = new EditorPage(page);
  await ed.goto();
  await ed.waitForReady();
  await ed.newDocument();
  await ed.focus();
  await ed.typeText('abcdef');
  await page.waitForTimeout(120);

  await page.keyboard.press('Shift+Home');
  await page.waitForTimeout(80);
  await ed.typeText('Z'); // typing replaces the selection
  await page.waitForTimeout(120);
  expect((await page.locator('.paged-editor__pages').innerText()).trim()).toBe('Z');
});

test('Home goes to the visual-line start on a wrapped paragraph', async ({ page }) => {
  const ed = new EditorPage(page);
  await ed.goto();
  await ed.waitForReady();
  await ed.newDocument();
  await ed.focus();
  await ed.typeText('wordA '.repeat(40).trim());
  await page.waitForTimeout(200);

  const lines = await page.locator('.layout-page-content .layout-line').count();
  expect(lines).toBeGreaterThan(1);

  // Caret is on the last visual line; Home → start of THAT line, not the doc.
  await page.keyboard.press('Home');
  await page.waitForTimeout(80);
  await ed.typeText('@');
  await page.waitForTimeout(150);
  const body = await page.locator('.paged-editor__pages').innerText();
  expect(body.trimStart().startsWith('@')).toBe(false);
});
