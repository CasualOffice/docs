import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// A6 v0 — Tools → Citations manages a local list of citations and
// inserts them at the cursor as formatted text + a hyperlink for the
// URL. Storage is localStorage so the spec needs to start clean.
test.describe('Tools > Citations (A6 v0)', () => {
  test.beforeEach(async ({ context }) => {
    // Make sure the storage key doesn't carry over between tests.
    await context.addInitScript(() => {
      try {
        window.localStorage.removeItem('docx-editor-citations');
      } catch {
        /* private mode */
      }
    });
  });

  test('add → switch styles → insert → delete', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();

    await page.getByRole('button', { name: 'Tools', exact: true }).click();
    await page.waitForSelector('[role="menu"]', { state: 'visible', timeout: 4000 });
    await page.getByRole('menuitem', { name: /Citations/ }).click();

    const dlg = page.getByTestId('citations-dialog');
    await expect(dlg).toBeVisible();
    await expect(page.getByTestId('citation-empty')).toBeVisible();

    // Add a citation.
    await page.getByTestId('citation-author').fill('Knuth, D.');
    await page.getByTestId('citation-title').fill('The Art of Computer Programming');
    await page.getByTestId('citation-year').fill('1968');
    await page.getByTestId('citation-url').fill('https://example.com/taocp');
    await page.getByTestId('citation-add').click();

    // List shows the APA-formatted entry by default.
    await expect(dlg).toContainText('Knuth, D. (1968).');
    await expect(dlg).toContainText('The Art of Computer Programming');
    await page.screenshot({ path: 'screenshots/a6-apa.png' });

    // Switch to MLA — the rendered text updates inside the row.
    await page.getByTestId('citation-style-mla').check();
    await expect(dlg).toContainText('“The Art of Computer Programming.”');

    // Insert the citation — formatted text appears in the painted doc
    // and the URL substring is wrapped in a hyperlink mark. (Dialog
    // stays open so the user can insert more; we close it manually.)
    const insertBtn = dlg.getByRole('button', { name: 'Insert' }).first();
    await insertBtn.click();
    await page.keyboard.press('Escape');
    await expect(dlg).not.toBeVisible();
    const link = page
      .locator('.paged-editor__pages a[href="https://example.com/taocp"]')
      .first();
    await expect(link).toHaveCount(1);

    // Delete the citation from storage.
    await page.getByRole('button', { name: 'Tools', exact: true }).click();
    await page.getByRole('menuitem', { name: /Citations/ }).click();
    const dlg2 = page.getByTestId('citations-dialog');
    await dlg2.getByRole('button', { name: /^Delete citation/ }).click();
    await expect(page.getByTestId('citation-empty')).toBeVisible();
  });
});
