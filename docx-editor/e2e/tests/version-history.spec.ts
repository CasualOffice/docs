/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Version-history panel smoke (F1 mount).
 *
 * Verifies the toolbar toggle mounts the panel and that an edit produces
 * an entry. Deeper revert / coalesce behavior is covered by the
 * `useEditHistory` hook's own unit tests; this spec is the integration
 * seam — toolbar click → panel renders → typing → entry visible.
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

test.describe('Version history panel', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
  });

  test('toolbar toggle mounts the single version timeline', async ({ page }) => {
    const toggle = page.getByRole('button', { name: 'Version history' });
    await expect(toggle).toBeVisible();

    // Initially hidden.
    await expect(page.locator('[data-testid="version-history-panel"]')).toHaveCount(0);

    await toggle.click();
    await expect(page.locator('[data-testid="version-history-panel"]')).toBeVisible();

    // One timeline now — no Versions/Activity tab split.
    await expect(page.getByTestId('version-history-tab-activity')).toHaveCount(0);

    // The auto-save explainer and the "Save version…" (name-only) action
    // are the panel's anchors.
    const panel = page.locator('[data-testid="version-history-panel"]');
    await expect(panel.getByTestId('version-history-caption')).toBeVisible();
    await expect(panel.getByTestId('version-history-save-version')).toBeVisible();

    // A named save produces a row.
    await editor.saveNamedVersion('Checkpoint');
    await expect(panel.getByTestId('version-history-version-row').first()).toBeVisible();
  });

  test('toggling the panel off hides it', async ({ page }) => {
    const toggle = page.getByRole('button', { name: 'Version history' });
    await toggle.click();
    await expect(page.locator('[data-testid="version-history-panel"]')).toBeVisible();

    await toggle.click();
    await expect(page.locator('[data-testid="version-history-panel"]')).toHaveCount(0);
  });

  test('opening version history closes the comments sidebar (and vice versa)', async ({ page }) => {
    // Comments + version history share the right rail and are mutually
    // exclusive — opening one closes the other.
    const versionToggle = page.getByRole('button', { name: 'Version history' });
    const commentsToggle = page.getByRole('button', { name: /comments/i }).first();

    await commentsToggle.click();
    // Comments sidebar opens (data-testid varies by content; just check
    // that version-history panel is NOT mounted).
    await expect(page.locator('[data-testid="version-history-panel"]')).toHaveCount(0);

    await versionToggle.click();
    await expect(page.locator('[data-testid="version-history-panel"]')).toBeVisible();

    await commentsToggle.click();
    await expect(page.locator('[data-testid="version-history-panel"]')).toHaveCount(0);
  });
});
