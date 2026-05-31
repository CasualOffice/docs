import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// Status-bar right-click → small popover with 4 checkboxes (page,
// words, chars, reading time). Unchecking a box hides the cell and
// the preference persists in localStorage.
test.describe('Status bar checklist (sheet parity)', () => {
  test('right-click opens the customisation popover with 4 toggles', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await page.evaluate(() => {
      try {
        window.localStorage.removeItem('docx-editor-statbar-prefs');
      } catch {
        /* private mode */
      }
    });
    await editor.newDocument();

    const bar = page.getByTestId('status-bar');
    await bar.click({ button: 'right' });
    const checklist = page.getByTestId('statbar-checklist');
    await expect(checklist).toBeVisible();
    await expect(checklist.locator('input[type=checkbox]')).toHaveCount(4);
  });

  test('unchecking Reading time hides the cell and persists across reload', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    // Clear ONCE — not on every reload — so persistence is observable.
    await page.evaluate(() => {
      try {
        window.localStorage.removeItem('docx-editor-statbar-prefs');
      } catch {
        /* private mode */
      }
    });
    await editor.newDocument();
    await editor.focus();
    await editor.typeText('a few words to make the cell appear.');

    await expect(page.getByTestId('status-reading-time')).toBeVisible();
    await page.getByTestId('status-bar').click({ button: 'right' });
    await page.getByTestId('statbar-toggle-readingTime').click();
    await expect(page.getByTestId('status-reading-time')).toHaveCount(0);

    // Persist.
    await page.reload();
    await editor.waitForReady();
    await editor.focus();
    await editor.typeText('still here.');
    await expect(page.getByTestId('status-reading-time')).toHaveCount(0);
  });
});
