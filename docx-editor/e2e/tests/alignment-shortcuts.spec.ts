import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * Paragraph alignment keyboard shortcuts. The editor binds both Word's
 * Ctrl+L/E/R/J and Google Docs' Ctrl+Shift+L/E/R/J so either muscle memory
 * works. (Detect the modifier from navigator.platform — branch on MAC, never
 * WIN; Playwright reports Win32/Linux, never Mac, so this is Control on CI.)
 */
async function mod(page: import('@playwright/test').Page) {
  return /Mac/i.test(await page.evaluate(() => navigator.platform)) ? 'Meta' : 'Control';
}

async function align(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const p = document.querySelector(
      '.layout-page-content .layout-paragraph'
    ) as HTMLElement | null;
    return p ? getComputedStyle(p).textAlign : '?';
  });
}

test('Google Docs Ctrl+Shift+L/E/R/J set alignment', async ({ page }) => {
  const ed = new EditorPage(page);
  await ed.goto();
  await ed.waitForReady();
  await ed.newDocument();
  await ed.focus();
  await ed.typeText('align me');
  await page.waitForTimeout(150);
  const m = await mod(page);

  await page.keyboard.press(`${m}+Shift+e`);
  await page.waitForTimeout(200);
  expect(await align(page)).toBe('center');

  await page.keyboard.press(`${m}+Shift+r`);
  await page.waitForTimeout(200);
  expect(await align(page)).toBe('right');

  await page.keyboard.press(`${m}+Shift+l`);
  await page.waitForTimeout(200);
  expect(['left', 'start']).toContain(await align(page));
});

test("Word's Ctrl+E/R/L still work", async ({ page }) => {
  const ed = new EditorPage(page);
  await ed.goto();
  await ed.waitForReady();
  await ed.newDocument();
  await ed.focus();
  await ed.typeText('align me');
  await page.waitForTimeout(150);
  const m = await mod(page);

  await page.keyboard.press(`${m}+e`);
  await page.waitForTimeout(200);
  expect(await align(page)).toBe('center');

  await page.keyboard.press(`${m}+r`);
  await page.waitForTimeout(200);
  expect(await align(page)).toBe('right');
});
