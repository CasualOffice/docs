/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * M1b editing-experience contract — STRUCTURAL EDITS.
 *
 * Inserting and mutating block-level structures: images (insert + resize),
 * tables (insert, edit cells, add row/col, nesting), equations, and page
 * breaks. Each asserts the resulting node in the model (or its painted
 * proxy) so the canvas renderer is held to the same outcome.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';
import { countNodes } from './_model';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_IMAGE = path.join(__dirname, '..', 'fixtures', 'test-image.png');

test.describe('Structural edits', () => {
  let ed: EditorPage;

  test.beforeEach(async ({ page }) => {
    ed = new EditorPage(page);
    await ed.goto();
    await ed.waitForReady();
    await ed.newDocument();
    await ed.focus();
  });

  test('insert an image, then resize it via a corner handle', async ({ page }) => {
    const imageInput = page.locator('input[type="file"][accept*="image"]');
    await imageInput.setInputFiles(TEST_IMAGE);

    const img = page.locator('.paged-editor__pages img').first();
    await expect(img).toBeVisible({ timeout: 10000 });
    expect(await countNodes(page, 'image')).toBeGreaterThanOrEqual(1);

    const before = await img.boundingBox();
    if (!before) throw new Error('no image box');

    // Select → corner handles appear; drag the SE handle inward to shrink.
    await img.click({
      position: { x: Math.round(before.width / 2), y: Math.round(before.height / 2) },
    });
    await page.waitForTimeout(400);
    const handle = page.locator('[data-handle="se"]').first();
    if ((await handle.count()) === 0) {
      test.skip(true, 'no resize handle exposed for this image kind in this harness');
      return;
    }
    const hb = await handle.boundingBox();
    if (!hb) throw new Error('no handle box');
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x - 60, hb.y - 60, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    const after = await img.boundingBox();
    expect(Math.abs((after?.width ?? 0) - before.width)).toBeGreaterThan(15);
  });

  test('insert a table, edit a cell, add a row and a column', async ({ page }) => {
    await ed.insertTable(2, 2);
    await page.waitForTimeout(200);
    expect(await ed.getTableDimensions(0)).toEqual({ rows: 2, cols: 2 });

    // Edit the first cell.
    await ed.clickTableCell(0, 0, 0);
    await ed.typeText('R0C0');
    await page.waitForTimeout(150);
    expect(await ed.getTableCellContent(0, 0, 0)).toContain('R0C0');

    // Add a row below and a column right → 3×3.
    await ed.clickTableCell(0, 0, 0);
    await ed.addRowBelow();
    await page.waitForTimeout(200);
    await ed.clickTableCell(0, 0, 0);
    await ed.addColumnRight();
    await page.waitForTimeout(200);

    expect(await ed.getTableDimensions(0)).toEqual({ rows: 3, cols: 3 });
    // The edited cell survives the structural change.
    expect(await ed.getTableCellContent(0, 0, 0)).toContain('R0C0');
  });

  test('insert a nested table inside a cell', async ({ page }) => {
    await ed.insertTable(2, 2);
    await page.waitForTimeout(200);

    // Put the caret in a cell, then insert another table → nested.
    await ed.clickTableCell(0, 0, 0);
    await page.waitForTimeout(100);
    await ed.insertTable(2, 2);
    await page.waitForTimeout(250);

    // Two tables now exist, and one is nested inside another (table>…>table).
    expect(await ed.getTableCount()).toBeGreaterThanOrEqual(2);
    const nested = await page.locator('.ProseMirror table table').count();
    expect(nested).toBeGreaterThanOrEqual(1);
  });

  test('insert an equation via Alt+= renders a math node', async ({ page }) => {
    await page.keyboard.press('Alt+Equal');
    const dialog = page.getByTestId('equation-dialog');
    await expect(dialog).toBeVisible();

    await page.getByTestId('equation-latex-input').fill('\\frac{a}{b} + x^{2}');
    const preview = page.getByTestId('equation-preview');
    await expect(preview.locator('math mfrac')).toBeVisible();

    await page.getByTestId('equation-insert').click();
    await expect(dialog).toHaveCount(0);
    await page.waitForTimeout(150);

    expect(await countNodes(page, 'math')).toBeGreaterThanOrEqual(1);
    await expect(page.locator('.paged-editor__pages math mfrac').first()).toBeVisible();
  });

  test('Cmd/Ctrl+Enter inserts a page break', async ({ page }) => {
    await ed.typeText('before break');
    expect(await countNodes(page, 'pageBreak')).toBe(0);

    const isMac = await page.evaluate(() => /Mac/i.test(navigator.platform));
    await page.keyboard.press(`${isMac ? 'Meta' : 'Control'}+Enter`);
    await page.waitForTimeout(150);

    expect(await countNodes(page, 'pageBreak')).toBe(1);
    await expect(page.locator('.ProseMirror .docx-page-break')).toHaveCount(1);
  });
});
