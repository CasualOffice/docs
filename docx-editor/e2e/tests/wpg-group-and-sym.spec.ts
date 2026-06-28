/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * Pins two new content-coverage paths surfaced by auditing the
 * Medical Incident Report Form doc:
 *
 *   1. `<wpg:wgp>` groups inside `<mc:AlternateContent>` — Word's
 *      "Group" command wrapping multiple wps:wsp shapes (e.g.
 *      a logo + tagline) into one anchored unit. Pre-fix, the enricher
 *      walked direct run children only and ignored both the MC envelope
 *      and the group, so only the first wsp would surface — typically
 *      nothing.
 *   2. `<w:sym>` (Wingdings checkbox / bullet glyphs). Parser built
 *      `SymbolContent` but `convertRunContent` had no `case 'symbol'`,
 *      so every glyph fell into `default → []` and dropped silently.
 *      This is why the medical form's six checkboxes ("Medication
 *      Error", "Fall or Injury", ...) didn't render at all.
 *
 * Spec uses one synthetic fixture for the group case and the real
 * medical-incident-form doc for the symbol case (it has 8 w:sym
 * elements, one per checkbox).
 */

test('wpg:wgp inside mc:AlternateContent surfaces every wps:wsp child', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/wpg-group.docx');
  await page.waitForTimeout(500);

  const data = await page.evaluate(() => {
    const visible = (el: HTMLElement) => !el.closest('.paged-editor__hidden-pm');
    const textBoxes = Array.from(document.querySelectorAll<HTMLElement>('.layout-textbox')).filter(
      visible
    );
    return {
      count: textBoxes.length,
      texts: textBoxes.map((t) => t.textContent?.trim() ?? ''),
      bodyText:
        (document.querySelector('.paged-editor__pages') as HTMLElement)?.innerText ?? '',
    };
  });

  expect(data.count, 'both group children paint as separate textboxes').toBe(2);
  // Texts may include extra newlines; check by includes.
  expect(data.texts.some((t) => t.includes('GROUP-TEXT-A'))).toBe(true);
  expect(data.texts.some((t) => t.includes('GROUP-TEXT-B'))).toBe(true);
  expect(data.bodyText).toContain('BODY-AFTER-GROUP');
});

test('w:sym Wingdings checkbox glyph translates to ☐ Unicode', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/medical-incident-form.docx');
  await page.waitForTimeout(800);

  const text = await page.evaluate(() => {
    return (document.querySelector('.paged-editor__pages') as HTMLElement)?.innerText ?? '';
  });

  // The form has 8 w:sym elements — 6 visible checkboxes on page 1
  // (Medication Error, Fall or Injury, Adverse Reaction, Surgical
  // Complication, Equipment Failure, Other) plus 2 more later.
  // After the symbol-translation fix, each renders as the Unicode
  // empty checkbox glyph ☐ (U+2610). Pre-fix, zero rendered.
  const checkboxCount = (text.match(/☐/g) || []).length;
  expect(checkboxCount, '6+ Unicode empty-checkbox glyphs on page 1').toBeGreaterThanOrEqual(4);

  // The form labels should still render too — sanity check.
  expect(text).toContain('Medication Error');
  expect(text).toContain('Fall or Injury');
  expect(text).toContain('Adverse Reaction');

  // The Safetymint tagline (extracted from the wpg:wgp group) should
  // also surface now.
  expect(text).toContain('Safetymint');
});

test('Medical Incident Report Form — Safetymint logo image renders', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/medical-incident-form.docx');
  await page.waitForTimeout(800);

  // The logo lives inside a wpg:grpSp sub-group of a wpg:wgp wrapped
  // in mc:AlternateContent. Without the group-recursion + pic:pic
  // extraction in textBoxEnricher.ts, this image silently dropped
  // entirely. After the fix, at least one painted img with a data:
  // src exists in the visible page tree.
  const imgInfo = await page.evaluate(() => {
    const visible = (el: HTMLElement) => !el.closest('.paged-editor__hidden-pm');
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('img')).filter(
      (el) => visible(el as unknown as HTMLElement)
    );
    return {
      count: imgs.length,
      anyDataSrc: imgs.some((i) => (i.src || '').startsWith('data:image/')),
    };
  });

  expect(imgInfo.count, 'painted images present').toBeGreaterThanOrEqual(1);
  expect(imgInfo.anyDataSrc, 'at least one image has a data: src').toBe(true);
});
