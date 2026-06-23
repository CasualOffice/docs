/**
 * Selection chrome must follow the canvas when the Format panel opens.
 *
 * Bug (user-reported): clicking an image / text box shows a blue selection box
 * + Format chip. Clicking the chip opens the Format panel, which is a flex
 * sibling that shrinks + shifts the page LEFT — but the blue box stayed at its
 * old coordinates (no scroll / window-resize event fires on that reflow), so it
 * detached from the object until the panel was closed + reopened.
 *
 * Fix: ResizeObserver on the page viewport re-anchors the overlay on reflow.
 * These tests open the panel and assert the selection chrome still hugs the
 * object (would be off by the panel width before the fix).
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

const PANEL = '[data-testid="properties-panel"]';
const IMG_CHIP = '[data-testid="image-format-chip"]';
const INLINE_IMG = '[data-testid="docx-editor"] img.layout-run-image';

test('image selection overlay follows the canvas when the Format panel opens', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/example-with-image.docx');
  await page.waitForTimeout(1200);

  const img = page.locator(INLINE_IMG).first();
  const ib = await img.boundingBox();
  await img.click({ position: { x: Math.round(ib!.width / 2), y: Math.round(ib!.height / 2) } });
  await page.waitForTimeout(300);
  await expect(page.locator(IMG_CHIP)).toBeVisible();

  await page.locator(IMG_CHIP).click();
  await expect(page.locator(PANEL)).toBeVisible();
  await page.waitForTimeout(500); // allow reflow + ResizeObserver re-anchor

  // The overlay's left edge must track the (now shifted-left) image, not stay
  // at the pre-panel position. Tolerance covers border/handle inset.
  const delta = await page.evaluate(() => {
    // The .image-selection-overlay is a full-width container at left:0; the
    // actual blue selection box is its first child, positioned at the image.
    const box = document.querySelector('.image-selection-overlay > div') as HTMLElement | null;
    const im = document.querySelector('img.layout-run-image') as HTMLElement | null;
    if (!box || !im) return null;
    return Math.abs(box.getBoundingClientRect().left - im.getBoundingClientRect().left);
  });
  expect(delta, 'overlay must re-anchor to the shifted image').not.toBeNull();
  expect(delta as number).toBeLessThanOrEqual(8);
});

test('text box selection box follows the canvas when the Format panel opens', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/textbox-test.docx');
  await page.waitForTimeout(1500);

  const box = page.locator('[data-testid="docx-editor"] .layout-textbox').first();
  await box.click({ position: { x: 24, y: 12 } });
  await page.waitForTimeout(400);
  await expect(page.locator('[data-testid="textbox-format-chip"]')).toBeVisible();

  await page.locator('[data-testid="textbox-format-chip"]').click();
  await expect(page.locator(PANEL)).toBeVisible();
  await page.waitForTimeout(500); // reflow + re-anchor

  // The NW resize handle (top-left of the blue box) must sit at the painted
  // box's top-left after the page shifts — before the fix it lagged by ~panel
  // width.
  const delta = await page.evaluate(() => {
    const nw = document.querySelector('[data-testid="textbox-resize-nw"]') as HTMLElement | null;
    const tb = document.querySelector(
      '[data-testid="docx-editor"] .layout-textbox'
    ) as HTMLElement | null;
    if (!nw || !tb) return null;
    const n = nw.getBoundingClientRect();
    const t = tb.getBoundingClientRect();
    // handle is centered on the corner (9px), so its center ≈ box top-left.
    return Math.abs(n.left + n.width / 2 - t.left);
  });
  expect(delta, 'textbox handle must re-anchor to the shifted box').not.toBeNull();
  expect(delta as number).toBeLessThanOrEqual(10);
});
