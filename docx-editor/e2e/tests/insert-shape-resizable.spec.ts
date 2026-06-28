/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Insert → Shape produces a resizable vector shape (currently an
 * SVG-image node — renders, selectable, resizable, movable). Guards
 * that inserting a shape isn't inert. (A native DrawingML shape node
 * with recolor is a tracked larger enhancement — see docs/internal/24.)
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

test('Insert → Shape → Rectangle inserts a selectable, resizable shape', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.focus();
  await editor.typeText('Body.');

  const imgsBefore = await page.locator('[data-testid="docx-editor"] img.layout-run-image').count();

  await page.getByRole('button', { name: 'Insert', exact: true }).click();
  await page.waitForSelector('[role="menu"]', { state: 'visible' });
  await page.getByRole('menuitem', { name: /^Shape$/ }).hover();
  await page.waitForTimeout(300);
  await page.getByRole('menuitem', { name: /Rectangle/i }).first().click();
  await page.waitForTimeout(600);

  const imgsAfter = await page.locator('[data-testid="docx-editor"] img.layout-run-image').count();
  expect(imgsAfter).toBe(imgsBefore + 1);

  // Select it → resize handles appear.
  const shape = page.locator('[data-testid="docx-editor"] img.layout-run-image').last();
  const box = await shape.boundingBox();
  await shape.click({ position: { x: Math.round(box!.width / 2), y: Math.round(box!.height / 2) } });
  await page.waitForTimeout(400);
  await expect(page.locator('[data-handle]')).toHaveCount(4);
});
