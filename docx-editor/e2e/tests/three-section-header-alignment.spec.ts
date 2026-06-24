import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * Pins openspec `header-footer-rendering` Problem #2 — "Alignment
 * distortion": Word's 3-section header layout uses tab stops
 *   - `center` tab at the content-area midpoint
 *   - `right`  tab at the content-area right edge
 * to lay out `LEFT[tab]CENTER[tab]RIGHT` so the three texts land at
 * left, center, and right of the page text area.
 *
 * The fixture (`three-section-header.docx`) is hand-built by
 * `scripts/make-three-section-header-fixture.mjs` with US Letter
 * portrait, 1-inch left/right margins → 9360-twip content width, center
 * tab at 4680 twips, right tab at 9360 twips.
 *
 * We let the visible painter render and then assert each text's
 * bounding-rect midpoint lands close enough to the expected position
 * relative to the header content area.
 */

test.describe('3-section header tab-stop alignment', () => {
  test('LEFT, CENTER, RIGHT land at left / midpoint / right of header content', async ({
    page,
  }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.loadDocxFile('fixtures/three-section-header.docx');
    // A fixed sleep races layout + font-loading on slow CI, skewing the
    // bounding-rect measurements below. Instead wait until the visible
    // header has painted all three canary words, then for fonts to settle
    // so glyph metrics are final.
    await page.waitForFunction(
      () => {
        const header = Array.from(
          document.querySelectorAll<HTMLElement>(
            '[class*="layout-page-header"], .layout-page-header'
          )
        ).find((el) => !el.closest('.paged-editor__hidden-pm'));
        if (!header) return false;
        const found = new Set(
          Array.from(header.querySelectorAll('*'))
            .map((el) => el.textContent?.trim())
            .filter((t) => t === 'LEFT' || t === 'CENTER' || t === 'RIGHT')
        );
        return found.size === 3;
      },
      undefined,
      { timeout: 10000 }
    );
    await page.evaluate(async () => {
      await (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts?.ready;
    });

    const data = await page.evaluate(() => {
      // Find the visible (not hidden-PM) header element.
      const headers = Array.from(
        document.querySelectorAll<HTMLElement>('[class*="layout-page-header"], .layout-page-header')
      ).filter((el) => !el.closest('.paged-editor__hidden-pm'));
      if (headers.length === 0) {
        return { error: 'no visible header element' as const };
      }
      const header = headers[0];
      const headerRect = header.getBoundingClientRect();

      // Collect text spans inside the header that contain one of the
      // canary words.
      const spans = Array.from(header.querySelectorAll<HTMLElement>('*')).filter((el) => {
        const t = el.textContent?.trim();
        return t === 'LEFT' || t === 'CENTER' || t === 'RIGHT';
      });
      const byLabel: Record<string, { left: number; right: number; mid: number } | undefined> = {};
      for (const span of spans) {
        const r = span.getBoundingClientRect();
        byLabel[span.textContent!.trim()] = {
          left: r.left - headerRect.left,
          right: r.right - headerRect.left,
          mid: (r.left + r.right) / 2 - headerRect.left,
        };
      }
      return {
        headerWidth: headerRect.width,
        labels: byLabel,
      };
    });

    if ('error' in data) throw new Error(data.error);

    expect(data.labels.LEFT, 'LEFT span').toBeTruthy();
    expect(data.labels.CENTER, 'CENTER span').toBeTruthy();
    expect(data.labels.RIGHT, 'RIGHT span').toBeTruthy();
    expect(data.headerWidth).toBeGreaterThan(400);

    const W = data.headerWidth;
    const TOLERANCE = 12; // pixels — generous for cross-platform font metrics

    // LEFT should start at the left edge.
    expect(data.labels.LEFT!.left).toBeLessThan(TOLERANCE);

    // CENTER's midpoint should land at the content midpoint.
    expect(Math.abs(data.labels.CENTER!.mid - W / 2)).toBeLessThan(TOLERANCE);

    // RIGHT should end at the right edge.
    expect(W - data.labels.RIGHT!.right).toBeLessThan(TOLERANCE);
  });
});
