/**
 * Complex header (SDS letterhead with many positioned shapes) edit mode.
 *
 * Before: double-clicking such a header dropped the user into a transparent
 * inline editor, so the grayed BODY content behind the (tall) overlay bled
 * through and the header read as "broken / overlapping". Fix: the inline
 * header/footer editor now paints an opaque page-colored background, masking
 * the body region it covers. The positioned boxes stack in flow (editable, not
 * pixel-positioned — the accepted bounded trade-off).
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

const HEADER = '[data-testid="docx-editor"] .layout-page-header';

test('complex SDS header edit overlay is opaque (no body bleed-through)', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/sds-real-world.docx');
  await page.waitForTimeout(1500);

  const box = await page.locator(HEADER).first().boundingBox();
  await page.mouse.dblclick(box!.x + 40, box!.y + 14);
  await page.waitForTimeout(800);

  const pm = page.locator('[data-testid="docx-editor"] .hf-editor-pm');
  await expect(pm).toBeVisible();

  // The editor area must have an opaque (non-transparent) background so the
  // body doesn't show through. Transparent would be rgba(...0) / 'transparent'.
  const bg = await pm.evaluate((el) => getComputedStyle(el as HTMLElement).backgroundColor);
  const transparent = bg === 'transparent' || /,\s*0\)\s*$/.test(bg);
  expect(transparent, `header editor background should be opaque, got "${bg}"`).toBe(false);
});
