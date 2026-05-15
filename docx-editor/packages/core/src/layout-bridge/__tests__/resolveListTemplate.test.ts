import { describe, test, expect } from 'bun:test';
import { resolveListTemplate } from '../toFlowBlocks';

describe('resolveListTemplate', () => {
  describe('decimal numFmt', () => {
    test('resolves %1. with first counter', () => {
      expect(resolveListTemplate('%1.', [1, 0, 0], ['decimal'])).toBe('1.');
      expect(resolveListTemplate('%1.', [3, 0, 0], ['decimal'])).toBe('3.');
    });

    test('resolves trailing-paren format %1)', () => {
      expect(resolveListTemplate('%1)', [7, 0, 0], ['decimal'])).toBe('7)');
    });

    test('falls back to decimal when numFmt is missing', () => {
      expect(resolveListTemplate('%1.', [4], undefined)).toBe('4.');
    });
  });

  describe('upperLetter / lowerLetter numFmt', () => {
    test('upperLetter A..Z', () => {
      expect(resolveListTemplate('%1.', [1], ['upperLetter'])).toBe('A.');
      expect(resolveListTemplate('%1.', [26], ['upperLetter'])).toBe('Z.');
    });

    test('upperLetter wraps past Z (27 → AA)', () => {
      expect(resolveListTemplate('%1.', [27], ['upperLetter'])).toBe('AA.');
      expect(resolveListTemplate('%1.', [28], ['upperLetter'])).toBe('AB.');
    });

    test('lowerLetter', () => {
      expect(resolveListTemplate('%1)', [1], ['lowerLetter'])).toBe('a)');
      expect(resolveListTemplate('%1)', [3], ['lowerLetter'])).toBe('c)');
    });
  });

  describe('upperRoman / lowerRoman numFmt', () => {
    test('upperRoman', () => {
      expect(resolveListTemplate('%1.', [1], ['upperRoman'])).toBe('I.');
      expect(resolveListTemplate('%1.', [4], ['upperRoman'])).toBe('IV.');
      expect(resolveListTemplate('%1.', [9], ['upperRoman'])).toBe('IX.');
      expect(resolveListTemplate('%1.', [40], ['upperRoman'])).toBe('XL.');
    });

    test('lowerRoman', () => {
      expect(resolveListTemplate('%1.', [1], ['lowerRoman'])).toBe('i.');
      expect(resolveListTemplate('%1.', [3], ['lowerRoman'])).toBe('iii.');
      expect(resolveListTemplate('%1.', [9], ['lowerRoman'])).toBe('ix.');
    });
  });

  describe('multi-level templates', () => {
    test('resolves %1.%2. with two-level counters', () => {
      expect(resolveListTemplate('%1.%2.', [1, 1, 0], ['decimal', 'decimal'])).toBe('1.1.');
      expect(resolveListTemplate('%1.%2.', [2, 3, 0], ['decimal', 'decimal'])).toBe('2.3.');
    });

    test('resolves %1.%2.%3. with three-level counters', () => {
      expect(resolveListTemplate('%1.%2.%3.', [1, 2, 4], ['decimal', 'decimal', 'decimal'])).toBe(
        '1.2.4.'
      );
    });

    test('mixes formats per level (upperRoman parent + decimal child)', () => {
      expect(resolveListTemplate('%1.%2.', [3, 2], ['upperRoman', 'decimal'])).toBe('III.2.');
    });
  });

  describe('decimalZero numFmt', () => {
    test('pads single digit', () => {
      expect(resolveListTemplate('%1.', [3], ['decimalZero'])).toBe('03.');
    });

    test('does not pad two-digit', () => {
      expect(resolveListTemplate('%1.', [12], ['decimalZero'])).toBe('12.');
    });
  });

  describe('edge cases', () => {
    test('counter of 0 drops both placeholder and trailing punct', () => {
      expect(resolveListTemplate('%1.', [0], ['decimal'])).toBe('');
    });

    test('"%1.%2." at level 0 renders "1." not "1.."', () => {
      expect(resolveListTemplate('%1.%2.', [1, 0], ['decimal', 'decimal'])).toBe('1.');
    });

    test('"%1.%2.%3." at level 1 renders "1.2."', () => {
      expect(resolveListTemplate('%1.%2.%3.', [1, 2, 0], ['decimal', 'decimal', 'decimal'])).toBe(
        '1.2.'
      );
    });

    test('template with no %N tokens passes through', () => {
      expect(resolveListTemplate('Section', [1], ['decimal'])).toBe('Section');
    });

    test('unknown numFmt falls back to decimal', () => {
      expect(resolveListTemplate('%1.', [5], ['ideographDigital'])).toBe('5.');
    });

    test('"none" numFmt drops placeholder and trailing punct', () => {
      expect(resolveListTemplate('%1.', [5], ['none'])).toBe('');
    });

    test('"none" numFmt mid-template only drops its own segment', () => {
      expect(resolveListTemplate('%1.%2.', [3, 5], ['decimal', 'none'])).toBe('3.');
    });
  });
});
