import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * Ctrl+] / Ctrl+[ (Google Docs) indent / outdent. Inside a list they bump the
 * list level; on a plain paragraph they change the left indent. Indent shifts
 * the painted TEXT right (the paragraph container stays full-width and
 * absolutely positioned), so we measure the first run's screen x.
 */
async function mod(page: import('@playwright/test').Page) {
  return /Mac/i.test(await page.evaluate(() => navigator.platform)) ? 'Meta' : 'Control';
}

function textX(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const s = document.querySelector(
      '.layout-page-content .layout-line span, .layout-page-content .layout-run'
    ) as HTMLElement | null;
    return s ? Math.round(s.getBoundingClientRect().x) : -1;
  });
}

test('Ctrl+] indents and Ctrl+[ outdents a plain paragraph', async ({ page }) => {
  const ed = new EditorPage(page);
  await ed.goto();
  await ed.waitForReady();
  await ed.newDocument();
  await ed.focus();
  await ed.typeText('indent me please');
  await page.waitForTimeout(150);
  const m = await mod(page);

  const x0 = await textX(page);
  await page.keyboard.press(`${m}+]`);
  await page.waitForTimeout(300);
  const x1 = await textX(page);
  expect(x1).toBeGreaterThan(x0);

  await page.keyboard.press(`${m}+]`);
  await page.waitForTimeout(300);
  const x2 = await textX(page);
  expect(x2).toBeGreaterThan(x1);

  await page.keyboard.press(`${m}+[`);
  await page.waitForTimeout(300);
  expect(await textX(page)).toBeLessThan(x2);
});

test('Ctrl+] still nests inside a list', async ({ page }) => {
  const ed = new EditorPage(page);
  await ed.goto();
  await ed.waitForReady();
  await ed.newDocument();
  await ed.focus();
  await ed.applyBulletList();
  await ed.typeText('a');
  await page.keyboard.press('Enter');
  await ed.typeText('b');
  await page.waitForTimeout(150);

  await page.keyboard.press(`${await mod(page)}+]`);
  await page.waitForTimeout(300);
  // Still a list (two markers) — Ctrl+] bumped the level, didn't unlist.
  expect(await page.locator('.layout-list-marker').count()).toBe(2);
});
