/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Small caps + All caps toolbar toggles (Phase 1.5 U2).
 *
 * Smoke that the new toolbar buttons toggle the SmallCaps / AllCaps
 * marks. The marks themselves and the underlying commands have their
 * own unit coverage; this spec is the integration seam — button click
 * → mark applied → `aria-pressed` flips.
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

test.describe('Small caps + All caps toolbar', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
    await editor.typeText('hello world');
    await editor.selectText('hello');
  });

  test('Small caps toggle: click → aria-pressed flips to true, re-click → false', async ({
    page,
  }) => {
    const btn = page.locator('[data-testid="toolbar-small-caps"]');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAttribute('aria-pressed', 'false');

    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'true');

    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
  });

  test('All caps toggle: click → aria-pressed flips to true, re-click → false', async ({
    page,
  }) => {
    const btn = page.locator('[data-testid="toolbar-all-caps"]');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAttribute('aria-pressed', 'false');

    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'true');

    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
  });
});
