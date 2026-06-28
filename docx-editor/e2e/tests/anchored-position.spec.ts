/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Anchored floating-object POSITION fidelity (not just wrap avoidance).
 *
 * The existing float-text-wrapping spec only asserts that text avoids floating
 * images — it never checks that an image lands at its declared wp:positionH/V
 * posOffset. This probe pins the absolute position: float-wrap-comprehensive-
 * test.docx has a column-anchored image at posOffset 2857500 EMU = 300px @96dpi,
 * so its left edge must sit ~300px from the content-area left.
 */
import { test, expect, type Page } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

const FIXTURE = 'fixtures/float-wrap-comprehensive-test.docx';

async function loadFixture(page: Page) {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await page.locator('input[type="file"][accept*=".docx"]').setInputFiles(`e2e/${FIXTURE}`);
  await page.waitForSelector('.paged-editor__pages');
  await page.waitForSelector('[data-page-number]');
  await page.waitForTimeout(1500);
}

test('a column-anchored floating image is painted at its posOffset (300px)', async ({ page }) => {
  await loadFixture(page);

  const result = await page.evaluate(() => {
    const imgs = Array.from(
      document.querySelectorAll('.layout-page-floating-image')
    ) as HTMLElement[];
    // Measure each floating image's left edge relative to its page's content area.
    return imgs.map((el) => {
      const pageEl = el.closest('[data-page-number]');
      const contentEl = pageEl?.querySelector('.layout-page-content') as HTMLElement | null;
      const base = (contentEl ?? pageEl) as HTMLElement;
      const baseRect = base.getBoundingClientRect();
      const imgRect = el.getBoundingClientRect();
      return Math.round(imgRect.left - baseRect.left);
    });
  });

  // At least one floating image must sit ~300px from the content-area left.
  // Tolerance covers sub-pixel rounding + the floating layer's own border box.
  const has300 = result.some((leftPx) => Math.abs(leftPx - 300) <= 6);
  expect(
    has300,
    `expected a floating image at ~300px from content left; measured lefts: ${JSON.stringify(result)}`
  ).toBe(true);
});

test('textbox Format-panel Position X/Y anchors the painted box at the offset', async ({
  page,
}) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/textbox-test.docx');
  await page.waitForTimeout(1500);

  const box = page.locator('[data-testid="docx-editor"] .layout-textbox').first();
  await box.click({ position: { x: 24, y: 12 } });
  await page.waitForTimeout(400);
  await page.locator('[data-testid="textbox-format-chip"]').click();
  await page.waitForTimeout(300);
  await expect(page.locator('[data-testid="properties-textbox-section"]')).toBeVisible();

  // Set an explicit position (margin-relative, i.e. from the content-area top-left).
  await page.locator('[data-testid="properties-textbox-pos-x"]').fill('250');
  await page.locator('[data-testid="properties-textbox-pos-x"]').press('Enter');
  await page.locator('[data-testid="properties-textbox-pos-y"]').fill('180');
  await page.locator('[data-testid="properties-textbox-pos-y"]').press('Enter');
  await page.waitForTimeout(600);

  // The painted box must sit ~ (250, 180) px from its page's content-area
  // top-left. Default e2e viewport (1280) → zoom 1.0, so px map 1:1.
  const offset = await page.evaluate(() => {
    const el = document.querySelector(
      '[data-testid="docx-editor"] .layout-textbox'
    ) as HTMLElement | null;
    if (!el) return null;
    const content = el.closest('[data-page-number]')?.querySelector('.layout-page-content');
    if (!content) return null;
    const c = content.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    return { dx: Math.round(b.left - c.left), dy: Math.round(b.top - c.top) };
  });

  expect(offset, 'textbox + content area must be measurable').not.toBeNull();
  expect(Math.abs((offset as { dx: number }).dx - 250)).toBeLessThanOrEqual(8);
  expect(Math.abs((offset as { dy: number }).dy - 180)).toBeLessThanOrEqual(8);

  // The panel reflects the committed offset (round-trips into the node attrs).
  await expect(page.locator('[data-testid="properties-textbox-pos-x"]')).toHaveValue('250');

  await page.screenshot({ path: 'screenshots/textbox-position.png' });
});
