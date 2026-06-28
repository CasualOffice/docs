/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// X7 / PanelRail v0 — right-edge activity bar with toggles for
// Outline / Comments / Version history. Pressed state mirrors the
// existing toolbar toggles + the global keyboard shortcut.
test.describe('PanelRail (X7)', () => {
  test('renders three icon buttons in the right-edge rail', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();

    const rail = page.getByTestId('panel-rail');
    await expect(rail).toBeVisible();
    await expect(page.getByTestId('rail-outline')).toBeVisible();
    await expect(page.getByTestId('rail-comments')).toBeVisible();
    await expect(page.getByTestId('rail-history')).toBeVisible();
    await page.screenshot({ path: 'screenshots/panel-rail.png' });
  });

  test('clicking Outline opens the panel and shows the pressed state', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();

    const railOutline = page.getByTestId('rail-outline');
    await expect(railOutline).toHaveAttribute('aria-pressed', 'false');
    await railOutline.click();
    await expect(railOutline).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('navigation', { name: 'Document outline' })).toBeVisible();
  });

  test('Comments and Version history are mutually exclusive', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();

    await page.getByTestId('rail-comments').click();
    await expect(page.getByTestId('rail-comments')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('rail-history').click();
    await expect(page.getByTestId('rail-history')).toHaveAttribute('aria-pressed', 'true');
    // Comments was forcibly closed by history opening.
    await expect(page.getByTestId('rail-comments')).toHaveAttribute('aria-pressed', 'false');
  });
});
