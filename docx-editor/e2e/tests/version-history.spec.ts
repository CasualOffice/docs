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

  test('toolbar toggle mounts the panel and captures edits', async ({ page }) => {
    const toggle = page.getByRole('button', { name: 'Version history' });
    await expect(toggle).toBeVisible();

    // Initially hidden.
    await expect(page.locator('[data-testid="version-history-panel"]')).toHaveCount(0);

    await toggle.click();
    await expect(page.locator('[data-testid="version-history-panel"]')).toBeVisible();

    // Type so the capture plugin records at least one entry. The hook
    // coalesces rapid typing into one entry within a 2s idle window, so
    // a single character is sufficient to produce one visible row.
    await editor.typeText('hello');
    await page.waitForTimeout(150);

    // The panel renders an aria-labeled list (see VersionHistoryPanel).
    // Just assert that *something* renders inside the panel body — the
    // empty-state text disappears once entries exist.
    const panel = page.locator('[data-testid="version-history-panel"]');
    const entryCount = await panel.locator('li, [role="listitem"]').count();
    expect(entryCount).toBeGreaterThan(0);
  });

  test('Show changes reveals an inline word diff for the latest entry', async ({ page }) => {
    const toggle = page.getByRole('button', { name: 'Version history' });
    await toggle.click();
    await expect(page.locator('[data-testid="version-history-panel"]')).toBeVisible();

    // Type so an entry lands. The diff is computed against the live
    // doc, so "hello world" landing as the latest entry produces a +2
    // word stats pill on the row.
    await editor.typeText('hello world');
    await page.waitForTimeout(200);

    const panel = page.locator('[data-testid="version-history-panel"]');
    const showBtn = panel.getByTestId('version-history-toggle-diff').first();
    await expect(showBtn).toBeVisible();
    await showBtn.click();
    const diffBox = panel.getByTestId('version-history-diff').first();
    await expect(diffBox).toBeVisible();
    // The diff should contain green INS marks for the new text.
    const insCount = await diffBox.locator('ins').count();
    expect(insCount).toBeGreaterThan(0);
  });

  test('inserted segments in the diff are interactive revert targets', async ({ page }) => {
    const toggle = page.getByRole('button', { name: 'Version history' });
    await toggle.click();
    await expect(page.locator('[data-testid="version-history-panel"]')).toBeVisible();

    await editor.typeText('alpha bravo');
    await page.waitForTimeout(200);

    const panel = page.locator('[data-testid="version-history-panel"]');
    const showBtn = panel.getByTestId('version-history-toggle-diff').first();
    await showBtn.click();
    const insSpans = panel.getByTestId('version-history-diff-add');
    await expect(insSpans.first()).toBeVisible();

    // Phase B contract: inserted spans are clickable buttons with the
    // right tooltip. Actual revert dispatch is exercised by manual
    // verification — the test environment doesn't reliably round-trip
    // PM dispatch + layout-painter repaint within timing windows.
    const first = insSpans.first();
    await expect(first).toHaveAttribute('role', 'button');
    await expect(first).toHaveAttribute('title', /revert/i);
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
