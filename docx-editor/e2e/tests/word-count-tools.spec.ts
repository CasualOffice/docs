import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// D5 — Tools → Word count opens the existing WordCountDialog. The dialog
// itself is exercised elsewhere; this spec just confirms the Tools-menu
// entry point Google Docs uses also works here, alongside the Edit menu
// entry that was already shipped (A7).
test.describe('Tools > Word count', () => {
  test('opens the word-count dialog from the Tools menu', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
    await editor.typeText('Five short words for the test.');

    await page.getByRole('button', { name: 'Tools', exact: true }).click();
    await page.waitForSelector('[role="menu"]', { state: 'visible', timeout: 4000 });
    const item = page.getByRole('menuitem', { name: /Word count/ });
    await expect(item).toBeVisible();
    await item.click();

    // WordCountDialog uses role="dialog" + aria-labelledby (no testid on
    // the shell). Locate via accessible name.
    const dlg = page.getByRole('dialog', { name: /Word count/i });
    await expect(dlg).toBeVisible();
    await expect(dlg).toContainText(/Words/);
  });
});
