/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/*
 * The opt-in "new UI" — a modern tabbed ribbon (RibbonChrome), toggled from the
 * View menu and persisted in localStorage. Classic is the default. These verify
 * the toggle wiring AND that a command dispatched from the ribbon behaves
 * identically to the classic toolbar (it drives the same command context).
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';
import * as assertions from '../helpers/assertions';

const RIBBON = '[data-testid="ribbon-chrome"]';

test.describe('Ribbon UI (new chrome) toggle', () => {
  test('classic is default; View menu switches to ribbon and the in-ribbon button switches back', async ({
    page,
  }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();

    // Default is classic — the ribbon is not mounted.
    await expect(page.locator(RIBBON)).toHaveCount(0);

    // Switch via View → "Ribbon UI (preview)".
    await page.getByRole('button', { name: 'View' }).click();
    await page.getByRole('menuitem', { name: /Ribbon UI/ }).click();
    await expect(page.locator(RIBBON)).toBeVisible();
    await expect(page.locator('[data-testid="ribbon-tab-home"]')).toBeVisible();

    await page.screenshot({ path: 'screenshots/ux/ribbon-real.png' });

    // Switch back via the in-ribbon "Classic view" button.
    await page.locator('[data-testid="ribbon-exit"]').click();
    await expect(page.locator(RIBBON)).toHaveCount(0);
  });

  test('bold from the ribbon applies to the selection (same command as classic)', async ({
    page,
  }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();

    // Author the doc in classic (its File menu), then switch to the ribbon.
    await editor.newDocument();
    await editor.focus();
    await editor.typeText('Ribbon bold');

    await page.getByRole('button', { name: 'View' }).click();
    await page.getByRole('menuitem', { name: /Ribbon UI/ }).click();
    await expect(page.locator(RIBBON)).toBeVisible();

    // Bold, dispatched from the ribbon, must apply just like the classic button.
    await editor.selectText('bold');
    await page.locator('[data-testid="ribbon-bold"]').click();
    await page.waitForTimeout(150);

    await assertions.assertTextIsBold(page, 'bold');
  });

  test('ribbon is self-sufficient: File menu, colors, and a View tab with zoom', async ({
    page,
  }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await page.getByRole('button', { name: 'View' }).click();
    await page.getByRole('menuitem', { name: /Ribbon UI/ }).click();
    await expect(page.locator(RIBBON)).toBeVisible();

    // File menu (classic menu bar is hidden in ribbon mode — file ops must live here).
    await page.getByRole('button', { name: 'File' }).click();
    await expect(page.getByRole('menuitem', { name: /Save/ })).toBeVisible();
    await page.keyboard.press('Escape');

    // Home tab exposes the style gallery, color controls, and the command search.
    await expect(page.locator('[data-testid="ribbon-style-gallery"]')).toBeVisible();
    await expect(page.locator('[data-testid="ribbon-style-heading-1"]')).toBeVisible();
    await expect(page.locator('[data-testid="ribbon-colors"]')).toBeVisible();
    await expect(page.locator('[data-testid="ribbon-search"]')).toBeVisible();

    // View tab exposes zoom.
    await page.locator('[data-testid="ribbon-tab-view"]').click();
    await expect(page.locator('[data-testid="ribbon-zoom-in"]')).toBeVisible();
    await page.locator('[data-testid="ribbon-tab-home"]').click();

    await page.screenshot({ path: 'screenshots/ux/ribbon-real-v3.png' });
  });

  test('applying Heading 1 from the style gallery changes the paragraph style', async ({
    page,
  }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
    await editor.typeText('Section title');

    await page.getByRole('button', { name: 'View' }).click();
    await page.getByRole('menuitem', { name: /Ribbon UI/ }).click();
    await expect(page.locator(RIBBON)).toBeVisible();

    await editor.selectText('Section title');
    await page.locator('[data-testid="ribbon-style-heading-1"]').click();
    await page.waitForTimeout(200);

    // The paragraph should now render as a heading (larger than body text).
    const size = await page
      .locator('.paged-editor__pages')
      .locator('text=Section title')
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThan(16);
  });

  test('a contextual Table tab auto-appears when the cursor enters a table', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();

    await page.getByRole('button', { name: 'View' }).click();
    await page.getByRole('menuitem', { name: /Ribbon UI/ }).click();
    await expect(page.locator(RIBBON)).toBeVisible();

    // No table yet → no contextual tab.
    await expect(page.locator('[data-testid="ribbon-tab-table"]')).toHaveCount(0);

    // Insert a table from the Insert tab.
    await page.locator('[data-testid="ribbon-tab-insert"]').click();
    await page.locator('[data-testid="ribbon-insert-table"]').click();
    await page.waitForTimeout(400);

    // The contextual Table tab appears with its row/column actions.
    await expect(page.locator('[data-testid="ribbon-tab-table"]')).toBeVisible();
    await expect(page.locator('[data-testid="ribbon-tbl-row-below"]')).toBeVisible();
    await expect(page.locator('[data-testid="ribbon-tbl-col-right"]')).toBeVisible();

    await page.screenshot({ path: 'screenshots/ux/ribbon-real-v4.png' });
  });
});
