/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Regression: a dynamic field (DATE/TIME) inserted as a paragraph's trailing
 * run must paint immediately, not only after the next keystroke.
 *
 * Root cause was the paragraph measure-cache key (`hashParagraphBlock`) omitting
 * `field` runs: a paragraph that differed from a previously-measured one only by
 * an inserted field collided on the key and got a stale, field-less measure.
 * The field then stayed invisible until an unrelated edit re-keyed the cache.
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

test.describe('Field insert — paints immediately', () => {
  test('Insert > Date renders the date without a follow-up keystroke', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.loadDocxFile('fixtures/empty.docx');

    await editor.focusParagraph(0);
    await editor.pressEnd();
    // Type a space then a couple of chars + backspace them, to seed the measure
    // cache with the "space-only" paragraph that previously caused the collision.
    await editor.typeText('hello ');

    await page.getByRole('button', { name: /^Insert$/ }).click();
    await page.getByRole('menuitem', { name: /^Field/ }).first().hover();
    await page.getByRole('menuitem', { name: /^Date$/i }).first().click();

    const today = await page.evaluate(() => new Date().toLocaleDateString());
    const body = page.locator('.layout-page').first();
    await expect(body).toContainText(today);
  });
});
