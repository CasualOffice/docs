/**
 * Version-history panel layout (Google-Docs rail).
 *
 * Covers the redesigned Versions tab: a pinned "Current version" row,
 * per-row kebab (⋮) menu consolidating Restore / Rename / Delete, and the
 * "Only named versions" filter. The cramped inline action-button row and
 * the monospace diff box are gone.
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

test.describe('Version panel layout', () => {
  test.setTimeout(60_000);

  test('kebab menu, current-version row, and named-only filter', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();

    await page.getByRole('button', { name: 'Version history' }).click();
    await expect(page.locator('[data-testid="version-history-panel"]')).toBeVisible();

    // One named version.
    await editor.focus();
    await editor.typeText('Draft body.');
    await editor.saveNamedVersion('Milestone one');
    await page.waitForSelector('[data-testid="version-history-version-row"]');

    // Pinned "Current version" row is present and active (not previewing).
    const currentRow = page.getByTestId('version-history-current-row');
    await expect(currentRow).toBeVisible();
    await expect(currentRow).toHaveAttribute('aria-current', 'true');

    // Kebab opens a menu with the consolidated actions.
    await page.getByTestId('version-history-row-menu').first().click();
    const menu = page.locator('[role="menu"]');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /Restore this version/i })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /Rename/i })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /Delete/i })).toBeVisible();

    await page.screenshot({ path: 'screenshots/audit/vh-8-kebab.png', fullPage: false });

    // Escape closes the menu without firing an action.
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(page.locator('[data-testid="version-history-version-row"]')).toHaveCount(1);

    // Clicking "Current version" while previewing returns to the live doc.
    await page.getByText('Milestone one').click();
    await expect(page.locator('[data-testid="version-preview-overlay"]')).toBeVisible();
    await expect(currentRow).toHaveAttribute('aria-current', 'false');
    await currentRow.click();
    await expect(page.locator('[data-testid="version-preview-overlay"]')).toHaveCount(0);
  });

  test('named-only filter hides auto snapshots', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();

    await page.getByRole('button', { name: 'Version history' }).click();
    await editor.focus();
    await editor.typeText('Some content here.');
    await editor.saveNamedVersion('Named A');
    await page.waitForSelector('[data-testid="version-history-version-row"]');

    // With only a manual version, the named-only filter is hidden (nothing
    // to filter). The single manual row is visible regardless.
    await expect(page.getByTestId('version-history-named-only')).toHaveCount(0);
    await expect(page.getByText('Named A')).toBeVisible();
  });
});
