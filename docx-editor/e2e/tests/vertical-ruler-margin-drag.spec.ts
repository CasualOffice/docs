/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Vertical-ruler top-margin marker must FOLLOW the drag.
 *
 * Regression: the vertical ruler read `initialSectionProperties`
 * (sections[0].properties) while margin drags only write to
 * `finalSectionProperties` — so for any doc with a section the top/bottom
 * margin marker stayed pinned while the page content reflowed ("blue arrow
 * doesn't move with the cursor"). The marker now reads the live
 * finalSectionProperties, like the horizontal ruler.
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

test('dragging the top-margin marker moves the marker with the pointer', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  // demo.docx carries a section (sections[0].properties) — the case that
  // reproduced the stuck marker.
  await editor.loadDocxFile('fixtures/demo.docx');
  await page.waitForTimeout(1200);

  const marker = page.locator('.docx-ruler-marker-topMargin');
  await expect(marker).toBeVisible();
  const before = await marker.boundingBox();
  expect(before).not.toBeNull();

  // Drag the top-margin marker down ~60px.
  const startX = before!.x + before!.width / 2;
  const startY = before!.y + before!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + 60, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  const after = await marker.boundingBox();
  expect(after).not.toBeNull();
  // The marker itself must have moved down (it used to stay put).
  expect(after!.y - before!.y).toBeGreaterThan(30);
});
