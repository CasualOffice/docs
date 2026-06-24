/**
 * Regression: the document-name field must never bake "…" into the
 * actual name.
 *
 * A user reported that a long document name showed "…" and that the
 * ellipsis "stayed" while editing/renaming — as if the name itself had
 * been concatenated. The truncation is purely a CSS affordance: the
 * field auto-grows to fit short names, caps for long ones (showing a
 * blurred "…"), and reveals the full text again on focus. These checks
 * lock that contract so the ellipsis can't regress into the stored
 * value or persist while the field is being edited.
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

const LONG_NAME = 'Q3 2026 Regional Sales Performance Review and Strategic Outlook';

test.describe('Document name field — auto-grow, no baked-in ellipsis', () => {
  test('field grows with content and never stores "…" in the name', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.loadDocxFile('fixtures/example-with-image.docx');

    const nameInput = page.getByRole('textbox', { name: /document name/i });
    await expect(nameInput).toBeVisible();

    // Short name → field hugs the text.
    await nameInput.click();
    await nameInput.fill('Report');
    await page.keyboard.press('Tab');
    const shortWidth = await nameInput.evaluate((el) => el.getBoundingClientRect().width);

    // Long name → field grows (capped), but the value is the full name.
    await nameInput.click();
    await nameInput.fill(LONG_NAME);
    await page.keyboard.press('Tab');
    const longWidth = await nameInput.evaluate((el) => el.getBoundingClientRect().width);

    expect(longWidth).toBeGreaterThan(shortWidth);

    // The stored/editable value must be the full name with no ellipsis —
    // the truncation is CSS only.
    expect(await nameInput.inputValue()).toBe(LONG_NAME);
    expect(await nameInput.inputValue()).not.toContain('…');
    expect(await nameInput.inputValue()).not.toContain('...');

    // Re-focusing for an edit/rename still shows the full name.
    await nameInput.click();
    expect(await nameInput.inputValue()).toBe(LONG_NAME);
  });
});
