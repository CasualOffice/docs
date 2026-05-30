import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// A3 — Tools → Explore looks up the selection via Wikipedia's REST
// summary endpoint. Mocked so the spec runs offline.
test.describe('Tools > Explore (A3)', () => {
  test('shows Wikipedia summary and inserts a hyperlink on Cite', async ({ page }) => {
    await page.route('https://en.wikipedia.org/api/rest_v1/page/summary/**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          title: 'Ada Lovelace',
          extract:
            'Augusta Ada King, Countess of Lovelace was an English mathematician and writer.',
          content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Ada_Lovelace' } },
        }),
      });
    });

    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
    await editor.typeText('Ada Lovelace');
    await editor.selectAll();

    await page.getByRole('button', { name: 'Tools', exact: true }).click();
    await page.waitForSelector('[role="menu"]', { state: 'visible', timeout: 4000 });
    await page.getByRole('menuitem', { name: /Explore/ }).click();

    const dlg = page.getByTestId('explore-dialog');
    await expect(dlg).toBeVisible();
    await expect(page.getByTestId('explore-input')).toHaveValue('Ada Lovelace');
    await expect(page.getByTestId('explore-result-title')).toHaveText('Ada Lovelace');
    await expect(page.getByTestId('explore-result-extract')).toContainText(/mathematician/);
    await expect(page.getByTestId('explore-open-link')).toHaveAttribute(
      'href',
      'https://en.wikipedia.org/wiki/Ada_Lovelace'
    );
    await page.screenshot({ path: 'screenshots/a3-explore.png' });

    // Cite → dialog closes + a hyperlink to the Wikipedia URL is inserted.
    await page.getByTestId('explore-cite').click();
    await expect(dlg).not.toBeVisible();
    const link = page
      .locator('.paged-editor__pages a[href="https://en.wikipedia.org/wiki/Ada_Lovelace"]')
      .first();
    await expect(link).toHaveCount(1);
  });
});
