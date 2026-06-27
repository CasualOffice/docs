import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';
test('preview change navigation scrolls between changes', async ({ page }) => {
  test.setTimeout(70000);
  const editor = new EditorPage(page);
  await editor.goto(); await editor.waitForReady(); await editor.newDocument(); await editor.focus();
  // Build a tall doc.
  for (let i = 0; i < 20; i++) { await editor.typeText(`Original paragraph ${i} of the document body. `); await editor.pressEnter(); }
  await page.waitForTimeout(2200);
  await page.getByRole('button', { name: 'Version history' }).click();
  await page.waitForSelector('[data-testid="version-history-panel"]');
  page.once('dialog', (d) => d.accept('v1'));
  await page.getByTestId('version-history-save-version').click();
  await page.waitForSelector('[data-testid="version-history-version-row"]');
  // Edit near the top and near the bottom so changes are spread out.
  await editor.focus();
  await editor.selectText('Original paragraph 1 ');
  await editor.typeText('EDITED-TOP paragraph one ');
  await editor.selectText('Original paragraph 18 ');
  await editor.typeText('EDITED-BOTTOM paragraph eighteen ');
  page.once('dialog', (d) => d.accept('v2'));
  await page.getByTestId('version-history-save-version').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="version-history-version-row"]').length >= 2);
  // Preview the latest (v2) with show changes.
  await page.locator('[data-testid="version-history-version-row"]').first().click();
  await page.waitForSelector('[data-testid="version-preview-overlay"]');
  await page.waitForTimeout(400);
  await expect(page.getByTestId('version-preview-next-change')).toBeVisible();
  const scrollTop = () => page.evaluate(() => {
    const ov = document.querySelector('[data-testid="version-preview-overlay"]')!;
    const sc = Array.from(ov.querySelectorAll('div')).find(d => getComputedStyle(d).overflowY === 'auto') as HTMLElement;
    return sc?.scrollTop ?? -1;
  });
  const before = await scrollTop();
  await page.getByTestId('version-preview-next-change').click();
  await page.waitForTimeout(500);
  const after = await scrollTop();
  console.log('SCROLL before', before, 'after', after);
  expect(after).toBeGreaterThan(before);
});
