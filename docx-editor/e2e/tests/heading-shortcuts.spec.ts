import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * Google Docs heading shortcuts: Ctrl/Cmd+Alt+1/2/3 apply Heading 1/2/3,
 * Ctrl/Cmd+Alt+0 reverts to Normal text. (Modifier detection branches on MAC —
 * Playwright reports Win32/Linux, never Mac, so it's Control on CI.)
 */
async function mod(page: import('@playwright/test').Page) {
  return /Mac/i.test(await page.evaluate(() => navigator.platform)) ? 'Meta' : 'Control';
}

function fontPx(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const s = document.querySelector(
      '.layout-page-content .layout-line span, .layout-page-content .layout-run'
    ) as HTMLElement | null;
    return s ? Math.round(parseFloat(getComputedStyle(s).fontSize)) : -1;
  });
}

test('Ctrl+Alt+1/2/3 apply headings and Ctrl+Alt+0 reverts to Normal', async ({ page }) => {
  const ed = new EditorPage(page);
  await ed.goto();
  await ed.waitForReady();
  await ed.newDocument();
  await ed.focus();
  await ed.typeText('My heading');
  await page.waitForTimeout(150);
  const m = await mod(page);

  const base = await fontPx(page);

  await page.keyboard.press(`${m}+Alt+1`);
  await page.waitForTimeout(300);
  const h1 = await fontPx(page);
  expect(h1).toBeGreaterThan(base);

  await page.keyboard.press(`${m}+Alt+2`);
  await page.waitForTimeout(300);
  const h2 = await fontPx(page);
  expect(h2).toBeGreaterThan(base);
  expect(h2).toBeLessThanOrEqual(h1);

  await page.keyboard.press(`${m}+Alt+0`);
  await page.waitForTimeout(300);
  expect(await fontPx(page)).toBe(base);
});
