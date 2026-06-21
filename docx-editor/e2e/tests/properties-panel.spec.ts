/**
 * Contextual Format/Properties panel — image entry via the selection chip.
 *
 * Verifies the agreed UX: selecting an object shows a "Format" chip; the
 * chip (never auto-open) opens a panel that OVERLAYS the right margin
 * (no canvas shift); the panel shows the object's properties.
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

const PAGE = '[data-testid="docx-editor"] .layout-page';
const PANEL = '[data-testid="properties-panel"]';

test('image: Format chip opens a contextual panel without shifting the canvas', async ({
  page,
}) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/example-with-image.docx');
  await page.waitForTimeout(1200);

  const pageBox0 = await page.locator(PAGE).first().boundingBox();

  const img = page.locator('[data-testid="docx-editor"] img.layout-run-image').first();
  const ib = await img.boundingBox();
  if (!ib) throw new Error('no image');
  await img.click({ position: { x: Math.round(ib.width / 2), y: Math.round(ib.height / 2) } });
  await page.waitForTimeout(300);

  // Chip appears on selection; panel is NOT auto-opened.
  await expect(page.locator('[data-testid="image-format-chip"]')).toBeVisible();
  expect(await page.locator(PANEL).count()).toBe(0);

  await page.locator('[data-testid="image-format-chip"]').click();
  await page.waitForTimeout(400);

  // Panel opens with the image section; canvas did not move.
  await expect(page.locator(PANEL)).toBeVisible();
  await expect(page.locator('[data-testid="properties-image-section"]')).toBeVisible();
  const pageBox1 = await page.locator(PAGE).first().boundingBox();
  expect(Math.abs((pageBox1?.x ?? 0) - (pageBox0?.x ?? 0))).toBeLessThan(2);

  // Wrap options are present + clickable (the section drives the real
  // setImageWrapType command; applying it is covered by image-wrap specs).
  await expect(page.locator('[data-testid="properties-wrap-inline"]')).toBeVisible();
  await expect(page.locator('[data-testid="properties-wrap-squareLeft"]')).toBeVisible();
});
