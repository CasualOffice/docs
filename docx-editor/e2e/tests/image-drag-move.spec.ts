/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Floating-image drag-to-move preserves the grab offset.
 *
 * Regression for the "movement is completely screwed up" report: grabbing the
 * image anywhere but its top-left corner used to snap the top-left to the
 * cursor on drop, so the image jumped by the grab offset. A move must instead
 * translate the image by the drag delta (the grabbed point stays under the
 * cursor), matching Google Docs / Word.
 *
 * Fixture: `wrap-none-positioned-image-demo.docx` — a single wrap-none
 * (positioned float) image.
 */
import { test, expect, type Page } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

const FIXTURE = 'fixtures/wrap-none-positioned-image-demo.docx';

async function loadFixture(page: Page) {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await page.locator('input[type="file"][accept*=".docx"]').setInputFiles(`e2e/${FIXTURE}`);
  await page.waitForSelector('.paged-editor__pages');
  await page.waitForSelector('[data-page-number]');
  await page.waitForTimeout(1500);
}

test.describe('Floating image drag-to-move', () => {
  test('grabbing the centre and dragging moves the image by the drag delta', async ({ page }) => {
    await loadFixture(page);

    const img = page.locator('.layout-page img').first();
    const before = await img.boundingBox();
    expect(before).not.toBeNull();
    if (!before) return;

    // Select, then grab the CENTRE (a large grab offset from top-left) and drag.
    const cx = before.x + before.width / 2;
    const cy = before.y + before.height / 2;
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(200);

    const DX = 90;
    const DY = 50;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + DX, cy + DY, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    const after = await img.boundingBox();
    expect(after).not.toBeNull();
    if (!after) return;

    // The image must translate by ~the drag delta, NOT by delta + grab offset.
    // Allow a few px of rounding (EMU round-trip + zoom).
    expect(Math.abs(after.x - before.x - DX)).toBeLessThanOrEqual(4);
    expect(Math.abs(after.y - before.y - DY)).toBeLessThanOrEqual(4);
  });
});
