/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * `<a:hlinkClick>` on a DrawingML picture — openspec
 * `ooxml-feature-gaps`. ECMA-376 §20.1.2.3.5: a picture's `pic:cNvPr`
 * may carry `<a:hlinkClick r:id="..."/>` and the renderer should make
 * the rendered image clickable.
 *
 * Pre-fix: the parser stored `hlinkHref` on the `Image` model, the
 * PM image node carried it through, but `toFlowBlocks.ts` dropped it
 * when building the layout-engine `ImageRun`, so the painter's
 * `renderInlineImageRun` / `renderBlockImage` never saw it and the
 * rendered `<img>` had no parent anchor.
 *
 * The fix:
 *   - Added `hlinkHref?: string` to `ImageRun`.
 *   - Threaded it through `toFlowBlocks.ts`.
 *   - Wrapped the `<img>` in a `target="_blank"` anchor in both
 *     `renderInlineImageRun` and `renderBlockImage`.
 *
 * Test: load a fixture with an inline image carrying an external
 * `hlinkClick`, assert the rendered image has a clickable anchor
 * with the right href.
 */

test('clickable inline image (a:hlinkClick) renders inside an anchor with the right href', async ({
  page,
}) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/image-hyperlink.docx');
  await page.waitForTimeout(500);

  const data = await page.evaluate(() => {
    const pages = Array.from(document.querySelectorAll<HTMLElement>('.layout-page')).filter(
      (el) => !el.closest('.paged-editor__hidden-pm')
    );
    for (const pageEl of pages) {
      const imgs = Array.from(pageEl.querySelectorAll<HTMLImageElement>('img'));
      for (const img of imgs) {
        const anchor = img.closest('a');
        if (anchor) {
          return {
            href: anchor.href,
            target: anchor.target,
            rel: anchor.rel,
            imgInsideAnchor: true,
          };
        }
      }
    }
    return { imgInsideAnchor: false } as const;
  });

  expect(data.imgInsideAnchor).toBe(true);
  expect(data.href).toBe('https://example.com/clicked-image');
  expect(data.target).toBe('_blank');
  // `rel="noopener noreferrer"` is the security default for cross-origin
  // target=_blank links — protects the host page from window.opener abuse.
  expect(data.rel).toContain('noopener');
  expect(data.rel).toContain('noreferrer');
});
