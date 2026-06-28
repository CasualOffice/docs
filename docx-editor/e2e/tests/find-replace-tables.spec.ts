import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * Find & Replace is PM-native (walks the ProseMirror doc), so it searches and
 * replaces inside table cells — the old Document-model search skipped tables.
 */
async function modKey(page: import('@playwright/test').Page) {
  return /Win/i.test(await page.evaluate(() => navigator.platform)) ? 'Control' : 'Meta';
}

test('find counts matches in body and table cells; Replace All replaces all', async ({ page }) => {
  test.setTimeout(60000);
  const ed = new EditorPage(page);
  await ed.goto();
  await ed.waitForReady();
  await ed.newDocument();
  await ed.focus();
  await ed.typeText('before TARGET');
  await page.keyboard.press('Enter');
  await ed.insertTable(2, 2);
  await page.waitForTimeout(300);

  const cells = page.locator('.layout-table-cell');
  await cells.nth(0).click();
  await ed.typeText('TARGET in cell');
  await cells.nth(3).click();
  await ed.typeText('another TARGET here');
  await page.waitForTimeout(200);

  const mod = await modKey(page);
  await page.keyboard.press(`${mod}+h`);
  const dlg = page.locator('[data-testid="find-replace-dialog"]');
  await dlg.waitFor({ timeout: 3000 });
  await page.locator('[data-testid="find-input"]').fill('TARGET');
  await page.locator('[data-testid="find-input"]').press('Enter');
  await page.waitForTimeout(300);

  // 1 in the body paragraph + 1 in each of two cells = 3.
  expect((await dlg.innerText()).match(/of (\d+) matches/)?.[1]).toBe('3');

  await page.locator('#replace-text').fill('FOUND');
  await page.waitForTimeout(120);
  await dlg.getByRole('button', { name: /^Replace All$/ }).click();
  await page.waitForTimeout(400);

  const body = (await page.locator('.paged-editor__pages').innerText()).replace(/\s+/g, ' ');
  expect(body).not.toContain('TARGET');
  expect((await cells.allInnerTexts()).join('|')).toContain('FOUND');
});

test('case and whole-word options narrow the match set', async ({ page }) => {
  test.setTimeout(60000);
  const ed = new EditorPage(page);
  await ed.goto();
  await ed.waitForReady();
  await ed.newDocument();
  await ed.focus();
  await ed.typeText('Cat cat CATatonic cats');
  await page.waitForTimeout(200);

  const mod = await modKey(page);
  await page.keyboard.press(`${mod}+f`);
  const dlg = page.locator('[data-testid="find-replace-dialog"]');
  await dlg.waitFor({ timeout: 3000 });
  const fi = page.locator('[data-testid="find-input"]');
  await fi.fill('cat');
  await fi.press('Enter');
  await page.waitForTimeout(300);
  expect((await dlg.innerText()).match(/of (\d+) matches/)?.[1]).toBe('4');

  await dlg.getByText(/Match case/i).click();
  await page.waitForTimeout(300);
  expect((await dlg.innerText()).match(/of (\d+) matches/)?.[1]).toBe('2');

  await dlg.getByText(/Whole words/i).click();
  await page.waitForTimeout(300);
  expect((await dlg.innerText()).match(/of (\d+) matches/)?.[1]).toBe('1');
});
