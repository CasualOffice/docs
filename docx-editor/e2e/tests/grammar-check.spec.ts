/**
 * Grammar check — toggle on, a likely mistake gets a blue squiggle, and the
 * right-click menu applies the fix into the document.
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

test.describe('Grammar check', () => {
  test('flags "a apple" and the fix menu replaces it with "an apple"', async ({ page }) => {
    test.setTimeout(40_000);
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
    await editor.typeText('I ate a apple.');

    // Tools → Grammar check (off by default).
    await page.getByRole('button', { name: 'Tools' }).click();
    await page.getByRole('menuitem', { name: /Grammar check/i }).click();

    // A blue grammar squiggle is painted over the article "a". Scope to the
    // VISIBLE pages — the hidden ProseMirror (left:-9999px) also renders the
    // decoration, and an unscoped `.first()` can match that off-screen copy.
    const squiggle = page.locator('.paged-editor__decoration-overlay .grammar-error').first();
    await expect(squiggle).toBeVisible({ timeout: 5000 });

    // Right-click the flagged span → the grammar fix menu opens. The overlay
    // is pointer-events:none, so go through the mouse API at its centre (a
    // direct .click() would retry on actionability forever).
    const box = await squiggle.boundingBox();
    if (!box) throw new Error('no bbox for .grammar-error');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, {
      button: 'right',
    });
    const menu = page.getByTestId('grammar-suggestions-menu');
    await expect(menu).toBeVisible();
    await expect(menu).toContainText(/vowel sound/i);

    // Pick the suggested fix → the document now reads "an apple".
    await page.getByTestId('grammar-suggestion-0').click();
    await expect(menu).toHaveCount(0);

    const body = page.locator('.layout-page').first();
    await expect(body).toContainText('an apple');
    await expect(body).not.toContainText('a apple');
  });

  test('toggling grammar off clears the squiggles', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
    await editor.typeText('You could of told me.');

    await page.getByRole('button', { name: 'Tools' }).click();
    await page.getByRole('menuitem', { name: /Grammar check/i }).click();
    await expect(page.locator('.paged-editor__decoration-overlay .grammar-error').first()).toBeVisible({
      timeout: 5000,
    });

    await page.getByRole('button', { name: 'Tools' }).click();
    await page.getByRole('menuitem', { name: /Grammar check/i }).click();
    await expect(page.locator('.grammar-error')).toHaveCount(0);
  });

  test('grammar works inside a table cell (right-click fix, not the table menu)', async ({
    page,
  }) => {
    test.setTimeout(40_000);
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
    await editor.insertTable(2, 2);
    await page.locator('.layout-table-cell').first().click();
    await page.waitForTimeout(150);
    await editor.typeText('we ate a apple');

    await page.getByRole('button', { name: 'Tools' }).click();
    await page.getByRole('menuitem', { name: /Grammar check/i }).click();

    const squiggle = page.locator('.paged-editor__decoration-overlay .grammar-error').first();
    await expect(squiggle).toBeVisible({ timeout: 5000 });
    const box = await squiggle.boundingBox();
    if (!box) throw new Error('no bbox for grammar squiggle in cell');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });

    // The grammar fix menu opens (not the table context menu).
    await expect(page.getByTestId('grammar-suggestions-menu')).toBeVisible();
  });
});
