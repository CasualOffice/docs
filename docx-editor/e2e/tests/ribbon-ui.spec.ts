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
});
