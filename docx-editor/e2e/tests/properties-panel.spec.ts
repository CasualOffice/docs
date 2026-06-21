/**
 * Contextual Format/Properties panel — COMPLETE end-to-end flow.
 *
 * Asserts the whole feature works, not just that testids exist:
 *  1. opens via the rail (manual, no auto-open),
 *  2. behaves like the history panel — a flex sibling that the page makes
 *     room for (page right edge shrinks), NOT an overlay covering the doc,
 *  3. a property change actually APPLIES to the document (wrap inline -> behind
 *     moves the image into the floating layer),
 *  4. closing releases the room.
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

const PAGE = '[data-testid="docx-editor"] .layout-page';
const PANEL = '[data-testid="properties-panel"]';
const INLINE_IMG = '[data-testid="docx-editor"] img.layout-run-image';
const FLOATING_IMG =
  '[data-testid="docx-editor"] .layout-page-floating-image, [data-testid="docx-editor"] .layout-block-image';

test('Format panel: opens beside the doc (no overlay), applies a property, closes', async ({
  page,
}) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/example-with-image.docx');
  await page.waitForTimeout(1200);

  const pageRight = async () => {
    const b = await page.locator(PAGE).first().boundingBox();
    return (b?.x ?? 0) + (b?.width ?? 0);
  };
  const rightClosed = await pageRight();

  // 1. select image, open the panel via the rail (no auto-open before this)
  const img = page.locator(INLINE_IMG).first();
  const ib = await img.boundingBox();
  await img.click({ position: { x: Math.round(ib!.width / 2), y: Math.round(ib!.height / 2) } });
  await page.waitForTimeout(300);
  expect(await page.locator(PANEL).count()).toBe(0); // no auto-open
  await page.locator('[data-testid="rail-properties"]').click();
  await page.waitForTimeout(400);

  // 2. panel + section visible; page MADE ROOM (flex sibling, not an overlay)
  await expect(page.locator(PANEL)).toBeVisible();
  await expect(page.locator('[data-testid="properties-image-section"]')).toBeVisible();
  const rightOpen = await pageRight();
  expect(rightOpen).toBeLessThan(rightClosed - 50); // page shrank to make room

  // panel must not cover the image content
  const panelBox = await page.locator(PANEL).boundingBox();
  const imgBox = await img.boundingBox();
  expect((imgBox?.x ?? 0) + (imgBox?.width ?? 0)).toBeLessThan(panelBox?.x ?? 0);

  // 3. property actually APPLIES: inline -> behind moves it to the floating layer
  const inlineBefore = await page.locator(INLINE_IMG).count();
  const floatBefore = await page.locator(FLOATING_IMG).count();
  await page.locator('[data-testid="properties-wrap-behind"]').click();
  await page.waitForTimeout(600);
  expect(await page.locator(INLINE_IMG).count()).toBe(inlineBefore - 1);
  expect(await page.locator(FLOATING_IMG).count()).toBe(floatBefore + 1);

  // 4. close releases the room
  await page.locator('[data-testid="rail-properties"]').click();
  await page.waitForTimeout(300);
  expect(await page.locator(PANEL).count()).toBe(0);
  expect(await pageRight()).toBeGreaterThan(rightOpen + 50);
});
