/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Regression for the "text runs off the page" bug.
 *
 * The renderer only applies POSITIVE left/right indents (renderParagraph clamps
 * negatives to 0). Measurement, however, used the signed indent, so a negative
 * left/right indent WIDENED the wrap width (maxWidth - (-n) = maxWidth + n).
 * Lines were then packed wider than the content box and painted (white-space:
 * pre) past the page margin. Measurement must clamp block indent to >= 0 to
 * match the renderer, so a negative indent wraps exactly like a zero indent.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { measureParagraph } from '../measureParagraph';
import { resetCanvasContext } from '../measureContainer';
import type { ParagraphBlock, ParagraphMeasure } from '../../../layout-engine/types';

let zero: ParagraphMeasure;
let negative: ParagraphMeasure;
let positive: ParagraphMeasure;

beforeAll(() => {
  GlobalRegistrator.register();
  // happy-dom has no canvas 2D context. Inject a deterministic one: text width
  // is proportional to character count, so wrapping is stable and independent
  // of any real font metrics — exactly what a wrap-width regression needs.
  const fakeCtx = {
    font: '',
    measureText: (s: string) => ({
      width: s.length * 8,
      actualBoundingBoxAscent: 12,
      actualBoundingBoxDescent: 4,
    }),
  };
  // @ts-expect-error — override canvas for measurement determinism in tests.
  HTMLCanvasElement.prototype.getContext = () => fakeCtx;
  resetCanvasContext();

  // Measured AFTER the stub is installed (a describe-body const would run at
  // collection time, before beforeAll).
  zero = measureWithLeftIndent(0);
  negative = measureWithLeftIndent(-100);
  positive = measureWithLeftIndent(100);
});
afterAll(() => GlobalRegistrator.unregister());

// Long enough to wrap several times inside a narrow content box.
const TEXT = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
const MAX_WIDTH = 300;

function measureWithLeftIndent(left: number) {
  const block = {
    kind: 'paragraph',
    id: 'p',
    pmStart: 0,
    pmEnd: 0,
    runs: [{ kind: 'text', text: TEXT }],
    attrs: { defaultFontSize: 12, defaultFontFamily: 'Arial', indent: { left } },
  } as unknown as ParagraphBlock;
  return measureParagraph(block, MAX_WIDTH);
}

describe('measureParagraph — negative indent does not widen the wrap', () => {
  test('measurement actually responds to width (guard: positive indent wraps into more lines)', () => {
    // Proves the canvas is measuring text and wrapping — otherwise the equality
    // assertion below would pass vacuously.
    expect(positive.lines.length).toBeGreaterThan(zero.lines.length);
  });

  test('a negative left indent wraps identically to a zero indent (clamped, no overflow)', () => {
    expect(negative.lines.length).toBe(zero.lines.length);
    const widestNegative = Math.max(...negative.lines.map((l) => l.width));
    const widestZero = Math.max(...zero.lines.map((l) => l.width));
    expect(widestNegative).toBeCloseTo(widestZero, 5);
  });

  test('no measured line exceeds the content-box width', () => {
    for (const line of negative.lines) {
      expect(line.width).toBeLessThanOrEqual(MAX_WIDTH + 1);
    }
  });
});
