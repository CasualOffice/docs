/**
 * Regression: the vertical ruler must sit immediately to the left of the
 * page, not floating against the content area's far-left edge.
 *
 * It used to render at `left: 0` of the editor content area while the page
 * is centered ~265px to the right, leaving the ruler orphaned in the gutter
 * and its margin markers meaningless. It now hangs off the page's left edge
 * (Google Docs style) and stays a draggable margin control.
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

test.describe('Vertical ruler — sits beside the page and stays draggable', () => {
  test('ruler hugs the page left edge and its margin marker drags content', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.loadDocxFile('fixtures/example-with-image.docx');
    await page.waitForSelector('.layout-page', { timeout: 30000 });

    const ruler = page.locator('.docx-vertical-ruler').first();
    await expect(ruler).toBeVisible();

    const rb = await ruler.boundingBox();
    const pb = await page.locator('.layout-page').first().boundingBox();
    if (!rb || !pb) throw new Error('ruler/page box not measurable');

    // Ruler is just left of the page (small gap), not stranded in the gutter.
    const gap = pb.x - (rb.x + rb.width);
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThan(24);
    // Top-aligned with the page.
    expect(Math.abs(rb.y - pb.y)).toBeLessThan(4);

    // The top-margin marker still drags and pushes content down.
    const heading = page.locator('.layout-page').first().getByText('Example').first();
    const before = await heading.boundingBox();
    const marker = page.locator('.docx-ruler-marker-topMargin').first();
    const mb = await marker.boundingBox();
    if (!before || !mb) throw new Error('heading/marker box not measurable');

    await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2);
    await page.mouse.down();
    await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2 + 50, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(600);

    const after = await heading.boundingBox();
    if (!after) throw new Error('heading box not measurable after drag');
    expect(after.y).toBeGreaterThan(before.y + 20);
  });

  test('stays aligned with the page top across zoom levels', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.loadDocxFile('fixtures/example-with-image.docx');
    await page.waitForSelector('.layout-page', { timeout: 30000 });

    const measure = async () => {
      const rb = await page.locator('.docx-vertical-ruler').first().boundingBox();
      const pb = await page.locator('.layout-page').first().boundingBox();
      if (!rb || !pb) throw new Error('ruler/page box not measurable');
      return { gap: pb.x - (rb.x + rb.width), topDelta: rb.y - pb.y };
    };
    const setZoom = async (label: string) => {
      await page.locator('[aria-label^="Zoom:"]').first().click();
      await page.getByRole('option', { name: label }).first().click();
      await page.waitForTimeout(500);
    };

    // The page's top padding and width both scale with zoom; the ruler must
    // track both, so the gap and the top alignment stay constant.
    for (const z of ['50%', '200%', '75%', '100%']) {
      await setZoom(z);
      const { gap, topDelta } = await measure();
      expect(gap, `gap at ${z}`).toBeGreaterThanOrEqual(0);
      expect(gap, `gap at ${z}`).toBeLessThan(24);
      expect(Math.abs(topDelta), `top alignment at ${z}`).toBeLessThan(6);
    }
  });
});
