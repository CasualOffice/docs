/**
 * Regression: the version-preview banner ("Viewing <name> … / Restore this
 * version") must stay pinned to the viewport while the previewed document
 * scrolls. It used to live inside the document-height scroll content, so the
 * banner — the only cue you were on a past version — scrolled away entirely.
 * It's now portaled into a viewport-height column wrapping the scroll area.
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

test.describe('Version preview — pinned banner', () => {
  test('banner stays put while the preview scrolls, panel stays visible', async ({ page }) => {
    test.setTimeout(60_000);
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();

    // Enough content that the preview scrolls.
    for (let i = 0; i < 14; i++) {
      await editor.typeText(`Paragraph ${i} with filler text long enough to scroll. `);
      await editor.pressEnter();
    }
    await page.waitForTimeout(2200);

    await page.getByRole('button', { name: 'Version history' }).click();
    await page.waitForSelector('[data-testid="version-history-panel"]');
    await editor.saveNamedVersion('v1');
    await page.waitForSelector('[data-testid="version-history-version-row"]');

    await editor.focus();
    await editor.typeText('More edits. ');
    await editor.saveNamedVersion('v2');
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="version-history-version-row"]').length >= 2
    );

    await page.locator('[data-testid="version-history-version-row"]').first().click();
    await page.waitForSelector('[data-testid="version-preview-overlay"]');
    await page.waitForTimeout(400);

    const back = page.getByTestId('version-preview-back');
    const before = await back.boundingBox();

    // The version list panel stays visible beside the preview (not covered).
    await expect(page.getByTestId('version-history-panel')).toBeVisible();

    await page.mouse.move(400, 400);
    await page.mouse.wheel(0, 1400);
    await page.waitForTimeout(400);

    const after = await back.boundingBox();
    expect(Math.abs((before?.y ?? 0) - (after?.y ?? -1))).toBeLessThan(2);
  });
});
