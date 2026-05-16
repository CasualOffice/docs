import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * Decorative VML shapes — openspec `drawing-shapes-render` foundation.
 *
 * Pre-fix, a `<w:pict>` containing a `<v:rect>` (no inner text) was
 * silently dropped: the parser's textbox path required a `<v:textbox>`
 * child, and there was no other route for decorative shapes. Common in
 * SDS-style docs that use thin filled rectangles as page dividers.
 *
 * The fix parses `<v:rect>` / `<v:oval>` / `<v:line>` as `TextBox`-
 * shaped records with a single empty paragraph as content (PM textBox
 * schema requires `(paragraph | table)+`) and the rect's fill +
 * outline + position. The existing `renderTextBoxFragment` paints the
 * box from those fields regardless of inner text.
 *
 * Fixture has one 200pt × 4pt red rectangle between two text
 * paragraphs. Assertions:
 *   1. The painted DOM contains exactly one extra `.layout-textbox`
 *      element with a red background.
 *   2. Both surrounding text paragraphs paint normally.
 *
 * Coverage gain on the SDS reference doc: initial-viewport textbox
 * count went 1 → 7 after this change.
 */

test('VML decorative rectangle (v:rect) paints with its fill color', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/vml-rect.docx');
  await page.waitForTimeout(500);

  const data = await page.evaluate(() => {
    const visible = (el: HTMLElement) => !el.closest('.paged-editor__hidden-pm');
    const textBoxes = Array.from(document.querySelectorAll<HTMLElement>('.layout-textbox')).filter(
      visible
    );
    return {
      count: textBoxes.length,
      bgs: textBoxes.map((el) => el.style.backgroundColor),
      bodyText:
        (document.querySelector('.paged-editor__pages') as HTMLElement)?.innerText ?? '',
    };
  });

  expect(data.count, 'one painted textbox container for the v:rect').toBe(1);
  // Browsers normalize CSS colors to rgb() — the painter writes "#FF0000"
  // and Chromium reports it as "rgb(255, 0, 0)". Accept either.
  const bg = data.bgs[0]?.toLowerCase() ?? '';
  expect(bg === '#ff0000' || bg === 'rgb(255, 0, 0)').toBe(true);
  expect(data.bodyText).toContain('BEFORE-RECT');
  expect(data.bodyText).toContain('AFTER-RECT');
});
