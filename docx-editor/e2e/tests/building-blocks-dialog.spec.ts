/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// C6 — Insert → Building blocks opens a list of saved snippets and lets
// the user save the current selection or insert a previously saved one.
test.describe('Insert > Building blocks', () => {
  test('shows the no-selection hint and empty list on a fresh doc', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    // No selection captured — open dialog.
    await page.getByRole('button', { name: 'Insert', exact: true }).click();
    await page.waitForSelector('[role="menu"]', { state: 'visible', timeout: 4000 });
    await page.getByRole('menuitem', { name: /Building blocks/ }).click();

    const dlg = page.getByTestId('building-blocks-dialog');
    await expect(dlg).toBeVisible();
    await expect(page.getByTestId('bb-no-selection')).toBeVisible();
    await expect(page.getByTestId('bb-empty')).toBeVisible();
    await page.screenshot({ path: 'screenshots/c6-empty.png' });
  });

  test('saves a selection, lists it, inserts it, and deletes it', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
    await editor.typeText('Cordially, Sachin');
    await editor.selectAll();

    // Open Insert → Building blocks.
    await page.getByRole('button', { name: 'Insert', exact: true }).click();
    await page.waitForSelector('[role="menu"]', { state: 'visible', timeout: 4000 });
    await page.getByRole('menuitem', { name: /Building blocks/ }).click();

    const dlg = page.getByTestId('building-blocks-dialog');
    await expect(dlg).toBeVisible();
    // The captured selection unlocks the name input.
    await expect(page.getByTestId('bb-name-input')).toBeVisible();
    await page.getByTestId('bb-name-input').fill('signature');
    await page.screenshot({ path: 'screenshots/c6-save-form.png' });
    await page.getByTestId('bb-save').click();

    // The new row shows up in the list.
    await expect(dlg.getByText('signature')).toBeVisible();
    await page.screenshot({ path: 'screenshots/c6-saved.png' });
    // Close the dialog (Escape).
    await page.keyboard.press('Escape');
    await expect(dlg).not.toBeVisible();

    // Move the caret to the end and clear the document, then insert from the
    // dialog. We use Select-All + Backspace because the editor's "new document"
    // helper is what got us here.
    await editor.focus();
    await editor.selectAll();
    await page.keyboard.press('Backspace');

    // Reopen and insert.
    await page.getByRole('button', { name: 'Insert', exact: true }).click();
    await page.getByRole('menuitem', { name: /Building blocks/ }).click();
    const reopened = page.getByTestId('building-blocks-dialog');
    await expect(reopened).toBeVisible();
    const insertBtn = reopened.getByRole('button', { name: 'Insert' }).first();
    await insertBtn.click();

    // Dialog closes; the saved text appears in the editor.
    await expect(reopened).not.toBeVisible();
    await expect(page.locator('.ProseMirror')).toContainText('Cordially, Sachin');

    // Delete the saved block: open again, click Delete, confirm empty state.
    await page.getByRole('button', { name: 'Insert', exact: true }).click();
    await page.getByRole('menuitem', { name: /Building blocks/ }).click();
    const dlg3 = page.getByTestId('building-blocks-dialog');
    await expect(dlg3).toBeVisible();
    await dlg3.getByRole('button', { name: /^Delete signature$/ }).click();
    await expect(page.getByTestId('bb-empty')).toBeVisible();
    await page.screenshot({ path: 'screenshots/c6-deleted.png' });
  });
});
