import { describe, test, expect } from 'bun:test';
import { measureParagraph } from '../measureParagraph';

const PT_TO_PX = 96 / 72;

describe('empty paragraph line-height floor', () => {
  test('empty paragraph with line=1.0 auto is floored to 1.15 × fontSize', () => {
    const measure = measureParagraph(
      {
        kind: 'paragraph',
        id: 't1',
        pmStart: 0,
        pmEnd: 0,
        runs: [],
        attrs: {
          defaultFontSize: 11,
          defaultFontFamily: 'Arial Narrow',
          spacing: { line: 1.0, lineUnit: 'multiplier', lineRule: 'auto' },
        },
      } as never,
      600
    );
    expect(measure.totalHeight).toBeCloseTo(11 * PT_TO_PX * 1.15, 1);
  });

  test('empty paragraph with lineRule=exact is NOT floored (exact means exact)', () => {
    const measure = measureParagraph(
      {
        kind: 'paragraph',
        id: 't2',
        pmStart: 0,
        pmEnd: 0,
        runs: [],
        attrs: {
          defaultFontSize: 11,
          defaultFontFamily: 'Arial Narrow',
          spacing: { line: 8, lineUnit: 'px', lineRule: 'exact' },
        },
      } as never,
      600
    );
    expect(measure.totalHeight).toBeCloseTo(8, 1);
  });
});
