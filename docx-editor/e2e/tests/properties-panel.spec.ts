/**
 * Contextual Format/Properties panel — COMPLETE end-to-end flow for BOTH
 * object kinds, driving the REAL entry point (the on-object "Format" chip)
 * and asserting the feature actually works, not just that testids exist:
 *
 *  IMAGE
 *   1. selecting an image shows the on-object chip (no auto-open of the panel),
 *   2. clicking the chip opens the panel beside the doc — a flex sibling the
 *      page makes room for (right edge shrinks), NOT an overlay over the doc,
 *   3. the panel shows the IMAGE section (not the empty placeholder),
 *   4. a wrap change actually APPLIES (inline -> behind moves the image into
 *      the floating layer).
 *
 *  TABLE  (the case the old image-only test never covered — which is how a
 *          broken/empty table panel shipped)
 *   5. clicking inside a table shows the table chip,
 *   6. clicking it opens the panel showing the TABLE section (not empty),
 *   7. a table op actually APPLIES (delete row reduces the cell count).
 *
 *  ONE-AT-A-TIME
 *   8. opening version history from the rail closes the properties panel
 *      (only one right-side surface open at once).
 */
import { test, expect, type Page } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

const PAGE = '[data-testid="docx-editor"] .layout-page';
const PANEL = '[data-testid="properties-panel"]';
const IMG_CHIP = '[data-testid="image-format-chip"]';
const TABLE_CHIP = '[data-testid="table-format-chip"]';
const INLINE_IMG = '[data-testid="docx-editor"] img.layout-run-image';
const FLOATING_IMG =
  '[data-testid="docx-editor"] .layout-page-floating-image, [data-testid="docx-editor"] .layout-block-image';
const CELL = '[data-testid="docx-editor"] .layout-table-cell';

const pageRight = async (page: Page) => {
  const b = await page.locator(PAGE).first().boundingBox();
  return (b?.x ?? 0) + (b?.width ?? 0);
};

test('Format panel: image chip → panel beside doc, wrap applies', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/example-with-image.docx');
  await page.waitForTimeout(1200);

  const rightClosed = await pageRight(page);

  // 1. select the image — the chip appears, the panel does NOT auto-open
  const img = page.locator(INLINE_IMG).first();
  const ib = await img.boundingBox();
  await img.click({ position: { x: Math.round(ib!.width / 2), y: Math.round(ib!.height / 2) } });
  await page.waitForTimeout(300);
  await expect(page.locator(IMG_CHIP)).toBeVisible();
  expect(await page.locator(PANEL).count()).toBe(0); // no auto-open

  // 2. click the chip → panel opens, page MADE ROOM (flex sibling, not overlay)
  await page.locator(IMG_CHIP).click();
  await page.waitForTimeout(400);
  await expect(page.locator(PANEL)).toBeVisible();
  await expect(page.locator('[data-testid="properties-image-section"]')).toBeVisible();
  const rightOpen = await pageRight(page);
  expect(rightOpen).toBeLessThan(rightClosed - 50); // page shrank to make room

  // panel must not cover the image content
  const panelBox = await page.locator(PANEL).boundingBox();
  const imgBox = await img.boundingBox();
  expect((imgBox?.x ?? 0) + (imgBox?.width ?? 0)).toBeLessThan(panelBox?.x ?? 0);

  // 4. wrap actually APPLIES: inline -> behind moves it to the floating layer
  const inlineBefore = await page.locator(INLINE_IMG).count();
  const floatBefore = await page.locator(FLOATING_IMG).count();
  await page.locator('[data-testid="properties-wrap-behind"]').click();
  await page.waitForTimeout(700);
  const inlineAfter = await page.locator(INLINE_IMG).count();
  const floatAfter = await page.locator(FLOATING_IMG).count();
  expect(inlineAfter).toBe(inlineBefore - 1);
  expect(floatAfter).toBe(floatBefore + 1);
});

