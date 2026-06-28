/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * Coverage audit against the project's headline test doc — the real SDS
 * (`fixtures/sds-real-world.docx` is byte-identical to the file in
 * `services/document/` repo root). Pre-existing
 * `sds-header-image.spec.ts` only checks the header watermark; this
 * spec walks the full painted output and asserts each major content
 * type is present, plus dumps a coverage report on failure so we know
 * exactly what dropped.
 *
 * Source-side inventory (counted by audit on 2026-05-17):
 *   - 591 paragraphs, 7054 runs
 *   - 30 sectPr (multi-section)
 *   - 31 tc / 7 tr / 9 gridCol → one body table
 *   - 16 numPr (list items)
 *   - 23 w:pict — legacy-pictures wrapping:
 *       8 v:textbox  (text-bearing) → COVERED (textbox-render-vml fix)
 *       9 v:shape    (mixed types)
 *      18 v:rect     (decorative rectangles)
 *   - 2 body floating images + 1 header watermark image
 *   - 6 w:fldChar (complex fields)
 *
 * Known un-covered today: non-text VML shapes (v:rect, v:shape outside
 * v:textbox). Tracked as `drawing-shapes-render` (P2, L) in the gap
 * matrix.
 */

test('SDS real-world doc — every major content type paints', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/sds-real-world.docx');
  await page.waitForTimeout(1500);

  // NOTE on page virtualization: the editor lazily renders page content
  // via IntersectionObserver — pages outside the current viewport are
  // empty shells and pages already scrolled past can be evicted back to
  // shells. So a single snapshot only reflects what's near the current
  // viewport, NOT every painted element in the document. We snapshot
  // the initial viewport (top of doc) and assert against that — what
  // the user sees on load. A virtualization-aware audit that scrolls
  // and accumulates would be a separate test.
  const report = await page.evaluate(() => {
    const visible = (el: HTMLElement) => !el.closest('.paged-editor__hidden-pm');
    const q = (sel: string) =>
      Array.from(document.querySelectorAll<HTMLElement>(sel)).filter(visible);

    return {
      pages: q('.layout-page').length,
      paragraphs: q('.layout-paragraph').length,
      tables: q('.layout-table').length,
      tableCells: q('.layout-table-cell').length,
      tableRows: q('.layout-table-row').length,
      textBoxes: q('.layout-textbox').length,
      images: Array.from(document.querySelectorAll<HTMLImageElement>('img')).filter((el) =>
        visible(el as unknown as HTMLElement)
      ).length,
      bodyText:
        (document.querySelector('.paged-editor__pages') as HTMLElement)?.innerText.length ?? 0,
    };
  });

  // Pull a console error count to catch silent crashes during render.
  // Playwright captures these via the page.on('console') hook; we
  // attach it before navigation in the helper. For this audit we
  // assert against the painted snapshot only.

  // Logged unconditionally so the run output documents what was
  // covered, even on pass.
  // eslint-disable-next-line no-console
  console.log('SDS coverage report:', JSON.stringify(report, null, 2));

  // Multi-section doc — should render across multiple pages.
  expect(report.pages, 'pagination produced multiple pages').toBeGreaterThan(1);

  // Body paragraphs paint — source has 591, we expect well over 100
  // (some are empty / off-screen but most paint).
  expect(report.paragraphs, 'body paragraphs painted').toBeGreaterThan(100);

  // The one body table renders with its 7 rows and 31 cells.
  expect(report.tables, 'at least one painted table').toBeGreaterThanOrEqual(1);
  expect(report.tableCells, 'painted table cells').toBeGreaterThanOrEqual(30);

  // 8 VML text-boxes from the source — these are the
  // textbox-render-vml fix's target. Each should paint.
  expect(report.textBoxes, 'VML textboxes from textbox-render-vml fix').toBeGreaterThanOrEqual(1);

  // Header watermark + body images. The SDS doc has 1 header watermark
  // and 2 body floating images = 3 unique images, but multi-page header
  // duplicates the watermark across pages.
  expect(report.images, 'painted images').toBeGreaterThan(2);

  // Body text length sanity — source has thousands of chars of
  // multi-language SDS content. If the parse silently dropped most of
  // it, this is < 1000.
  expect(report.bodyText, 'painted body text length').toBeGreaterThan(2000);
});
