/** ECMA-376 §17.6.22: a `continuous` section break does not force a page,
 *  but the next page (when one is naturally created) must use the new
 *  section's geometry. The previous version skipped `updatePageLayout`
 *  for `continuous` and the next overflow page kept the old size/margins. */

import { describe, test, expect } from 'bun:test';
import { layoutDocument } from '../index';
import type { FlowBlock, ParagraphBlock, ParagraphMeasure, SectionBreakBlock } from '../types';

function para(id: string, height: number): { block: ParagraphBlock; measure: ParagraphMeasure } {
  return {
    block: {
      kind: 'paragraph',
      id,
      pmStart: 0,
      pmEnd: 0,
      runs: [{ kind: 'text', text: id }],
      attrs: {},
    },
    measure: {
      kind: 'paragraph',
      lines: [
        {
          fromRun: 0,
          fromChar: 0,
          toRun: 0,
          toChar: 0,
          width: 100,
          ascent: 10,
          descent: 3,
          lineHeight: height,
        },
      ],
      totalHeight: height,
    },
  };
}

describe('continuous section break geometry', () => {
  test('current page keeps OLD section geometry; only the next created page picks up the new size', () => {
    // Half-page of content, then a continuous break that swaps to landscape.
    // The page containing the break stays portrait; overflow lands in landscape.
    const A = para('a', 200);
    const sb: SectionBreakBlock = {
      kind: 'sectionBreak',
      id: 'sb',
      type: 'continuous',
      pageSize: { w: 800, h: 1000 },
      margins: { top: 50, right: 50, bottom: 50, left: 50 },
    };
    const B = para('b', 200);
    // C is taller than the new section's content area (landscape 700h with
    // 50/50 margins → 600). Exercises the paginator's oversized-fragment
    // guard across a deferred geometry swap: without the in-loop re-check,
    // `ensureFits` looped forever creating empty pages.
    const C = para('c', 800);

    const blocks: FlowBlock[] = [A.block, sb, B.block, C.block];
    const measures = [A.measure, { kind: 'sectionBreak' }, B.measure, C.measure] as never;

    const result = layoutDocument(blocks, measures, {
      pageSize: { w: 800, h: 1000 },
      margins: { top: 50, right: 50, bottom: 50, left: 50 },
      finalPageSize: { w: 1200, h: 700 },
      finalMargins: { top: 50, right: 50, bottom: 50, left: 50 },
    });

    // First page started before the break — must keep the OLD geometry.
    expect(result.pages[0].size.w).toBe(800);
    // Last page (created from overflow after the break) — NEW geometry.
    const lastPage = result.pages[result.pages.length - 1];
    expect(lastPage.size.w).toBe(1200);
    expect(lastPage.size.h).toBe(700);
  });

  test("next overflow page uses the continuous section's page size", () => {
    const A = para('a', 700); // fills first portrait page
    const sb: SectionBreakBlock = {
      kind: 'sectionBreak',
      id: 'sb',
      type: 'continuous',
      pageSize: { w: 1200, h: 700 }, // landscape
      margins: { top: 50, right: 50, bottom: 50, left: 50 },
    };
    const B = para('b', 500); // forces a second page after the section break
    const C = para('c', 500); // overflows to a third page (landscape)

    const blocks: FlowBlock[] = [A.block, sb, B.block, C.block];
    const measures = [A.measure, { kind: 'sectionBreak' }, B.measure, C.measure] as never;

    const result = layoutDocument(blocks, measures, {
      pageSize: { w: 800, h: 1000 },
      margins: { top: 50, right: 50, bottom: 50, left: 50 },
      finalPageSize: { w: 1200, h: 700 },
      finalMargins: { top: 50, right: 50, bottom: 50, left: 50 },
    });

    // Pages after the continuous break must adopt the new geometry.
    const lastPage = result.pages[result.pages.length - 1];
    expect(lastPage.size.w).toBe(1200);
    expect(lastPage.size.h).toBe(700);
  });

  test('content after a 2-column region resumes below the DEEPEST column, not the last one', () => {
    // 1-col A, then a continuous break to 2 columns: B fills column 0 deep,
    // a column break jumps to the shorter column 1 (C), then a continuous
    // break drops back to 1 column. D must start below column 0's bottom —
    // not at column 1's (higher) cursor, which would overpaint column 0.
    const A = para('a', 100); // 1-col: 50(margin)+100 = 150
    const to2: SectionBreakBlock = {
      kind: 'sectionBreak',
      id: 'to2',
      type: 'continuous',
      columns: { count: 2, gap: 20 },
    };
    const B = para('b', 300); // column 0: 150 → 450
    const colBreak: FlowBlock = { kind: 'columnBreak', id: 'cb' };
    const C = para('c', 80); // column 1: 150 → 230
    const to1: SectionBreakBlock = {
      kind: 'sectionBreak',
      id: 'to1',
      type: 'continuous',
      columns: { count: 1, gap: 0 },
    };
    const D = para('d', 100);

    const blocks: FlowBlock[] = [A.block, to2, B.block, colBreak, C.block, to1, D.block];
    const measures = [
      A.measure,
      { kind: 'sectionBreak' },
      B.measure,
      { kind: 'columnBreak' },
      C.measure,
      { kind: 'sectionBreak' },
      D.measure,
    ] as never;

    const result = layoutDocument(blocks, measures, {
      pageSize: { w: 800, h: 2000 }, // tall page so nothing overflows
      margins: { top: 50, right: 50, bottom: 50, left: 50 },
    });

    const dFrag = result.pages.flatMap((p) => p.fragments).find((f) => f.blockId === 'd');
    expect(dFrag).toBeDefined();
    // Column 0 (B) ended at 450; D must be at or below that, never at ~230.
    expect(dFrag!.y).toBeGreaterThanOrEqual(450);
  });
});
