/**
 * Verifies the `table-overlap-text` gap-matrix row: a tall table
 * followed by a paragraph must not visually overlap, and the
 * paragraph must not push to a brand-new page when there's space
 * available right after the table.
 *
 * The fixture is built by scripts/make-table-overlap-fixture.mjs —
 * two consecutive tables (30 rows + 20 rows) with marker
 * paragraphs after each, designed to land near and across page
 * boundaries on Letter-sized pages.
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

const FIXTURE = 'fixtures/table-overlap.docx';

test.describe('Table → paragraph layout', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.loadDocxFile(FIXTURE);
    await page.waitForSelector('.paged-editor__pages [data-pm-start]');
    await page.waitForTimeout(800);
  });

  test('paragraph after a tall table renders below the table (no overlap)', async ({
    page,
  }) => {
    // Find the last table rendered and the POST-T1-MARKER paragraph.
    // The painter stamps `.layout-table` and `.layout-paragraph`
    // with their own `data-pm-start`. We just take the first table
    // and the first paragraph that contains the marker text.
    const tableBottom = await page.evaluate(() => {
      const tables = Array.from(document.querySelectorAll('.layout-table'));
      const first = tables[0];
      if (!first) return null;
      // For a paginated table, the bottom is the bottom of its LAST
      // rendered fragment. Find the table whose data-block-id matches
      // and take the max bottom across all fragments.
      const blockId = (first as HTMLElement).dataset.blockId;
      if (!blockId) return null;
      const frags = Array.from(
        document.querySelectorAll(`.layout-table[data-block-id="${blockId}"]`)
      );
      let bottom = -Infinity;
      for (const f of frags) {
        const r = (f as HTMLElement).getBoundingClientRect();
        if (r.bottom > bottom) bottom = r.bottom;
      }
      return bottom === -Infinity ? null : bottom;
    });

    const markerTop = await page.evaluate(() => {
      const paragraphs = Array.from(document.querySelectorAll('.layout-paragraph'));
      const marker = paragraphs.find((p) => p.textContent?.includes('POST-T1-MARKER'));
      if (!marker) return null;
      return (marker as HTMLElement).getBoundingClientRect().top;
    });

    expect(tableBottom, 'table bottom should be measurable').not.toBeNull();
    expect(markerTop, 'POST-T1-MARKER paragraph should be rendered').not.toBeNull();
    // The bug: marker.top < table.bottom (paragraph rendered over the table).
    // Healthy: marker.top >= table.bottom (paragraph rendered below).
    expect(markerTop!).toBeGreaterThanOrEqual(tableBottom! - 1);
  });

  test('paragraph after second table is also below it (multi-table run)', async ({
    page,
  }) => {
    const data = await page.evaluate(() => {
      const allTables = Array.from(document.querySelectorAll('.layout-table'));
      // Two distinct block IDs in the fixture; sort descending so we
      // get the second/later table.
      const ids = Array.from(new Set(allTables.map((t) => (t as HTMLElement).dataset.blockId)));
      const secondId = ids[1];
      if (!secondId) return { tableBottom: null, markerTop: null };
      const frags = Array.from(
        document.querySelectorAll(`.layout-table[data-block-id="${secondId}"]`)
      );
      let tableBottom = -Infinity;
      for (const f of frags) {
        const r = (f as HTMLElement).getBoundingClientRect();
        if (r.bottom > tableBottom) tableBottom = r.bottom;
      }

      const paragraphs = Array.from(document.querySelectorAll('.layout-paragraph'));
      const marker = paragraphs.find((p) => p.textContent?.includes('POST-T2-MARKER'));
      const markerTop = marker
        ? (marker as HTMLElement).getBoundingClientRect().top
        : null;

      return {
        tableBottom: tableBottom === -Infinity ? null : tableBottom,
        markerTop,
      };
    });

    expect(data.tableBottom, 'second table bottom should be measurable').not.toBeNull();
    expect(data.markerTop, 'POST-T2-MARKER paragraph should be rendered').not.toBeNull();
    expect(data.markerTop!).toBeGreaterThanOrEqual(data.tableBottom! - 1);
  });

  test('no phantom blank page between table and following paragraph', async ({ page }) => {
    // A phantom blank page would appear as a [data-page-number] whose
    // body content area contains zero .layout-paragraph and zero
    // .layout-table children. Make sure none exist.
    const blankPages = await page.evaluate(() => {
      const pages = Array.from(document.querySelectorAll('[data-page-number]'));
      let blanks = 0;
      for (const p of pages) {
        const hasContent =
          p.querySelector('.layout-paragraph') || p.querySelector('.layout-table');
        if (!hasContent) blanks++;
      }
      return blanks;
    });
    expect(blankPages).toBe(0);
  });
});
