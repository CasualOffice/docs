/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * Merged cells beyond column 0 — openspec
 * `table-rendering-fidelity`. Fixture:
 *
 *   row 0: [A0      ] [A1A2-MERGED (gridSpan=2)        ]
 *   row 1: [B0-RESTART (vMerge=restart)] [B1] [B2]
 *   row 2: [(vMerge=continue, skipped)] [C1] [C2]
 *
 * Assertions:
 *   1. Horizontal merge — row 0's painted second cell spans
 *      ~2× a normal column. Verified via bounding-rect width: it's
 *      roughly equal to the sum of the two columns it covers.
 *   2. Vertical merge — row 2 has only 2 painted cells (the
 *      continue cell was skipped) and C1's left edge lines up with
 *      where B1 was (not shifted into B0's column).
 *
 * Originally tagged P2 for "Merged cells beyond the first column
 * render wrong" in the openspec. Audit finds gridSpan / vMerge
 * handling correct in `toProseDoc.ts:734-764` + the painter — this
 * spec pins the working behavior.
 */

test.describe('Merged table cells render correctly beyond column 0', () => {
  test('horizontal and vertical merges paint with correct geometry', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.loadDocxFile('fixtures/merged-cells.docx');
    await page.waitForTimeout(500);

    const data = await page.evaluate(() => {
      const visible = (el: HTMLElement) => !el.closest('.paged-editor__hidden-pm');
      const table = Array.from(document.querySelectorAll<HTMLElement>('.layout-table')).find(
        visible
      );
      if (!table) return { error: 'no table' as const };

      const rows = Array.from(table.querySelectorAll<HTMLElement>('.layout-table-row'));
      const rowReports = rows.map((row) => {
        const cells = Array.from(row.querySelectorAll<HTMLElement>('.layout-table-cell'));
        return {
          cellCount: cells.length,
          cells: cells.map((c) => ({
            text: c.textContent?.trim() ?? '',
            width: c.getBoundingClientRect().width,
            left: c.getBoundingClientRect().left,
          })),
        };
      });
      return { rowReports };
    });

    if ('error' in data) throw new Error(data.error);

    // 3 rows.
    expect(data.rowReports).toHaveLength(3);

    // ROW 0: [A0] [A1A2-MERGED] — 2 painted cells.
    const r0 = data.rowReports[0];
    expect(r0.cellCount, 'row 0 has 2 cells (A0 + merged A1A2)').toBe(2);
    expect(r0.cells[0].text).toBe('A0');
    expect(r0.cells[1].text).toBe('A1A2-MERGED');
    // The merged cell should be roughly twice as wide as A0.
    const a0Width = r0.cells[0].width;
    const mergedWidth = r0.cells[1].width;
    expect(mergedWidth, 'merged cell is wider than single').toBeGreaterThan(a0Width * 1.5);

    // ROW 1: [B0-RESTART] [B1] [B2] — 3 cells.
    const r1 = data.rowReports[1];
    expect(r1.cellCount, 'row 1 has 3 cells').toBe(3);
    expect(r1.cells[0].text).toBe('B0-RESTART');

    // ROW 2: [continue (skipped)] [C1] [C2] — only 2 painted cells.
    // C1 should align horizontally with B1 (the cell above it), NOT
    // shift left into the B0 column.
    const r2 = data.rowReports[2];
    expect(r2.cellCount, 'row 2 has 2 painted cells (vMerge continue skipped)').toBe(2);
    const c1 = r2.cells.find((c) => c.text === 'C1');
    const c2 = r2.cells.find((c) => c.text === 'C2');
    expect(c1).toBeTruthy();
    expect(c2).toBeTruthy();

    // C1's left edge should align with B1's left edge (same column).
    const b1 = r1.cells[1];
    expect(
      Math.abs(c1!.left - b1.left),
      'C1 aligns horizontally with B1 (not shifted)'
    ).toBeLessThan(2);
  });
});
