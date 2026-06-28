/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';
import { modifierKey } from '../helpers/keyboard';

// Command palette docstring claims "fuzzy-searchable"; the impl now
// matches. These specs cover two cases the substring filter missed:
//   1. Non-contiguous subsequence: "expdf" → "Export as PDF".
//   2. Acronym hop across two words: "fr" → "Find and Replace" outranks
//      "File · Format" / other "f…r…" haystacks via the word-boundary
//      bonus.
test.describe('Command palette fuzzy match', () => {
  async function openPalette(page: import('@playwright/test').Page) {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
    const mod = await modifierKey(page);
    await page.keyboard.press(`${mod}+Shift+p`);
    return page.getByTestId('command-palette-input');
  }

  test('subsequence "expdf" finds Export as PDF', async ({ page }) => {
    const input = await openPalette(page);
    await input.fill('expdf');
    const first = page.locator('[data-cp-index]').first();
    await expect(first).toContainText(/Export as PDF/i);
  });

  test('word-boundary hop "fr" ranks Find and Replace first', async ({ page }) => {
    const input = await openPalette(page);
    await input.fill('fr');
    const first = page.locator('[data-cp-index]').first();
    await expect(first).toContainText(/Find and Replace/i);
  });
});
