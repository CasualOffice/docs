/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Coverage for the line-number gutter (w:lnNumType, ECMA-376 §17.6.10).
 * renderPage paints a left-margin number for body text lines, honoring
 * `start` and `countBy`, with numbers positioned at each line's Y.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type {
  Page,
  ParagraphBlock,
  ParagraphFragment,
  ParagraphMeasure,
} from '../../layout-engine/types';
import type { BlockLookup } from '../index';
import { renderPage } from '../renderPage';

beforeAll(() => {
  GlobalRegistrator.register();
});

afterAll(() => {
  GlobalRegistrator.unregister();
});

function makeParagraph(
  id: string,
  text: string,
  lineCount: number,
  lineHeight: number
): { block: ParagraphBlock; measure: ParagraphMeasure } {
  const lines = Array.from({ length: lineCount }, () => ({
    fromRun: 0,
    fromChar: 0,
    toRun: 0,
    toChar: text.length,
    width: 200,
    ascent: lineHeight - 6,
    descent: 6,
    lineHeight,
  }));
  return {
    block: { kind: 'paragraph', id, runs: [{ kind: 'text', text }] },
    measure: { kind: 'paragraph', lines, totalHeight: lineHeight * lineCount },
  };
}

const margins = { top: 50, right: 36, bottom: 50, left: 90 };

function buildPage(
  fragmentsSpec: Array<{ id: string; y: number; lines: number; lineHeight: number }>
): Page {
  const fragments: ParagraphFragment[] = fragmentsSpec.map((f) => ({
    kind: 'paragraph',
    blockId: f.id,
    x: margins.left,
    y: f.y,
    width: 600,
    height: f.lineHeight * f.lines,
    fromLine: 0,
    toLine: f.lines,
  }));
  return {
    number: 1,
    fragments,
    margins,
    size: { w: 816, h: 1056 },
  };
}

describe('line-number gutter', () => {
  test('numbers every line by default, positioned at each line Y', () => {
    const lookup: BlockLookup = new Map();
    const p1 = makeParagraph('p1', 'first', 2, 20);
    const p2 = makeParagraph('p2', 'second', 1, 20);
    lookup.set('p1', p1);
    lookup.set('p2', p2);

    const page = buildPage([
      { id: 'p1', y: margins.top + 0, lines: 2, lineHeight: 20 },
      { id: 'p2', y: margins.top + 40, lines: 1, lineHeight: 20 },
    ]);

    const el = renderPage(
      page,
      { pageNumber: 1, totalPages: 1, section: 'body' },
      { document, blockLookup: lookup, lineNumbers: { start: 1, countBy: 1 } }
    );

    const gutter = el.querySelector('.layout-line-numbers');
    expect(gutter).toBeTruthy();
    const nums = Array.from(el.querySelectorAll<HTMLElement>('.layout-line-number'));
    expect(nums.map((n) => n.textContent)).toEqual(['1', '2', '3']);
    // Content-area-relative tops: p1 lines at 0, 20; p2 line at 40.
    expect(nums.map((n) => n.style.top)).toEqual(['0px', '20px', '40px']);
  });

  test('countBy prints only every Nth line and start offsets the first number', () => {
    const lookup: BlockLookup = new Map();
    lookup.set('p1', makeParagraph('p1', 'x', 5, 18));

    const page = buildPage([{ id: 'p1', y: margins.top, lines: 5, lineHeight: 18 }]);

    const el = renderPage(
      page,
      { pageNumber: 1, totalPages: 1, section: 'body' },
      { document, blockLookup: lookup, lineNumbers: { start: 1, countBy: 5 } }
    );

    const nums = Array.from(el.querySelectorAll<HTMLElement>('.layout-line-number'));
    // 5 lines, display numbers 1..5, countBy 5 → only "5" prints.
    expect(nums.map((n) => n.textContent)).toEqual(['5']);
  });

  test('no gutter when lineNumbers is absent', () => {
    const lookup: BlockLookup = new Map();
    lookup.set('p1', makeParagraph('p1', 'x', 1, 18));
    const page = buildPage([{ id: 'p1', y: margins.top, lines: 1, lineHeight: 18 }]);

    const el = renderPage(
      page,
      { pageNumber: 1, totalPages: 1, section: 'body' },
      { document, blockLookup: lookup }
    );

    expect(el.querySelector('.layout-line-numbers')).toBeNull();
  });
});
