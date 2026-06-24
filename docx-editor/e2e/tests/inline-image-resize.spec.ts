/**
 * Inline image resize — guard. Selecting an inline image shows the
 * selection overlay with 4 corner handles; dragging one resizes it.
 * (The audit claimed inline images had no resize UI; empirically they
 * do — pinned so it stays working.)
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

test('selecting an inline image shows resize handles and dragging resizes it', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/example-with-image.docx');
  await page.waitForTimeout(1200);

  const img = page.locator('[data-testid="docx-editor"] img.layout-run-image').first();
  const b0 = await img.boundingBox();
  if (!b0) throw new Error('no image');

  await img.click({ position: { x: Math.round(b0.width / 2), y: Math.round(b0.height / 2) } });
  await page.waitForTimeout(400);

  // 4 corner handles present
  await expect(page.locator('[data-handle]')).toHaveCount(4);

  // Drag the SE handle inward → image shrinks.
  const hb = await page.locator('[data-handle="se"]').first().boundingBox();
  if (!hb) throw new Error('no handle');
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x - 80, hb.y - 80, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(500);

  const b1 = await img.boundingBox();
  expect(Math.abs((b1?.width ?? 0) - b0.width)).toBeGreaterThan(20);
});
