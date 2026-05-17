/**
 * Pin every additional `NumberFormat` we added support for.
 *
 * Before this commit `formatCounter` only handled
 * `upperRoman` / `lowerRoman` / `upperLetter` / `lowerLetter` /
 * `decimalZero` / `none` plus a default decimal fallback. The 70+
 * other ECMA-376 `NumberFormat` enum values all collapsed to decimal,
 * silently changing "First, Second, Third" into "1, 2, 3" on render
 * (and on save through the same path).
 *
 * Coverage scope: the formats real-world English-language docs use.
 * Script-specific CJK / Hebrew / Arabic / Thai / Korean variants
 * still fall back to decimal — they need sizable lookup tables and
 * no fixture in our 39-fixture corpus uses them.
 */
import { describe, expect, test } from 'bun:test';
import { resolveListTemplate } from '../toFlowBlocks';
import type { NumberFormat } from '../../types/document';

function fmt(n: number, format: NumberFormat): string {
  // Use the public list-template resolver — calls formatCounter under
  // the hood. Template `%1` (no trailing punctuation) gives just the
  // numeral form for the only counter.
  return resolveListTemplate('%1', [n], [format]);
}

describe('NumberFormat — beyond decimal / roman / letter', () => {
  test('ordinal: 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd"', () => {
    expect(fmt(1, 'ordinal')).toBe('1st');
    expect(fmt(2, 'ordinal')).toBe('2nd');
    expect(fmt(3, 'ordinal')).toBe('3rd');
    expect(fmt(4, 'ordinal')).toBe('4th');
    // Teens always take "th" regardless of last digit
    expect(fmt(11, 'ordinal')).toBe('11th');
    expect(fmt(12, 'ordinal')).toBe('12th');
    expect(fmt(13, 'ordinal')).toBe('13th');
    expect(fmt(21, 'ordinal')).toBe('21st');
    expect(fmt(22, 'ordinal')).toBe('22nd');
    expect(fmt(101, 'ordinal')).toBe('101st');
  });

  test('cardinalText: word form', () => {
    expect(fmt(1, 'cardinalText')).toBe('One');
    expect(fmt(5, 'cardinalText')).toBe('Five');
    expect(fmt(13, 'cardinalText')).toBe('Thirteen');
    expect(fmt(20, 'cardinalText')).toBe('Twenty');
    expect(fmt(42, 'cardinalText')).toBe('Forty-two');
    expect(fmt(99, 'cardinalText')).toBe('Ninety-nine');
  });

  test('ordinalText: ordinal word form', () => {
    expect(fmt(1, 'ordinalText')).toBe('First');
    expect(fmt(2, 'ordinalText')).toBe('Second');
    expect(fmt(3, 'ordinalText')).toBe('Third');
    expect(fmt(11, 'ordinalText')).toBe('Eleventh');
    expect(fmt(20, 'ordinalText')).toBe('Twentieth');
    expect(fmt(21, 'ordinalText')).toBe('Twenty-first');
  });

  test('hex: uppercase hexadecimal', () => {
    expect(fmt(1, 'hex')).toBe('1');
    expect(fmt(10, 'hex')).toBe('A');
    expect(fmt(15, 'hex')).toBe('F');
    expect(fmt(16, 'hex')).toBe('10');
    expect(fmt(255, 'hex')).toBe('FF');
  });

  test('numberInDash: bracketed dash form', () => {
    expect(fmt(1, 'numberInDash')).toBe('- 1 -');
    expect(fmt(42, 'numberInDash')).toBe('- 42 -');
  });

  test('chicago: footnote glyph sequence with doubling', () => {
    expect(fmt(1, 'chicago')).toBe('*');
    expect(fmt(2, 'chicago')).toBe('†');
    expect(fmt(3, 'chicago')).toBe('‡');
    expect(fmt(6, 'chicago')).toBe('#');
    expect(fmt(7, 'chicago')).toBe('**'); // second pass doubles the glyph
    expect(fmt(8, 'chicago')).toBe('††');
    expect(fmt(13, 'chicago')).toBe('***'); // third pass triples
  });

  test('decimalEnclosedCircle: ① ② ③ … ⑳ ㉑ ㊿', () => {
    expect(fmt(1, 'decimalEnclosedCircle')).toBe('①');
    expect(fmt(2, 'decimalEnclosedCircle')).toBe('②');
    expect(fmt(20, 'decimalEnclosedCircle')).toBe('⑳');
    expect(fmt(21, 'decimalEnclosedCircle')).toBe('㉑');
    expect(fmt(50, 'decimalEnclosedCircle')).toBe('㊿');
    expect(fmt(51, 'decimalEnclosedCircle')).toBe('(51)');
  });

  test('decimalEnclosedParen: ⑴ ⑵ … ⒇', () => {
    expect(fmt(1, 'decimalEnclosedParen')).toBe('⑴');
    expect(fmt(2, 'decimalEnclosedParen')).toBe('⑵');
    expect(fmt(20, 'decimalEnclosedParen')).toBe('⒇');
    expect(fmt(21, 'decimalEnclosedParen')).toBe('(21)');
  });

  test('script-specific formats still fall through to decimal', () => {
    // Not implementing CJK/Hebrew/Arabic lookups in this pass.
    // The fallback must remain decimal, not error or empty.
    expect(fmt(7, 'japaneseCounting')).toBe('7');
    expect(fmt(7, 'hebrew1')).toBe('7');
    expect(fmt(7, 'thaiNumbers')).toBe('7');
  });
});
