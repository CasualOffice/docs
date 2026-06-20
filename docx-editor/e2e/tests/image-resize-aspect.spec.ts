/**
 * Floating-image resize preserves aspect ratio (no distortion).
 *
 * Regression for "resizing the logo stretched it height-wise": the floating
 * image painter set the image's explicit width but never overrode the global
 * `img { max-width: 100% }` reset, so enlarging a wide image capped its width
 * to the container while the height grew freely — squishing it vertically under
 * `object-fit`. Shrinking happened to stay within the cap, so only enlarging
 * distorted.
 *
 * Fixture: `medical-incident-form.docx` — the Safetymint logo is a wide (~4:1)
 * `inFront` floating image.
 */
import { test, expect, type Page } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

const FIXTURE = 'fixtures/medical-incident-form.docx';

async function loadFixture(page: Page) {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await page.locator('input[type="file"][accept*=".docx"]').setInputFiles(`e2e/${FIXTURE}`);
  await page.waitForSelector('.paged-editor__pages');
  await page.waitForSelector('[data-page-number]');
  await page.waitForTimeout(1500);
}

test.describe('Floating image resize', () => {
  test('enlarging a wide logo keeps its aspect ratio', async ({ page }) => {
    await loadFixture(page);

    const img = page.locator('.layout-page img').first();
    const before = await img.boundingBox();
    expect(before).not.toBeNull();
    if (!before) return;
    const ratioBefore = before.width / before.height;

    // Select, then drag the SE corner outward to enlarge.
    await page.mouse.click(before.x + before.width / 2, before.y + before.height / 2);
    await page.waitForTimeout(200);
    const cx = before.x + before.width;
    const cy = before.y + before.height;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 60, cy + 20, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    const after = await img.boundingBox();
    expect(after).not.toBeNull();
    if (!after) return;
    const ratioAfter = after.width / after.height;

    // It must have grown...
    expect(after.width).toBeGreaterThan(before.width);
    // ...and kept its aspect ratio (no vertical stretch).
    expect(Math.abs(ratioAfter - ratioBefore)).toBeLessThan(0.15);
  });
});
