/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Insert → Equation: type LaTeX, preview as MathML, insert as a real math
 * node that renders on the page (and round-trips to OMML on save).
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

test('Insert → Equation: LaTeX input + preview + insert renders math', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.newDocument();
  await editor.focus();

  // Open the dialog via Alt+= (Word/OnlyOffice convention).
  await page.keyboard.press('Alt+Equal');
  const dialog = page.getByTestId('equation-dialog');
  await expect(dialog).toBeVisible();

  // Type a LaTeX fraction.
  const input = page.getByTestId('equation-latex-input');
  await input.fill('\\frac{a}{b} + x^{2}');

  // The live preview renders native MathML (fraction + superscript).
  const preview = page.getByTestId('equation-preview');
  await expect(preview.locator('math mfrac')).toBeVisible();
  await expect(preview.locator('math msup')).toBeVisible();

  // Insert → the dialog closes and a <math> equation paints on the page.
  await page.getByTestId('equation-insert').click();
  await expect(dialog).toHaveCount(0);
  const pages = page.locator('.paged-editor__pages');
  await expect(pages.locator('math mfrac').first()).toBeVisible();
});
