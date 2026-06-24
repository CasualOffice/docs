/**
 * Editing an existing equation: double-click a painted equation re-opens the
 * dialog prefilled with its LaTeX; inserting replaces it in place.
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

test('double-click an equation re-opens it prefilled and replaces on insert', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.newDocument();
  await editor.focus();

  // Insert an equation: a/b.
  await page.keyboard.press('Alt+Equal');
  await page.getByTestId('equation-latex-input').fill('\\frac{a}{b}');
  await page.getByTestId('equation-insert').click();
  const pages = page.locator('.paged-editor__pages');
  await expect(pages.locator('math mfrac').first()).toBeVisible();

  // Double-click the painted equation → dialog re-opens PREFILLED with its LaTeX.
  await pages.locator('.docx-math').first().dblclick();
  const input = page.getByTestId('equation-latex-input');
  await expect(input).toHaveValue('\\frac{a}{b}');

  // Edit to a superscript and insert → replaces the equation in place.
  await input.fill('x^{2}');
  await page.getByTestId('equation-insert').click();
  await expect(page.getByTestId('equation-dialog')).toHaveCount(0);

  // The fraction is gone; a superscript took its place (still ONE equation).
  await expect(pages.locator('math mfrac')).toHaveCount(0);
  await expect(pages.locator('math msup').first()).toBeVisible();
  expect(await pages.locator('math').count()).toBe(1);
});
