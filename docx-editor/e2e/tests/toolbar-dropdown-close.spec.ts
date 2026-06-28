/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * Outside-click closes toolbar dropdowns — openspec
 * `toolbar-selection-interactions`. Gap matrix listed "Dropdowns don't
 * close on outside click" as P4 open; audit found the
 * `MenuDropdown.tsx` outside-click handler is wired correctly
 * (document-level mousedown + contains check + Escape + scroll).
 * Pin the behavior with an e2e so it doesn't regress.
 */

test.describe('Toolbar dropdown outside-click close', () => {
  test('File menu closes when clicking outside', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();

    // Open File menu — there are two parallel File menus in our UI
    // (TitleBar.MenuBar and Toolbar). Click whichever is visible.
    const fileButtons = page.getByRole('button', { name: /^File$/ });
    await fileButtons.first().click();

    // The File menu should now show menu items.
    const fileMenuItem = page.getByText('Open', { exact: true }).first();
    await expect(fileMenuItem).toBeVisible();

    // Click on the body content area (outside any dropdown).
    await page.mouse.click(400, 500);
    await page.waitForTimeout(200);

    // The menu item should be gone.
    await expect(fileMenuItem).not.toBeVisible();
  });

  test('Escape closes the dropdown', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();

    const fileButtons = page.getByRole('button', { name: /^File$/ });
    await fileButtons.first().click();
    const fileMenuItem = page.getByText('Open', { exact: true }).first();
    await expect(fileMenuItem).toBeVisible();

    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);

    await expect(fileMenuItem).not.toBeVisible();
  });
});
