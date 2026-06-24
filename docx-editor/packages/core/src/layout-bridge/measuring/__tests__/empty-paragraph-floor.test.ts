import { describe, test, expect } from 'bun:test';
import { measureParagraph } from '../measureParagraph';

const PT_TO_PX = 96 / 72;

describe('empty paragraph line-height floor', () => {
  test('empty paragraph with line=1.0 auto is floored to the font single-line ratio', () => {
    // Arial Narrow has no OS/2 entry in fontResolver, so it falls back to the
    // default single-line ratio (1.15) — the floor leaves it at 1.15 × fontSize.
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

  test('empty Times New Roman paragraph uses its natural ratio, not a flat 1.15', () => {
    // Liberation Serif / Times New Roman single-line ratio ≈ 1.107. The empty
    // paragraph must match a one-line paragraph in the same font (and Word /
    // LibreOffice), NOT be inflated to 1.15 — dense forms stack dozens of empty
    // serif paragraphs and the over-height accumulated into visible drift.
    const measure = measureParagraph(
      {
        kind: 'paragraph',
        id: 't3',
        pmStart: 0,
        pmEnd: 0,
        runs: [],
        attrs: {
          defaultFontSize: 10,
          defaultFontFamily: 'Times New Roman',
          spacing: { line: 1.0, lineUnit: 'multiplier', lineRule: 'auto' },
        },
      } as never,
      600
    );
    expect(measure.totalHeight).toBeLessThan(10 * PT_TO_PX * 1.15);
    expect(measure.totalHeight).toBeCloseTo(10 * PT_TO_PX * 1.1074, 1);
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
