import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// A5 — Tools → Translate opens a dialog seeded from the selection.
// Mocks the MyMemory endpoint so the run is deterministic offline.
test.describe('Tools > Translate (A5)', () => {
  test('translates the selection and shows source + result', async ({ page }) => {
    await page.route('https://api.mymemory.translated.net/get**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          responseData: { translatedText: 'Hola mundo' },
          responseStatus: 200,
        }),
      });
    });

    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
    await editor.typeText('hello world');
    await editor.selectAll();

    await page.getByRole('button', { name: 'Tools', exact: true }).click();
    await page.waitForSelector('[role="menu"]', { state: 'visible', timeout: 4000 });
    // Exact match — there's also a "Translate document…" item below
    // (whole-doc export flow) that loosely matches the same regex.
    await page.getByRole('menuitem', { name: 'Translate…', exact: true }).click();

    const dlg = page.getByTestId('translate-dialog');
    await expect(dlg).toBeVisible();
    await expect(page.getByTestId('translate-source-text')).toContainText('hello world');
    await expect(page.getByTestId('translate-result')).toHaveText('Hola mundo');
    await page.screenshot({ path: 'screenshots/a5-translate.png' });
  });

  test('error response surfaces the PanelState retry', async ({ page }) => {
    await page.route('https://api.mymemory.translated.net/get**', (route) => {
      route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    });

    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
    await editor.typeText('test');
    await editor.selectAll();

    await page.getByRole('button', { name: 'Tools', exact: true }).click();
    // Exact match — there's also a "Translate document…" item below
    // (whole-doc export flow) that loosely matches the same regex.
    await page.getByRole('menuitem', { name: 'Translate…', exact: true }).click();

    // `translateText` now retries with 800/1800/4000 ms backoff before
    // surfacing the error, so allow ~10 s for the final failure to
    // bubble up to the PanelState.
    await expect(page.getByTestId('panel-state-error')).toBeVisible({ timeout: 12_000 });
    await expect(page.getByTestId('panel-state-retry')).toBeVisible();
  });
});
