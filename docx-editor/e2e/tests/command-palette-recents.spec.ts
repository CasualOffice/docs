/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';
import { modifierKey } from '../helpers/keyboard';

// Picking an item bumps it to the top of the palette's empty-query view
// (Recently used), persisted via localStorage.
test('picked items move to the top of the empty-query list', async ({ page, context }) => {
  // Reset localStorage at the page level — no leakage between runs.
  await context.addInitScript(() => {
    try {
      window.localStorage.removeItem('docx-editor-palette-recents');
    } catch {
      /* private mode */
    }
  });
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.newDocument();
  await editor.focus();

  const mod = await modifierKey(page);

  // First open: nothing recent, so 'New document' (first in items list) is
  // index 0.
  await page.keyboard.press(`${mod}+Shift+p`);
  let firstLabel = await page.locator('[data-cp-index="0"]').textContent();
  expect(firstLabel ?? '').toContain('New document');

  // Pick "Dictionary" by searching, then arrow up shouldn't be needed
  // since fuzzy match puts it first.
  const input = page.getByTestId('command-palette-input');
  await input.fill('Dictionary');
  await expect(page.locator('[data-cp-index="0"]')).toContainText('Dictionary');
  await page.keyboard.press('Enter');
  // Dialog closes — wait for it.
  await expect(page.getByTestId('command-palette-input')).toHaveCount(0);

  // Reopen with no query → Dictionary now at the top.
  await page.keyboard.press(`${mod}+Shift+p`);
  firstLabel = await page.locator('[data-cp-index="0"]').textContent();
  expect(firstLabel ?? '').toContain('Dictionary');
});
