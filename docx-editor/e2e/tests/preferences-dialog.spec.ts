import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// D7: Tools → Preferences dialog. Verifies that
//  (1) the Tools menu and Preferences item are present,
//  (2) the dialog opens with both toggles on (defaults), and
//  (3) toggling Smart quotes OFF stops the runtime substitution — i.e.
//      typing `"` leaves a straight quote, not a curly one. This is the
//      whole point of the feature: runtime-toggleable extensions.
test.describe('Tools > Preferences', () => {
  test('opens and toggling smart quotes off stops the substitution', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();

    // Menubar shows the Tools menu.
    const tools = page.getByRole('button', { name: 'Tools', exact: true });
    await expect(tools).toBeVisible();
    await tools.click();
    const item = page.getByRole('menuitem', { name: /Preferences/ });
    await expect(item).toBeVisible();
    await page.screenshot({ path: 'screenshots/d7-tools.png' });
    await item.click();

    // Dialog open with both toggles checked by default.
    const dialog = page.getByTestId('preferences-dialog');
    await expect(dialog).toBeVisible();
    const sq = page.getByTestId('pref-smartquotes');
    const ac = page.getByTestId('pref-autocorrect');
    await expect(sq).toBeChecked();
    await expect(ac).toBeChecked();
    await page.screenshot({ path: 'screenshots/d7-dialog.png' });

    // Turn off smart quotes, close.
    await sq.click();
    await expect(sq).not.toBeChecked();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();

    // Type a quote — should stay straight now that smart quotes is off.
    await editor.focus();
    await page.keyboard.type('"');
    const text = await page.evaluate(() => document.body.textContent || '');
    // Straight quote U+0022 present, curly U+201C / U+201D absent.
    expect(text).toContain('"');
    expect(text).not.toMatch(/[“”]/);
  });
});
