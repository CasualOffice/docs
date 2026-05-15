/**
 * Unit tests for findPageIndexContainingPmPos.
 */

import { describe, test, expect } from 'bun:test';
import type { Layout, Page, ParagraphFragment } from './types';
import { findPageIndexContainingPmPos } from './findPageIndexContainingPmPos';

const margins = { top: 96, right: 96, bottom: 96, left: 96 };
const size = { w: 816, h: 1056 };

function paraFrag(pmStart: number, pmEnd: number, blockId = 1): ParagraphFragment {
  return {
    kind: 'paragraph',
    blockId,
    x: 0,
    y: 0,
    width: 100,
    height: 20,
    fromLine: 0,
    toLine: 1,
    pmStart,
    pmEnd,
  };
}

function page(number: number, fragments: ParagraphFragment[]): Page {
  return { number, fragments, margins, size };
}

function layoutFromPages(pages: Page[]): Layout {
  return {
    pageSize: size,
    pages,
  };
}

describe('findPageIndexContainingPmPos', () => {
  test('returns null for empty layout', () => {
    const layout = layoutFromPages([]);
    expect(findPageIndexContainingPmPos(layout, 5)).toBeNull();
  });

  test('finds page 0 when pmPos is inside first fragment range (half-open)', () => {
    const layout = layoutFromPages([page(1, [paraFrag(10, 50)])]);
    expect(findPageIndexContainingPmPos(layout, 10)).toBe(0);
    expect(findPageIndexContainingPmPos(layout, 30)).toBe(0);
    // pmEnd is exclusive — position 50 belongs to whatever comes next.
    expect(findPageIndexContainingPmPos(layout, 50)).toBeNull();
    expect(findPageIndexContainingPmPos(layout, 49)).toBe(0);
  });

  test('shared boundary: next fragment wins when pmEnd[A] === pmStart[B]', () => {
    // Adjacent paragraphs across pages. pos=50 is the start of page-1 fragment
    // (pmStart=50), not the end of page-0 fragment (pmEnd=50). Used to be
    // page 0 due to inclusive upper bound — that broke scrollTo at the
    // first character of the next paragraph.
    const layout = layoutFromPages([page(1, [paraFrag(10, 50)]), page(2, [paraFrag(50, 100)])]);
    expect(findPageIndexContainingPmPos(layout, 49)).toBe(0);
    expect(findPageIndexContainingPmPos(layout, 50)).toBe(1);
    expect(findPageIndexContainingPmPos(layout, 99)).toBe(1);
    expect(findPageIndexContainingPmPos(layout, 100)).toBeNull();
  });

  test('finds page 1 when pmPos is on second page only', () => {
    const layout = layoutFromPages([page(1, [paraFrag(1, 5)]), page(2, [paraFrag(100, 200)])]);
    expect(findPageIndexContainingPmPos(layout, 100)).toBe(1);
    expect(findPageIndexContainingPmPos(layout, 150)).toBe(1);
  });

  test('uses default end when pmEnd is missing (end = start + 1, exclusive)', () => {
    const frag: ParagraphFragment = {
      kind: 'paragraph',
      blockId: 1,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      fromLine: 0,
      toLine: 1,
      pmStart: 42,
    };
    const layout = layoutFromPages([page(1, [frag])]);
    expect(findPageIndexContainingPmPos(layout, 42)).toBe(0);
    // Half-open: 43 is now outside (was inside under the old inclusive bound).
    expect(findPageIndexContainingPmPos(layout, 43)).toBeNull();
  });

  test('skips fragments without pmStart', () => {
    const fragNoStart = {
      kind: 'paragraph',
      blockId: 1,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      fromLine: 0,
      toLine: 1,
    } as ParagraphFragment;
    const layout = layoutFromPages([page(1, [fragNoStart, paraFrag(10, 20)])]);
    expect(findPageIndexContainingPmPos(layout, 10)).toBe(0);
    expect(findPageIndexContainingPmPos(layout, 0)).toBeNull();
  });

  test('returns first matching page when ranges overlap on consecutive fragments', () => {
    const layout = layoutFromPages([page(1, [paraFrag(10, 100), paraFrag(50, 120)])]);
    expect(findPageIndexContainingPmPos(layout, 60)).toBe(0);
  });

  test('returns null when pmPos is outside all fragments', () => {
    const layout = layoutFromPages([page(1, [paraFrag(10, 20)])]);
    expect(findPageIndexContainingPmPos(layout, 9)).toBeNull();
    expect(findPageIndexContainingPmPos(layout, 21)).toBeNull();
  });
});
