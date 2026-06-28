import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * PageUp / PageDown scroll the visible viewport by ~one page (Google Docs —
 * the caret stays). The off-screen ProseMirror's native paging scrolls its
 * hidden area, not the paginated pages, so the nav hook handles it against the
 * real scroll container.
 */
function maxScrollTop(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    let best = 0;
    document.querySelectorAll<HTMLElement>('*').forEach((el) => {
      if (el.scrollHeight - el.clientHeight > 50 && el.scrollTop > best) best = el.scrollTop;
    });
    return best;
  });
}

test('PageDown scrolls down and PageUp scrolls back up', async ({ page }) => {
  test.setTimeout(60000);
  const ed = new EditorPage(page);
  await ed.goto();
  await ed.waitForReady();
  await ed.newDocument();
  await ed.focus();
  // Fill well past one viewport.
  for (let i = 0; i < 70; i++) {
    await ed.typeText('Line ' + i);
    await page.keyboard.press('Enter');
  }
  await page.waitForTimeout(300);

  const mod = /Mac/i.test(await page.evaluate(() => navigator.platform)) ? 'Meta' : 'Control';
  await page.keyboard.press(`${mod}+Home`);
  await page.waitForTimeout(200);

  const s0 = await maxScrollTop(page);
  await page.keyboard.press('PageDown');
  await page.waitForTimeout(300);
  const s1 = await maxScrollTop(page);
  expect(s1).toBeGreaterThan(s0);

  await page.keyboard.press('PageDown');
  await page.waitForTimeout(300);
  const s2 = await maxScrollTop(page);
  expect(s2).toBeGreaterThan(s1);

  await page.keyboard.press('PageUp');
  await page.waitForTimeout(300);
  expect(await maxScrollTop(page)).toBeLessThan(s2);
});
