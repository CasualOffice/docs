/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Equations already in a .docx render as real math (native MathML),
 * not the italic plain-text fallback. The OMML is converted to MathML
 * (ommlToMathml) at layout time and painted as a native <math> element.
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

test('OMML equations in a loaded doc render as native MathML', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/equations.docx');
  await page.waitForTimeout(1200);

  const pages = page.locator('.paged-editor__pages');
  // Native <math> elements should be painted for both the inline (E=mc²)
  // and display (fraction = √x) equations.
  const mathEls = pages.locator('math');
  await expect(mathEls.first()).toBeVisible();
  expect(await mathEls.count()).toBeGreaterThanOrEqual(2);

  // The inline equation produced a superscript (msup) for mc².
  await expect(pages.locator('math msup').first()).toBeVisible();
  // The display equation produced a fraction (mfrac) and a radical (msqrt).
  await expect(pages.locator('math mfrac').first()).toBeVisible();
  await expect(pages.locator('math msqrt').first()).toBeVisible();

  await page.screenshot({ path: 'screenshots/audit/equations.png' });
});
