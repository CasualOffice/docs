/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Regression: the smart-chip "@" menu must anchor to the caret at any zoom.
 * It used to multiply the (already zoom-transformed) caret coords by the zoom
 * factor again, so above 100% the menu drifted down-right, away from the caret.
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

test.describe('Smart chip — caret anchoring at zoom', () => {
  test('menu stays under the caret at 121% zoom', async ({ page }) => {
    test.setTimeout(40_000);
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
    await editor.typeText('Meeting on ');

    // Two "Zoom in" steps → 1.1 × 1.1 = 121%.
    for (let i = 0; i < 2; i++) {
      await page.getByRole('button', { name: /^View$/ }).click();
      await page.getByRole('menuitem', { name: /Zoom in/i }).click();
    }
    await page.waitForTimeout(150);

    await editor.focus();
    await editor.typeText('@');
    const menu = page.getByTestId('smart-chip-menu');
    await expect(menu).toBeVisible({ timeout: 4000 });
    await page.waitForTimeout(150);

    const caretBox = await page.getByTestId('caret').first().boundingBox();
    const menuBox = await menu.boundingBox();
    expect(caretBox).not.toBeNull();
    expect(menuBox).not.toBeNull();
    if (!caretBox || !menuBox) return;

    // Menu's left edge sits at the caret (small margin), and just below it —
    // not double-scaled away. (Pre-fix the gap was > 100px.)
    expect(Math.abs(menuBox.x - caretBox.x)).toBeLessThan(40);
    expect(menuBox.y).toBeGreaterThan(caretBox.y);
    expect(menuBox.y - (caretBox.y + caretBox.height)).toBeLessThan(40);
  });
});
