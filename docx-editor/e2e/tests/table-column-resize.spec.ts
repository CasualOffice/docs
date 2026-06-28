/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Verifies the `table-column-resize` gap-matrix row: dragging the
 * resize handle BETWEEN columns 0+1 should change both column 0
 * and column 1 widths (not just the last column).
 *
 * Fixture: a 3-column table with starting widths of 2400 twips each.
 * Test 1: drag the 0/1 handle right → col 0 wider, col 1 narrower
 * Test 2: drag the 1/2 handle right → col 1 wider, col 2 narrower
 * Test 3: drag the 0/1 handle back left → restores roughly
 *
 * The painter sets the cell width via inline `style.width = "<px>px"`,
 * so we can measure cell widths off the .layout-table-cell elements
 * directly. Resize handles are rendered with class
 * `.layout-table-resize-handle` and `data-column-index="N"`.
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

const FIXTURE = 'fixtures/table-column-resize.docx';

async function loadFixture(page: import('@playwright/test').Page) {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile(FIXTURE);
  await page.waitForSelector('.layout-table-resize-handle');
  await page.waitForTimeout(500);
  return editor;
}

/** Measure the first row's cell widths (one number per column). */
async function rowWidths(page: import('@playwright/test').Page): Promise<number[]> {
  return page.evaluate(() => {
    const row = document.querySelector('.layout-table-row');
    if (!row) return [];
    return Array.from(row.querySelectorAll('.layout-table-cell')).map((c) =>
      Math.round((c as HTMLElement).getBoundingClientRect().width)
    );
  });
}

/** Drag a column resize handle by dx pixels horizontally via mouse events. */
async function dragHandle(
  page: import('@playwright/test').Page,
  colIndex: number,
  dx: number
): Promise<void> {
  const handle = page
    .locator(`.layout-table-resize-handle[data-column-index="${colIndex}"]`)
    .first();
  const box = await handle.boundingBox();
  if (!box) throw new Error(`no handle for column ${colIndex}`);
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Move in a few steps so the editor's mousemove sees the drag.
  await page.mouse.move(startX + dx / 3, startY);
  await page.mouse.move(startX + (2 * dx) / 3, startY);
  await page.mouse.move(startX + dx, startY);
  await page.mouse.up();
  await page.waitForTimeout(400);
}

test.describe('Table column resize', () => {
  test('dragging the 0/1 handle right widens col 0 and narrows col 1', async ({ page }) => {
    await loadFixture(page);
    const before = await rowWidths(page);
    expect(before.length).toBe(3);
    await dragHandle(page, 0, +40);
    const after = await rowWidths(page);
    expect(after.length).toBe(3);
    // Col 0 grew, col 1 shrank, col 2 unchanged (within 1px round-off).
    expect(after[0]).toBeGreaterThan(before[0]);
    expect(after[1]).toBeLessThan(before[1]);
    expect(Math.abs(after[2] - before[2])).toBeLessThanOrEqual(1);
  });

  test('dragging the 1/2 handle right widens col 1 and narrows col 2', async ({ page }) => {
    await loadFixture(page);
    const before = await rowWidths(page);
    await dragHandle(page, 1, +40);
    const after = await rowWidths(page);
    expect(after[0] - before[0]).toBeLessThanOrEqual(1);
    expect(after[1]).toBeGreaterThan(before[1]);
    expect(after[2]).toBeLessThan(before[2]);
  });

  test('dragging the 0/1 handle left after a right-drag restores the original widths', async ({
    page,
  }) => {
    await loadFixture(page);
    const original = await rowWidths(page);
    await dragHandle(page, 0, +40);
    await dragHandle(page, 0, -40);
    const restored = await rowWidths(page);
    // Allow 2 px of cumulative round-off (twips ↔ px conversion + 15-twips-per-px math).
    expect(Math.abs(restored[0] - original[0])).toBeLessThanOrEqual(2);
    expect(Math.abs(restored[1] - original[1])).toBeLessThanOrEqual(2);
    expect(Math.abs(restored[2] - original[2])).toBeLessThanOrEqual(2);
  });
});