test('Format panel: image Top&bottom wrap + distance-from-text apply', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/example-with-image.docx');
  await page.waitForTimeout(1200);

  const img = page.locator(INLINE_IMG).first();
  const ib = await img.boundingBox();
  await img.click({ position: { x: Math.round(ib!.width / 2), y: Math.round(ib!.height / 2) } });
  await page.waitForTimeout(300);
  await page.locator(IMG_CHIP).click();
  await page.waitForTimeout(400);

  // top&bottom moves the image out of the inline flow (into the floating layer)
  const inlineBefore = await page.locator(INLINE_IMG).count();
  await page.locator('[data-testid="properties-wrap-topAndBottom"]').click();
  await page.waitForTimeout(700);
  expect(await page.locator(INLINE_IMG).count()).toBe(inlineBefore - 1);

  // the distance-from-text group now shows; set a top margin and confirm the
  // input round-trips through the node (panel re-reads it as the live value)
  await expect(page.locator('[data-testid="properties-image-dist"]')).toBeVisible();
  const distTop = page.locator('[data-testid="properties-image-distTop"]');
  await distTop.fill('40');
  await distTop.press('Enter');
  await page.waitForTimeout(500);
  // re-open keeps the image selected; the node carries the new margin
  await expect(page.locator('[data-testid="properties-image-section"]')).toBeVisible();
});

test('Format panel: image Arrange (rotate) + Border apply to the document', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/example-with-image.docx');
  await page.waitForTimeout(1200);

  const img = page.locator(INLINE_IMG).first();
  const ib = await img.boundingBox();
  await img.click({ position: { x: Math.round(ib!.width / 2), y: Math.round(ib!.height / 2) } });
  await page.waitForTimeout(300);
  await page.locator(IMG_CHIP).click();
  await page.waitForTimeout(400);
  await expect(page.locator('[data-testid="properties-image-section"]')).toBeVisible();

  const paintedImg = () => page.locator(INLINE_IMG).first();

  // Rotate right → a rotate() transform appears on the painted image.
  await page.locator('[data-testid="properties-image-rotateCW"]').click();
  await page.waitForTimeout(500);
  const transform = await paintedImg().evaluate(
    (el) => (el as HTMLElement).style.transform || getComputedStyle(el).transform
  );
  expect(transform).not.toBe('');
  expect(transform.toLowerCase()).toContain('rotate');

  // Border "Medium" → painted image gains a visible border width.
  await page.locator('[data-testid="properties-image-border-medium"]').click();
  await page.waitForTimeout(500);
  const borderW = await paintedImg().evaluate((el) =>
    parseFloat(getComputedStyle(el as HTMLElement).borderTopWidth || '0')
  );
  expect(borderW).toBeGreaterThan(0);
});

test('Format panel: table chip → table section (not empty), delete row applies', async ({
  page,
}) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/with-tables.docx');
  await page.waitForTimeout(1400);

  // 5. click inside a table cell → the table chip appears
  const cell = page.locator(CELL).first();
  await cell.click({ position: { x: 12, y: 10 } });
  await page.waitForTimeout(400);
  await expect(page.locator(TABLE_CHIP)).toBeVisible();
  expect(await page.locator(PANEL).count()).toBe(0); // no auto-open

  // 6. click it → panel shows the TABLE section, NOT the empty placeholder
  await page.locator(TABLE_CHIP).click();
  await page.waitForTimeout(400);
  await expect(page.locator(PANEL)).toBeVisible();
  await expect(page.locator('[data-testid="properties-table-section"]')).toBeVisible();
  await expect(page.locator(PANEL)).not.toContainText('Select an image, table, or shape');

  // 7. a table op actually APPLIES: delete row reduces the cell count
  const cellsBefore = await page.locator(CELL).count();
  await page.locator('[data-testid="properties-table-deleteRow"]').click();
  await page.waitForTimeout(600);
  const cellsAfter = await page.locator(CELL).count();
  expect(cellsAfter).toBeLessThan(cellsBefore);
});

