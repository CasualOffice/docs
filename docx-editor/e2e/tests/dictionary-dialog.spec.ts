import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// A4 — Tools → Dictionary opens a lookup dialog seeded from the
// selection. The lookup hits a free public API (dictionaryapi.dev);
// we mock the request so the spec runs offline and deterministically.
test.describe('Tools > Dictionary (A4)', () => {
  test('looks up the selected word and renders the result', async ({ page }) => {
    // Mock the dictionary endpoint before navigating.
    await page.route('https://api.dictionaryapi.dev/api/v2/entries/en/**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            word: 'hello',
            meanings: [
              {
                partOfSpeech: 'noun',
                definitions: [{ definition: '"Hello!" or an equivalent greeting.' }],
              },
              {
                partOfSpeech: 'verb',
                definitions: [{ definition: 'To greet with "hello".' }],
              },
            ],
          },
        ]),
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
    await page.getByRole('menuitem', { name: /Dictionary/ }).click();

    const dlg = page.getByTestId('dictionary-dialog');
    await expect(dlg).toBeVisible();
    // Selection had two words — only the first should be pre-filled.
    await expect(page.getByTestId('dictionary-input')).toHaveValue('hello');

    // Result renders.
    await expect(page.getByTestId('dictionary-word')).toHaveText('hello');
    await expect(dlg).toContainText(/noun/);
    await expect(dlg).toContainText(/equivalent greeting/);
    await expect(dlg).toContainText(/verb/);
    await page.screenshot({ path: 'screenshots/a4-dictionary.png' });
  });

  test('not-found surfaces an error PanelState', async ({ page }) => {
    await page.route('https://api.dictionaryapi.dev/api/v2/entries/en/**', (route) => {
      route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    });

    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
    await editor.typeText('asdfasdf');
    await editor.selectAll();

    await page.getByRole('button', { name: 'Tools', exact: true }).click();
    await page.getByRole('menuitem', { name: /Dictionary/ }).click();

    await expect(page.getByTestId('panel-state-error')).toBeVisible();
    await expect(page.getByTestId('panel-state-error')).toContainText(/No definition found/);
  });
});
