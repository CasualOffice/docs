/**
 * Regression tests for empty header/footer paragraphs.
 *
 * - #381: structural trailing empty paragraphs after a table can be suppressed
 *   to zero height when the caller marks them as anchors only.
 * - Empty paragraphs that still carry explicit spacing must keep that authored
 *   spacing, even when they arrive as a single empty text run.
 */

import { describe, expect, test } from 'bun:test';
import { measureParagraph } from '../measureParagraph';
import type { ParagraphBlock } from '../../../layout-engine/types';

function emptyPara(attrs: ParagraphBlock['attrs'] = {}): ParagraphBlock {
  return {
    kind: 'paragraph',
    id: 'p',
    runs: [],
    attrs,
  };
}

describe('measureParagraph - empty paragraph handling', () => {
  test('empty paragraph without flag uses default empty-line height', () => {
    const measure = measureParagraph(emptyPara(), 600);
    expect(measure.totalHeight).toBeGreaterThan(0);
    expect(measure.lines.length).toBe(1);
    expect(measure.lines[0].lineHeight).toBeGreaterThan(0);
  });

  test('empty paragraph with flag measures as zero height', () => {
    const measure = measureParagraph(emptyPara({ suppressEmptyParagraphHeight: true }), 600);
    expect(measure.totalHeight).toBe(0);
    expect(measure.lines.length).toBe(1);
    expect(measure.lines[0].lineHeight).toBe(0);
    expect(measure.lines[0].ascent).toBe(0);
    expect(measure.lines[0].descent).toBe(0);
  });

  for (const text of ['', ' ', '\u00a0']) {
    test(`single visually empty text run (${JSON.stringify(text)}) still preserves explicit spacing before/after`, () => {
      const measure = measureParagraph(
        {
          kind: 'paragraph',
          id: 'spaced-empty-run',
          runs: [{ kind: 'text', text }],
          attrs: {
            spacing: { before: 8, after: 4 },
          },
        } as ParagraphBlock,
        600
      );

      expect(measure.lines.length).toBe(1);
      expect(measure.lines[0].lineHeight).toBeGreaterThan(0);
      expect(measure.totalHeight).toBeCloseTo(measure.lines[0].lineHeight + 12, 4);
    });
  }
});
