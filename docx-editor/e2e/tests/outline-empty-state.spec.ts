import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// X5 — the DocumentOutline empty state now renders through PanelState
// instead of its own inline chrome. Fresh doc (no headings) → empty
// state visible inside the outline nav.
test.describe('Outline empty state (X5 migration)', () => {
  test('renders PanelState empty when there are no headings', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
    await editor.typeText('Just plain prose. No headings.');

    // Open the outline.
    const outlineToggle = page.getByLabel('Show document outline');
    await outlineToggle.click();

    const nav = page.getByRole('navigation', { name: 'Document outline' });
    await expect(nav).toBeVisible();
    // PanelState's empty variant carries data-testid="panel-state-empty".
    const empty = nav.locator('[data-testid="panel-state-empty"]');
    await expect(empty).toBeVisible();
    await expect(empty).toContainText(/No headings/);
  });
});
