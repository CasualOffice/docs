import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * Find highlights every match over the visible pages (yellow) and marks the
 * current one distinctly (orange), painted by DecorationLayer from the
 * findHighlightPlugin's inline decorations. Closing find clears them.
 */
const OVERLAY = '.paged-editor__decoration-overlay';

test('find highlights all matches, marks the current one, clears on close', async ({ page }) => {
  test.setTimeout(60000);
  const ed = new EditorPage(page);
  await ed.goto();
  await ed.waitForReady();
  await ed.newDocument();
  await ed.focus();
  await ed.typeText('apple banana apple cherry apple');
  await page.waitForTimeout(200);

  const mod = /Win/i.test(await page.evaluate(() => navigator.platform)) ? 'Control' : 'Meta';
  await page.keyboard.press(`${mod}+f`);
  await page.locator('[data-testid="find-replace-dialog"]').waitFor({ timeout: 3000 });
  await page.locator('[data-testid="find-input"]').fill('apple');
  await page.locator('[data-testid="find-input"]').press('Enter');
  await page.waitForTimeout(500);

  expect(await page.locator(`${OVERLAY} .find-match`).count()).toBeGreaterThanOrEqual(3);
  expect(await page.locator(`${OVERLAY} .find-match-current`).count()).toBe(1);

  // Navigating keeps exactly one current highlight.
  await page.locator('[data-testid="find-input"]').press('Enter');
  await page.waitForTimeout(400);
  expect(await page.locator(`${OVERLAY} .find-match-current`).count()).toBe(1);

  // Closing find clears all highlights.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  expect(await page.locator(`${OVERLAY} .find-match`).count()).toBe(0);
});