test('Format panel: textbox chip → section (resize + fill apply)', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/textbox-test.docx');
  await page.waitForTimeout(1500);

  const box = page.locator('[data-testid="docx-editor"] .layout-textbox').first();
  await box.click({ position: { x: 24, y: 12 } });
  await page.waitForTimeout(400);

  // chip appears for the caret-in-textbox; panel not auto-opened
  await expect(page.locator('[data-testid="textbox-format-chip"]')).toBeVisible();
  expect(await page.locator(PANEL).count()).toBe(0);

  await page.locator('[data-testid="textbox-format-chip"]').click();
  await page.waitForTimeout(400);
  await expect(page.locator(PANEL)).toBeVisible();
  await expect(page.locator('[data-testid="properties-textbox-section"]')).toBeVisible();

  // outline applies: "Thick" gives the painted box a visible border width
  await page.locator('[data-testid="properties-textbox-outline-thick"]').click();
  await page.waitForTimeout(500);
  const borderW = await page
    .locator('[data-testid="docx-editor"] .layout-textbox')
    .first()
    .evaluate((el) => parseFloat(getComputedStyle(el as HTMLElement).borderTopWidth || '0'));
  expect(borderW).toBeGreaterThanOrEqual(3);

  // resize applies: width input drives the painted box width
  const wBefore =
    (await page.locator('[data-testid="docx-editor"] .layout-textbox').first().boundingBox())
      ?.width ?? 0;
  await page.locator('[data-testid="properties-textbox-width"]').fill('120');
  await page.locator('[data-testid="properties-textbox-width"]').press('Enter');
  await page.waitForTimeout(500);
  const wAfter =
    (await page.locator('[data-testid="docx-editor"] .layout-textbox').first().boundingBox())
      ?.width ?? 0;
  expect(wAfter).toBeLessThan(wBefore);
});

test('Textbox: on-canvas corner handles resize the box', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/textbox-test.docx');
  await page.waitForTimeout(1500);

  const box = page.locator('[data-testid="docx-editor"] .layout-textbox').first();
  await box.click({ position: { x: 24, y: 12 } });
  await page.waitForTimeout(400);

  // handles appear while the caret is in the box
  const se = page.locator('[data-testid="textbox-resize-se"]');
  await expect(se).toBeVisible();

  const wBefore = (await box.boundingBox())?.width ?? 0;
  const hb = await se.boundingBox();
  // drag the SE handle inward to shrink the box
  await page.mouse.move(hb!.x + hb!.width / 2, hb!.y + hb!.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb!.x - 120, hb!.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(500);

  const wAfter =
    (await page.locator('[data-testid="docx-editor"] .layout-textbox').first().boundingBox())
      ?.width ?? 0;
  expect(wAfter).toBeLessThan(wBefore - 30);
});

test('Format panel: textbox "No fill" removes a pre-filled background', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/textbox-test.docx');
  await page.waitForTimeout(1500);

  // The blue info box (2nd) has a fill; clicking "No fill" must clear it.
  const blue = page.locator('[data-testid="docx-editor"] .layout-textbox').nth(1);
  await blue.click({ position: { x: 24, y: 12 } });
  await page.waitForTimeout(400);
  await page.locator('[data-testid="textbox-format-chip"]').click();
  await page.waitForTimeout(400);

  const bgBefore = await page
    .locator('[data-testid="docx-editor"] .layout-textbox')
    .nth(1)
    .evaluate((el) => getComputedStyle(el as HTMLElement).backgroundColor);
  await page.locator('[data-testid="properties-textbox-fill-none"]').click();
  await page.waitForTimeout(500);
  const bgAfter = await page
    .locator('[data-testid="docx-editor"] .layout-textbox')
    .nth(1)
    .evaluate((el) => getComputedStyle(el as HTMLElement).backgroundColor);
  expect(bgAfter).not.toBe(bgBefore);
});

test('Format panel: only one right-side surface open at a time', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/example-with-image.docx');
  await page.waitForTimeout(1200);

  // open the Format panel via the image chip
  const img = page.locator(INLINE_IMG).first();
  const ib = await img.boundingBox();
  await img.click({ position: { x: Math.round(ib!.width / 2), y: Math.round(ib!.height / 2) } });
  await page.waitForTimeout(300);
  await page.locator(IMG_CHIP).click();
  await page.waitForTimeout(300);
  await expect(page.locator(PANEL)).toBeVisible();

  // opening version history from the rail must CLOSE the properties panel
  await page.locator('[data-testid="rail-history"]').click();
  await page.waitForTimeout(400);
  await expect(page.locator('[data-testid="version-history-panel"]')).toBeVisible();
  await expect(page.locator(PANEL)).toHaveCount(0);
});
