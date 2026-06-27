import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// X5 — the shared `PanelState` helper (empty / loading / error). The
// version-history panel is the first adopter; opening it on a fresh doc
// (no edits captured yet) should render the empty variant.
test.describe('PanelState (X5)', () => {
  test('version-history panel renders the empty variant on a fresh doc', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();

    // Open the panel without typing — no edits yet, so the empty state
    // is the only thing visible inside.
    await page.getByRole('button', { name: 'Version history' }).click();

    const panel = page.locator('[data-testid="version-history-panel"]');
    await expect(panel).toBeVisible();
    // Single auto-saved timeline: a fresh doc has no versions yet, so the
    // empty state explains how versions get created.
    const empty = panel.locator('[data-testid="panel-state-empty"]');
    await expect(empty).toBeVisible();
    await expect(empty).toContainText(/No saved versions yet/);
    // PanelState marks itself role="status" so screen readers don't
    // interrupt, but assistive tech still announces it on focus.
    await expect(empty).toHaveAttribute('role', 'status');
    await page.screenshot({ path: 'screenshots/x5-empty.png' });
  });
});
