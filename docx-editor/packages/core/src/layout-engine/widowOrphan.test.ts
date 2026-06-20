/**
 * Widow/orphan control (OOXML §17.3.1.44, Word default ON): a paragraph that
 * splits across a page break must keep at least two of its lines together on
 * each side.
 */
import { describe, test, expect } from 'bun:test';
import { layoutDocument } from './index';
import type {
  FlowBlock,
  Measure,
  ParagraphBlock,
  ParagraphMeasure,
  MeasuredLine,
  PageMargins,
  LayoutOptions,
  ParagraphFragment,
} from './types';

const PAGE = { w: 816, h: 1056 };
const MARGINS: PageMargins = { top: 96, right: 96, bottom: 96, left: 96 };
const LH = 24; // content height = 1056-192 = 864 → 36 lines/page

function para(id: number, nLines: number): { block: ParagraphBlock; measure: ParagraphMeasure } {
  const lines: MeasuredLine[] = Array.from({ length: nLines }, () => ({
    fromRun: 0,
    fromChar: 0,
    toRun: 0,
    toChar: 1,
    width: 100,
    ascent: LH * 0.8,
    descent: LH * 0.2,
    lineHeight: LH,
  }));
  return {
    block: {
      kind: 'paragraph',
      id,
      runs: [{ kind: 'text', text: 'x', pmStart: id, pmEnd: id + 1 }],
      attrs: {},
      pmStart: id,
      pmEnd: id + 1,
    },
    measure: { kind: 'paragraph', lines, totalHeight: nLines * LH },
  };
}

function run(specs: number[]): ReturnType<typeof layoutDocument> {
  const blocks: FlowBlock[] = [];
  const measures: Measure[] = [];
  specs.forEach((n, i) => {
    const p = para(i, n);
    blocks.push(p.block);
    measures.push(p.measure);
  });
  const opts: LayoutOptions = { pageSize: PAGE, margins: MARGINS, pageGap: 20 };
  return layoutDocument(blocks, measures, opts);
}

/** Fragments of block `id`, in page order, as [pageIndex, fromLine, toLine]. */
function fragmentsOf(layout: ReturnType<typeof layoutDocument>, id: number) {
  const out: Array<{ page: number; from: number; to: number }> = [];
  layout.pages.forEach((pg, page) => {
    for (const f of pg.fragments) {
      if (f.kind === 'paragraph' && f.blockId === id) {
        const pf = f as ParagraphFragment;
        out.push({ page, from: pf.fromLine, to: pf.toLine });
      }
    }
  });
  return out;
}

describe('Widow/orphan control', () => {
  test('orphan: a single opening line is pushed to the next page', () => {
    // 35 filler lines fill all but one line of page 1; the 3-line paragraph
    // would otherwise leave 1 orphan line at the bottom of page 1.
    const layout = run([35, 3]);
    const frags = fragmentsOf(layout, 1);
    // Whole paragraph travels to page 2 — no fragment on page 0.
    expect(frags.every((f) => f.page === 1)).toBe(true);
    expect(frags).toEqual([{ page: 1, from: 0, to: 3 }]);
  });

  test('widow: a single trailing line is avoided by pulling a line down', () => {
    // 33 filler lines → 3 lines of room on page 1. A 4-line paragraph would
    // place 3 lines on page 1 and strand 1 (widow) on page 2.
    const layout = run([33, 4]);
    const frags = fragmentsOf(layout, 1);
    // Split keeps >=2 lines on each side: 2 on page 0, 2 on page 1.
    expect(frags.length).toBe(2);
    expect(frags[0].to - frags[0].from).toBeGreaterThanOrEqual(2);
    expect(frags[1].to - frags[1].from).toBeGreaterThanOrEqual(2);
  });

  test('a clean split (>=2 lines each side) is left unchanged', () => {
    // 30 filler → 6 lines of room. An 8-line paragraph splits 6/2 — already
    // widow/orphan-safe, so the split point is unchanged.
    const layout = run([30, 8]);
    const frags = fragmentsOf(layout, 1);
    expect(frags.length).toBe(2);
    expect(frags[0].to - frags[0].from).toBeGreaterThanOrEqual(2);
    expect(frags[1].to - frags[1].from).toBeGreaterThanOrEqual(2);
  });
});
