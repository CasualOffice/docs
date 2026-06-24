/**
 * Pins the `<DocxEditor wordCompat>` React-prop surface for the
 * firstRow-only closing-border heuristic (#395).
 *
 * The vite example reads `?wordCompat=1` from the URL and forwards
 * it to `<DocxEditor wordCompat>`, which threads through
 * `PagedEditor.wordCompat` → `RenderPageOptions.wordCompat` →
 * `RenderContext.wordCompat` → the renderer's per-cell
 * `wordCompatClosingBorders` lookup.
 *
 * The fixture (`word-compat-closing-border.docx`) is a 3-row table
 * where ONLY the first row has a bottom border declared (per the
 * gap-row scenario). With the prop off, the LAST-* row's cells have
 * no bottom border. With the prop on, those cells inherit the
 * firstRow bottom.
 */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

const FIXTURE = 'fixtures/word-compat-closing-border.docx';

async function loadAt(page: Page, wordCompatOn: boolean) {
  const editor = new EditorPage(page);
  const url = wordCompatOn ? '/?e2e=1&wordCompat=1' : '/?e2e=1';
  await page.goto(url);
  await page.waitForSelector('[data-testid="docx-editor"]');
  await page.waitForTimeout(500);
  await editor.loadDocxFile(FIXTURE);
  await page.waitForSelector('.layout-table');
  await page.waitForTimeout(500);
}

/** Read the bottom-border-width on every cell of the LAST body row. */
async function lastRowBottoms(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.layout-table-row'));
    const last = rows[rows.length - 1];
    if (!last) return [];
    return Array.from(last.querySelectorAll('.layout-table-cell')).map((c) => {
      const cs = getComputedStyle(c as HTMLElement);
      return parseFloat(cs.borderBottomWidth) || 0;
    });
  });
}

test.describe('wordCompat React prop — firstRow closing-border heuristic', () => {
  test('default (prop omitted): LAST row cells have no bottom border', async ({ page }) => {
    await loadAt(page, false);
    const bottoms = await lastRowBottoms(page);
    expect(bottoms.length).toBeGreaterThan(0);
    for (const w of bottoms) {
      expect(w).toBeLessThanOrEqual(0.5); // accept subpixel anti-alias noise
    }
  });

  test('wordCompat=true: LAST row cells inherit firstRow bottom border', async ({ page }) => {
    await loadAt(page, true);
    const bottoms = await lastRowBottoms(page);
    expect(bottoms.length).toBeGreaterThan(0);
    // The fixture's firstRow declares <w:bottom w:sz="8"> ≈ 1 px in
    // OOXML half-points. Painter rounds to ≥ 1 css px after the
    // conversion. Each LAST cell should pick that up.
    for (const w of bottoms) {
      expect(w).toBeGreaterThanOrEqual(0.5);
    }
  });
});
