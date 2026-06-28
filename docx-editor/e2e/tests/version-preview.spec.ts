/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Version preview (Google-Docs model).
 *
 * Clicking a saved version opens a full-canvas, read-only render of that
 * version with the changes-since-the-previous-version overlaid inline
 * (insertions underlined per author). A "Show changes" toggle flips
 * between the marked diff and a clean snapshot; "Back" returns to the
 * live editor untouched. This replaces the old cramped monospace
 * `<pre>` diff box in the side rail.
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

test.describe('Version preview', () => {
  test.setTimeout(60_000);

  test('clicking a version opens an in-canvas preview with inline changes', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();

    await page.getByRole('button', { name: 'Version history' }).click();
    await expect(page.locator('[data-testid="version-history-panel"]')).toBeVisible();

    // Two named versions with an edit between, so the newer one has a
    // previous version to diff against.
    await editor.focus();
    await editor.typeText('First draft of the memo.');
    await editor.saveNamedVersion('Initial draft');
    await page.waitForSelector('[data-testid="version-history-version-row"]');

    await editor.focus();
    await editor.typeText(' A freshly added sentence.');
    await editor.saveNamedVersion('Post-edit checkpoint');
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="version-history-version-row"]').length >= 2
    );

    // Click the newer version → preview overlay opens.
    await page.getByText('Post-edit checkpoint').click();
    const overlay = page.locator('[data-testid="version-preview-overlay"]');
    await expect(overlay).toBeVisible();

    // The added sentence is painted with an insertion mark (per-author
    // underline) inside the preview's pages.
    await expect(overlay.locator('.docx-insertion').first()).toBeVisible();

    // Toggle Show changes off → clean snapshot, no insertion marks.
    await page.getByTestId('version-preview-show-changes').uncheck();
    await expect(overlay.locator('.docx-insertion')).toHaveCount(0);
    // The version's text is still fully present.
    await expect(overlay).toContainText('freshly added sentence');

    // Back returns to the live editor; the overlay unmounts.
    await page.getByTestId('version-preview-back').click();
    await expect(overlay).toHaveCount(0);
  });

  test('the first (oldest) version previews with Show changes disabled', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();

    await page.getByRole('button', { name: 'Version history' }).click();
    await expect(page.locator('[data-testid="version-history-panel"]')).toBeVisible();

    await editor.focus();
    await editor.typeText('Only version.');
    await editor.saveNamedVersion('Sole version');
    await page.waitForSelector('[data-testid="version-history-version-row"]');

    await page.getByText('Sole version').click();
    await expect(page.locator('[data-testid="version-preview-overlay"]')).toBeVisible();

    // No previous version to diff against → the Show changes toggle is
    // disabled and there are no change marks.
    await expect(page.getByTestId('version-preview-show-changes')).toBeDisabled();
    await expect(
      page.locator('[data-testid="version-preview-overlay"] .docx-insertion')
    ).toHaveCount(0);
  });
});
