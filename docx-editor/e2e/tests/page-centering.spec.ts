/**
 * The page (and its rulers) center in the full window at every width that fits
 * it — Google-Docs style. Previously the outline-button reserved a symmetric
 * left "lane", so at medium widths the page was pushed into that lane and the
 * vertical ruler jammed against the window's left corner instead of sitting
 * just-left of a centered page. (User-reported; the #16 ruler item.)
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

async function pageLeftAt(page: import('@playwright/test').Page, vw: number) {
  await page.setViewportSize({ width: vw, height: 900 });
  await page.waitForTimeout(500);
  return page.evaluate(() => {
    const pg = document.querySelector('.layout-page') as HTMLElement | null;
    if (!pg) return null;
    const r = pg.getBoundingClientRect();
    return { left: Math.round(r.left), width: Math.round(r.width), vw: window.innerWidth };
  });
}

test('the page centers in the window at medium widths (no left-corner lane)', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/demo.docx');
  await page.waitForTimeout(800);

  // At a medium width where the page still fits, it must be centered — not held
  // in a left lane. Tolerance covers the ~20px ruler gutter + rounding.
  for (const vw of [1000, 1200]) {
    const m = await pageLeftAt(page, vw);
    expect(m, `measurable at ${vw}`).not.toBeNull();
    const expectedCenter = Math.round((m!.vw - m!.width) / 2);
    expect(
      Math.abs(m!.left - expectedCenter),
      `page should be centered at vw=${vw} (left=${m!.left}, expected≈${expectedCenter})`
    ).toBeLessThanOrEqual(22);
  }
});
