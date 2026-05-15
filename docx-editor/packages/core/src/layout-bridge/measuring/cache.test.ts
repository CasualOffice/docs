/**
 * Regression: hashParagraphBlock used to ignore defaultFontSize/defaultFontFamily
 * on empty paragraphs. Two empty paragraphs with different default fonts hashed
 * to the same key, so the layout cache served a stale measurement and the caret
 * rendered at the previously cached size until typing forced a re-key.
 */

import { describe, test, expect } from 'bun:test';
import type { ParagraphBlock } from '../../layout-engine/types';
import { hashParagraphBlock } from './cache';

function emptyParagraph(attrs: Partial<ParagraphBlock['attrs']> = {}): ParagraphBlock {
  return {
    kind: 'paragraph',
    id: 'b1',
    runs: [],
    attrs: attrs as ParagraphBlock['attrs'],
    pmStart: 0,
    pmEnd: 2,
  };
}

describe('hashParagraphBlock', () => {
  test('empty paragraphs with different defaultFontSize produce different hashes', () => {
    const small = hashParagraphBlock(emptyParagraph({ defaultFontSize: 11 }));
    const large = hashParagraphBlock(emptyParagraph({ defaultFontSize: 48 }));
    expect(small).not.toBe(large);
  });

  test('empty paragraphs with different defaultFontFamily produce different hashes', () => {
    const inter = hashParagraphBlock(emptyParagraph({ defaultFontFamily: 'Inter' }));
    const georgia = hashParagraphBlock(emptyParagraph({ defaultFontFamily: 'Georgia' }));
    expect(inter).not.toBe(georgia);
  });

  test('two empty paragraphs with the same defaults still hash identically (cache stays useful)', () => {
    const a = hashParagraphBlock(
      emptyParagraph({ defaultFontSize: 11, defaultFontFamily: 'Inter' })
    );
    const b = hashParagraphBlock(
      emptyParagraph({ defaultFontSize: 11, defaultFontFamily: 'Inter' })
    );
    expect(a).toBe(b);
  });

  test('empty paragraph with no defaults differs from one with defaults', () => {
    const noDefaults = hashParagraphBlock(emptyParagraph({}));
    const withSize = hashParagraphBlock(emptyParagraph({ defaultFontSize: 48 }));
    expect(noDefaults).not.toBe(withSize);
  });
});
