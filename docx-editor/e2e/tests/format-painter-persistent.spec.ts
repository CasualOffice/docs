import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * Format painter: a single click paints one target then disarms (one-shot); a
 * double-click arms persistent mode (paint many targets until Esc / another
 * click), matching Google Docs.
 */
const PAINT = '[aria-label="Paint format"]';

async function weightOf(page: import('@playwright/test').Page, text: string) {
  return page.evaluate((t) => {
    const span = [...document.querySelectorAll('.paged-editor__pages span')].find(
      (s) => s.textContent === t
    );
    return span ? getComputedStyle(span).fontWeight : '?';
  }, text);
}

test('double-click paints multiple targets; Escape disarms', async ({ page }) => {
  test.setTimeout(60000);
  const ed = new EditorPage(page);
  await ed.goto();
  await ed.waitForReady();
  await ed.newDocument();
  await ed.focus();
  await ed.typeText('SRC one two');
  await page.waitForTimeout(150);
  const mod = /Mac/i.test(await page.evaluate(() => navigator.platform)) ? 'Meta' : 'Control';
  await ed.selectText('SRC');
  await page.keyboard.press(`${mod}+b`);
  await page.waitForTimeout(150);

  await page.locator(PAINT).first().dblclick();
  await page.waitForTimeout(200);

  await ed.selectText('one');
  await page.waitForTimeout(250);
  await ed.selectText('two');
  await page.waitForTimeout(250);
  expect(await weightOf(page, 'one')).toBe('700');
  expect(await weightOf(page, 'two')).toBe('700');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  expect(
    (await page.locator(PAINT).first().getAttribute('class'))?.includes('doc-primary-light')
  ).toBe(false);
});

test('single click paints one target then disarms', async ({ page }) => {
  test.setTimeout(60000);
  const ed = new EditorPage(page);
  await ed.goto();
  await ed.waitForReady();
  await ed.newDocument();
  await ed.focus();
  await ed.typeText('SRC aaa bbb');
  await page.waitForTimeout(150);
  const mod = /Mac/i.test(await page.evaluate(() => navigator.platform)) ? 'Meta' : 'Control';
  await ed.selectText('SRC');
  await page.keyboard.press(`${mod}+b`);
  await page.waitForTimeout(150);

  await page.locator(PAINT).first().click();
  await page.waitForTimeout(150);
  await ed.selectText('aaa');
  await page.waitForTimeout(250);
  await ed.selectText('bbb');
  await page.waitForTimeout(250);
  expect(await weightOf(page, 'aaa')).toBe('700');
  expect(await weightOf(page, 'bbb')).not.toBe('700');
});
