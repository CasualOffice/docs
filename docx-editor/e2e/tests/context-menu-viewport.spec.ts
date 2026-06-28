/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * The right-click context menu must stay within the viewport — when opened near
 * the bottom edge it should clamp up (and cap its height + scroll internally)
 * rather than spilling below the window. (User-reported: "context menu goes
 * below the tab and can scroll".)
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

test('text context menu stays within the viewport when opened near the bottom', async ({
  page,
}) => {
  // A short viewport makes overflow likely if the menu didn't clamp.
  await page.setViewportSize({ width: 1000, height: 560 });
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/demo.docx');
  await page.waitForTimeout(1000);

  // Right-click low in the viewport (a few px above the bottom edge).
  await page.mouse.click(420, 430, { button: 'right' });

  const menu = page.locator('.docx-text-context-menu');
  await expect(menu).toBeVisible();

  const box = await menu.boundingBox();
  const vh = page.viewportSize()!.height;
  const vw = page.viewportSize()!.width;
  expect(box, 'menu measurable').not.toBeNull();
  // Fully inside the viewport on all sides (allow a 1px rounding slack).
  expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(vh + 1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(vw + 1);
});
