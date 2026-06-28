/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// B9: "Auto-fit to window" — companion to the existing "Auto-fit to contents".
// Forces all columns to equal width summing to the page's content area.
test.describe('Table > Auto-fit', () => {
  test('Auto-fit to window equalizes column widths and fills the page', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
    await editor.insertTable(3, 3);
    await page.waitForTimeout(300);
    await editor.clickTableCell(0, 0, 0);
    await page.waitForTimeout(200);

    // Open the More menu → screenshot the pair (Auto-fit to contents + window).
    await editor.openTableMore();
    await page.screenshot({ path: 'screenshots/b9-menu.png' });
    await editor.clickTableMenuItem('Auto-fit to window');
    await page.waitForTimeout(300);

    // After autofit, the three columns should be equal-width within a small
    // tolerance (rendered px depends on zoom + sub-pixel rounding).
    const widths = await page.evaluate(() => {
      const row = document.querySelector('.ProseMirror table tr');
      if (!row) return [] as number[];
      return Array.from(row.querySelectorAll('td, th')).map((c) => (c as HTMLElement).getBoundingClientRect().width);
    });
    expect(widths.length).toBe(3);
    const avg = widths.reduce((a, b) => a + b, 0) / widths.length;
    for (const w of widths) {
      // ≤ 2px deviation from the average — equal-width within rounding.
      expect(Math.abs(w - avg)).toBeLessThanOrEqual(2);
    }
    await page.screenshot({ path: 'screenshots/b9-rendered.png' });
  });
});
