/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

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

  test('unequal columns (equalWidth=0) position fragments at their explicit column X + width', () => {
    // Narrow left column (label) + wide right column (value), like the SDS
    // label/value sections. The wide column's text must NOT be squeezed into
    // an even split — that over-wraps and inflates region height.
    //
    // ECMA-376: a section break carries the properties of the section it ENDS,
    // so the unequal-2-column config sits on the break that FOLLOWS the
    // label/value content (`endRegion`); a trailing break drops back to 1
    // column for `tail`.
    const label = para('label', 40); // column 0
    const colBreak: FlowBlock = { kind: 'columnBreak', id: 'cb' };
    const value = para('value', 40); // column 1
    const endRegion: SectionBreakBlock = {
      kind: 'sectionBreak',
      id: 'endRegion',
      type: 'continuous',
      columns: {
        count: 2,
        gap: 10,
        equalWidth: false,
        columnWidths: [
          { width: 150, space: 10 }, // left label column
          { width: 540, space: 0 }, // wide value column
        ],
      },
    };
    const to1: SectionBreakBlock = {
      kind: 'sectionBreak',
      id: 'to1',
      type: 'continuous',
      columns: { count: 1, gap: 0 },
    };
    const tail = para('tail', 40);

    const blocks: FlowBlock[] = [label.block, colBreak, value.block, endRegion, to1, tail.block];
    const measures = [
      label.measure,
      { kind: 'columnBreak' },
      value.measure,
      { kind: 'sectionBreak' },
      { kind: 'sectionBreak' },
      tail.measure,
    ] as never;

    const result = layoutDocument(blocks, measures, {
      pageSize: { w: 800, h: 2000 },
      margins: { top: 50, right: 50, bottom: 50, left: 50 },
    });

    const frags = result.pages.flatMap((p) => p.fragments);
    const labelFrag = frags.find((f) => f.blockId === 'label')!;
    const valueFrag = frags.find((f) => f.blockId === 'value')!;
    expect(labelFrag).toBeDefined();
    expect(valueFrag).toBeDefined();
    // Left column starts at the left margin and is the narrow width.
    expect(labelFrag.x).toBe(50);
    expect(labelFrag.width).toBe(150);
    // Right column starts after left width + its trailing space (150 + 10),
    // measured from the left margin, and takes the wide width.
    expect(valueFrag.x).toBe(50 + 150 + 10);
    expect(valueFrag.width).toBe(540);
  });

  test('a short 2-column region that will not fit in the remaining page space is pushed whole', () => {
    // Fill most of the page, then a continuous break entering a 2-column
    // region that needs more than the leftover height but fits on a fresh
    // page. The region must move whole to the next page rather than splitting
    // one column's overflow into a stray strip on the next page.
    //
    // `enter` switches the flow into the 2-column section; `endRegion` (which
    // carries the 2-column config per ECMA-376) ends it. The 50px leftover
    // after A is far less than the region's ~120px tallest column.
    const A = para('a', 850); // 50(margin)+850 = 900; leftover to 950 is 50px
    const enter: SectionBreakBlock = { kind: 'sectionBreak', id: 'enter', type: 'continuous' };
    const left = para('left', 120); // column 0 (taller than the 50px leftover)
    const colBreak: FlowBlock = { kind: 'columnBreak', id: 'cb' };
    const right = para('right', 120); // column 1
    const endRegion: SectionBreakBlock = {
      kind: 'sectionBreak',
      id: 'endRegion',
      type: 'continuous',
      columns: { count: 2, gap: 20 },
    };
    const to1: SectionBreakBlock = {
      kind: 'sectionBreak',
      id: 'to1',
      type: 'continuous',
      columns: { count: 1, gap: 0 },
    };
    const tail = para('tail', 40);

    const blocks: FlowBlock[] = [
      A.block,
      enter,
      left.block,
      colBreak,
      right.block,
      endRegion,
      to1,
      tail.block,
    ];
    const measures = [
      A.measure,
      { kind: 'sectionBreak' },
      left.measure,
      { kind: 'columnBreak' },
      right.measure,
      { kind: 'sectionBreak' },
      { kind: 'sectionBreak' },
      tail.measure,
    ] as never;

    const result = layoutDocument(blocks, measures, {
      pageSize: { w: 800, h: 1000 }, // contentBottom = 950
      margins: { top: 50, right: 50, bottom: 50, left: 50 },
    });

    const pageOf = (id: string) =>
      result.pages.findIndex((p) => p.fragments.some((f) => f.blockId === id));
    const leftPage = pageOf('left');
    const rightPage = pageOf('right');
    // The whole region lands together on the SECOND page (index 1), below A.
    expect(leftPage).toBe(1);
    expect(rightPage).toBe(1);
    // And it starts at that page's top margin, not split from the first page.
    const leftFrag = result.pages[1].fragments.find((f) => f.blockId === 'left')!;
    expect(leftFrag.y).toBe(50);
  });
});
