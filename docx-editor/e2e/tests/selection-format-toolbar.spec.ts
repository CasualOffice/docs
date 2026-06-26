/**
 * On-selection mini formatting toolbar (Google Docs / Word style).
 *
 * Selecting body text should surface a small floating toolbar above the
 * selection; its buttons apply the same formatting as the main toolbar and
 * reflect the selection's active marks. Clicking a button must NOT collapse
 * the selection (the documented PM focus-stealing pitfall).
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';
import * as assertions from '../helpers/assertions';

test.describe('Selection format toolbar', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
  });

  test('appears on selection and applies bold without losing the selection', async ({ page }) => {
    await editor.typeText('Mini toolbar text');
    await editor.selectText('toolbar');

    const bar = page.getByTestId('selection-format-toolbar');
    await expect(bar).toBeVisible();

    // Apply bold via the mini toolbar button.
    await page.getByTestId('selection-format-bold').click();
    await assertions.assertTextIsBold(page, 'toolbar');

    // Selection survived the click, so the toolbar is still up and bold reads active.
    await expect(bar).toBeVisible();
    await expect(page.getByTestId('selection-format-bold')).toHaveAttribute('aria-pressed', 'true');

    await page.screenshot({ path: 'screenshots/selection-format-toolbar.png' });
  });

  test('hides when the selection collapses', async ({ page }) => {
    await editor.typeText('Collapse me');
    await editor.selectText('Collapse');
    await expect(page.getByTestId('selection-format-toolbar')).toBeVisible();

    // Click to collapse the selection (place caret) → toolbar goes away.
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('selection-format-toolbar')).toBeHidden();
  });
});
