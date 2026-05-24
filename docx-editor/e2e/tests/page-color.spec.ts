/**
 * Pins the "page color" path — doc-level `<w:background>` (OOXML
 * §17.2.1) parses → renders as the page surface color → round-trips
 * on save. Word + Google Docs both surface this as "Page color" in
 * their Page Setup UI.
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

const FIXTURE = 'fixtures/page-color.docx';
const EXPECTED_BG = 'rgb(200, 230, 255)'; // #C8E6FF

test('doc-level <w:background> renders as the page background color', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile(FIXTURE);
  await page.waitForSelector('[data-page-number]');
  await page.waitForTimeout(400);

  const bgs = await page.evaluate(() => {
    const pages = Array.from(document.querySelectorAll('[data-page-number]'));
    return pages.map((p) => getComputedStyle(p as HTMLElement).backgroundColor);
  });
  expect(bgs.length).toBeGreaterThan(0);
  for (const bg of bgs) {
    expect(bg).toBe(EXPECTED_BG);
  }
});
