/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Focus-recapture contract
 *
 * The editor keeps the real ProseMirror off-screen, so every interaction with
 * the visible layer must funnel keyboard focus back to it through a single
 * `claimEditorFocus()` path. These tests pin that contract so the consolidation
 * (one focus-claim helper instead of copy-pasted `focus()` + `setIsFocused`
 * pairs) can't silently regress: clicking the blank editor area must make the
 * off-screen editor focused and typable, and the focus state must match actual
 * DOM focus (no "caret blinks but typing is dead" desync).
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EMPTY_DOCX = path.join(__dirname, '..', 'fixtures', 'empty.docx');

const pmIsFocused = (page: import('@playwright/test').Page) =>
  page.evaluate(() => !!document.activeElement?.closest('.paged-editor__hidden-pm'));

test.describe('Focus recapture', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.loadDocxFile(EMPTY_DOCX);
  });

  test('clicking the blank editor area recaptures focus and lets you type', async ({ page }) => {
    // Move focus off the editor entirely.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    expect(await pmIsFocused(page)).toBe(false);

    // Click the empty container region (outside the painted pages).
    await page.locator('.paged-editor__pages').click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(100);
    expect(await pmIsFocused(page)).toBe(true);

    await page.keyboard.type('Recaptured.');
    await expect(page.locator('.paged-editor__hidden-pm .ProseMirror')).toContainText(
      'Recaptured.'
    );
  });

  test('focus state stays consistent with DOM focus after a toolbar interaction', async ({
    page,
  }) => {
    await editor.focus();
    await page.keyboard.type('Before. ');

    // A toolbar button preventDefaults mousedown so DOM focus never leaves the
    // editor; the caret must stay live and typing must continue at the cursor.
    const bold = page.locator('[data-testid="toolbar-bold"], button[title*="Bold" i]').first();
    if (await bold.count()) {
      await bold.click();
    }
    expect(await pmIsFocused(page)).toBe(true);

    await page.keyboard.type('after.');
    await expect(page.locator('.paged-editor__hidden-pm .ProseMirror')).toContainText(
      'Before. after.'
    );
  });
});
