/**
 * Smart chips — the Google-Docs "@" menu in the body.
 *
 * Typing `@` at a word boundary opens a caret-anchored menu; choosing "Date"
 * replaces the `@query` with a DATE field (which paints as today's date and
 * round-trips natively). These checks lock the trigger → menu → insert flow.
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

test.describe('Smart chips — @date', () => {
  test('typing @ opens the menu and selecting Date inserts a DATE field', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.loadDocxFile('fixtures/empty.docx');

    await editor.focusParagraph(0);
    await editor.pressEnd();

    const menu = page.getByTestId('smart-chip-menu');

    // `@` at a word boundary opens the menu (space first so the `@` is
    // whitespace-preceded — `user@host` must NOT trigger).
    await editor.typeText(' @');
    await expect(menu).toBeVisible();

    // Narrowing the query keeps the Date row.
    await editor.typeText('da');
    const dateItem = page.getByTestId('smart-chip-item-date');
    await expect(dateItem).toBeVisible();

    // Today's date as the painted DATE field will render it.
    const today = await page.evaluate(() => new Date().toLocaleDateString());

    await dateItem.click();

    // Menu closes, `@da` is gone, and the date is now in the body.
    await expect(menu).toHaveCount(0);
    const body = page.locator('.layout-page').first();
    await expect(body).toContainText(today);
    await expect(body).not.toContainText('@da');
  });

  test('Escape dismisses the menu without inserting anything', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.loadDocxFile('fixtures/empty.docx');

    await editor.focusParagraph(0);
    await editor.pressEnd();

    const menu = page.getByTestId('smart-chip-menu');
    await editor.typeText(' @');
    await expect(menu).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);

    // The literal `@` text is still there (nothing was inserted/replaced).
    const body = page.locator('.layout-page').first();
    await expect(body).toContainText('@');
  });
});
