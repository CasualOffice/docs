/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// MVP spell check:
// - Tools menu carries a "Spell check" entry.
// - Toggling it on lazy-loads the dictionary, then paints a red wavy
//   underline (DecorationLayer overlay div with class
//   `spellcheck-error`) on misspelled words.
// - Toggling off removes the decorations again.
test.describe('Spell check', () => {
  test('Tools menu exposes a Spell check toggle', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();

    // Open Tools menu — exact label match against the menu button
    await page.getByRole('button', { name: 'Tools', exact: true }).click();
    await expect(
      page.getByRole('menuitem', { name: /Spell check/i })
    ).toBeVisible();
  });

  test('typing a misspelled word paints a spellcheck-error decoration', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();

    // Enable spell check via the Tools menu
    await page.getByRole('button', { name: 'Tools', exact: true }).click();
    await page.getByRole('menuitem', { name: /Spell check/i }).click();

    // Dictionary download — wait for the loading toast to disappear.
    // The toast says "Loading spell-check dictionary…"; once it's gone
    // we know the engine is live.
    await expect(page.getByText(/Loading spell-check/i)).toHaveCount(0, {
      timeout: 15_000,
    });

    // Type a clearly misspelled word
    await editor.typeText('Zxqvw ');

    // Wait for the decoration overlay to render
    const squiggle = page.locator('.spellcheck-error').first();
    await expect(squiggle).toBeVisible({ timeout: 5_000 });
  });

  test('right-click on a misspelled word shows suggestions', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();

    await page.getByRole('button', { name: 'Tools', exact: true }).click();
    await page.getByRole('menuitem', { name: /Spell check/i }).click();
    await expect(page.getByText(/Loading spell-check/i)).toHaveCount(0, {
      timeout: 15_000,
    });

    // "Helo" is a common typo with strong suggestions ("Hello", "Held",
    // "Helot", etc.) — gives the menu something to show.
    await editor.typeText('Helo ');
    const squiggle = page.locator('.spellcheck-error').first();
    await expect(squiggle).toBeVisible({ timeout: 5_000 });

    // The overlay has `pointer-events: none` (it must not steal text
    // selection), so a direct `.click()` retries forever — go through
    // the mouse API at the squiggle's centre. The viewport-level
    // `oncontextmenu` resolves the PM position from coords and looks
    // up the spellcheck DecorationSet, so the underlying span
    // receiving the event is fine.
    const box = await squiggle.boundingBox();
    if (!box) throw new Error('no bbox for .spellcheck-error');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, {
      button: 'right',
    });
    const menu = page.getByTestId('spell-suggestions-menu');
    await expect(menu).toBeVisible();
    await expect(page.getByTestId('spell-ignore')).toBeVisible();
  });
});
