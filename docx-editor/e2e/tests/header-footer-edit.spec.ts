/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Header/footer editing is discoverable + works: hovering shows a
 * "Double-click to edit" affordance, and double-clicking enters edit mode where
 * typing inserts text. (Editing always worked via double-click; the user
 * reported it "uneditable" because there was no affordance for content-filled
 * headers — only empty ones got a hint.)
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

const HEADER = '[data-testid="docx-editor"] .layout-page-header';
const PAGES = '[data-testid="docx-editor"] .paged-editor__pages';

test('header: hover shows the edit affordance, double-click edits', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/header-with-table.docx');
  await page.waitForTimeout(1500);

  const header = page.locator(HEADER).first();
  await expect(header).toBeAttached();

  // 1. hover surfaces the "Double-click to edit header" hint (content-filled)
  await header.hover();
  await page.waitForTimeout(200);
  const hint = await header.evaluate((el) => getComputedStyle(el, '::after').content);
  expect(hint).toContain('Double-click to edit header');
  // native title tooltip is also set (unclipped fallback)
  expect(await header.getAttribute('title')).toBe('Double-click to edit header');

  // 2. double-click enters header edit mode
  const box = await header.boundingBox();
  await page.mouse.dblclick(box!.x + 40, box!.y + box!.height / 2);
  await page.waitForTimeout(400);
  await expect(page.locator(`${PAGES}.paged-editor--editing-header`)).toBeAttached();

  // 3. typing inserts into the header (active edits live in the hf-editor-pm
  //    overlay while editing)
  await page.keyboard.type('ZZTOP');
  await page.waitForTimeout(300);
  await expect(page.locator('[data-testid="docx-editor"] .hf-editor-pm')).toContainText('ZZTOP');
});
