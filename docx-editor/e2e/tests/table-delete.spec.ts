/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Table delete via the right-click context menu — regression.
 *
 * The "Delete table" item was surfaced in the cell right-click menu but
 * the context-menu action switch had no `deleteTable` case, so clicking
 * it did nothing (user-reported). This pins the behavior end-to-end.
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

const TABLE = '[data-testid="docx-editor"] .layout-table';

test('right-click → Delete table removes the table', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/repr-memo.docx');
  await page.waitForSelector(TABLE, { timeout: 15000 });

  const before = await page.locator(TABLE).count();
  expect(before).toBeGreaterThan(0);

  const cell = page.locator('[data-testid="docx-editor"] .layout-table-cell').first();
  const box = await cell.boundingBox();
  if (!box) throw new Error('no cell bounding box');

  // Place the caret in a cell, then open the right-click menu there.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(250);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  await page.waitForTimeout(350);

  await page.getByText('Delete table', { exact: false }).first().click();
  await page.waitForTimeout(500);

  const after = await page.locator(TABLE).count();
  expect(after).toBe(before - 1);
});
