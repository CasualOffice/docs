/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * Decorative DrawingML shapes (the modern half of
 * `drawing-shapes-render`). Pre-fix: a `<w:drawing>` whose `<wps:wsp>`
 * had `<wps:spPr>` (geometry / fill / outline) but no `<wps:txbx>` was
 * dropped at `imageParser.ts:667` (`parseDrawing` returns null for
 * shapes the textbox path doesn't claim) and never resurfaced. Word's
 * "Insert → Shapes" output goes through this path.
 *
 * The fix mirrors the VML decorative branch: a sibling
 * `parseDecorativeDrawing` in `textBoxParser.ts` extracts size + fill +
 * outline + position from `<wps:spPr>`, and `textBoxEnricher.ts` runs
 * it after the text-frame check. The shape is emitted as a TextBox
 * with one empty paragraph so the existing renderer paints just the
 * box.
 *
 * Fixture has one 100×60 px green rectangle between two text
 * paragraphs. Assertions:
 *   1. Exactly one extra `.layout-textbox` element with the green fill.
 *   2. Both surrounding text paragraphs paint normally.
 */

test('DrawingML decorative shape (wps:wsp without wps:txbx) paints with its fill', async ({
  page,
}) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/drawingml-shape.docx');
  await page.waitForTimeout(500);

  const data = await page.evaluate(() => {
    const visible = (el: HTMLElement) => !el.closest('.paged-editor__hidden-pm');
    const textBoxes = Array.from(document.querySelectorAll<HTMLElement>('.layout-textbox')).filter(
      visible
    );
    // A shape-only drawing must NOT also emit an image run — that produced a
    // spurious empty-src <img> (broken-image icon) next to the painted shape.
    const emptyImgs = Array.from(document.querySelectorAll<HTMLImageElement>('img'))
      .filter(visible)
      .filter((img) => !(img.getAttribute('src') || '').trim());
    return {
      count: textBoxes.length,
      bgs: textBoxes.map((el) => el.style.backgroundColor),
      emptyImgCount: emptyImgs.length,
      bodyText: (document.querySelector('.paged-editor__pages') as HTMLElement)?.innerText ?? '',
    };
  });

  expect(data.count, 'one painted shape container for the wps:wsp').toBe(1);
  const bg = data.bgs[0]?.toLowerCase() ?? '';
  // Chromium normalizes #00C000 to rgb(0, 192, 0).
  expect(bg === '#00c000' || bg === 'rgb(0, 192, 0)').toBe(true);
  expect(data.emptyImgCount, 'no spurious empty-src image for the shape').toBe(0);
  expect(data.bodyText).toContain('BEFORE-SHAPE');
  expect(data.bodyText).toContain('AFTER-SHAPE');
});
