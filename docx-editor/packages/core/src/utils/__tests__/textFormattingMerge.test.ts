import { describe, test, expect } from 'bun:test';
import { mergeTextFormatting } from '../textFormattingMerge';

describe('mergeTextFormatting', () => {
  test('per-slot merge of fontFamily — eastAsia source preserves inherited ascii', () => {
    const result = mergeTextFormatting(
      { fontFamily: { ascii: 'Arial Narrow' } },
      { fontFamily: { eastAsia: 'Calibri' } }
    );
    expect(result?.fontFamily).toEqual({ ascii: 'Arial Narrow', eastAsia: 'Calibri' });
  });

  test('shallow-merges object-shaped fields — underline child sets style, parent color preserved', () => {
    const result = mergeTextFormatting(
      { underline: { style: 'single', color: { rgb: 'FF0000' } } },
      { underline: { style: 'double' } }
    );
    expect(result?.underline).toEqual({ style: 'double', color: { rgb: 'FF0000' } });
  });

  test('color w:val="auto" does not override an explicit color from the chain', () => {
    const result = mergeTextFormatting({ color: { rgb: 'FF0000' } }, { color: { auto: true } });
    expect(result?.color).toEqual({ rgb: 'FF0000' });
  });

  test('color with explicit rgb overrides inherited color', () => {
    const result = mergeTextFormatting({ color: { rgb: 'FF0000' } }, { color: { rgb: '00FF00' } });
    expect(result?.color).toEqual({ rgb: '00FF00' });
  });

  test('primitives — bold true overrides inherited false', () => {
    const result = mergeTextFormatting({ bold: false }, { bold: true });
    expect(result?.bold).toBe(true);
  });

  test('keys not in target are added from source', () => {
    const result = mergeTextFormatting({ bold: true }, { italic: true });
    expect(result).toEqual({ bold: true, italic: true });
  });

  test('undefined target returns a copy of source', () => {
    const source = { bold: true };
    const result = mergeTextFormatting(undefined, source);
    expect(result).toEqual(source);
    expect(result).not.toBe(source);
  });

  test('both undefined returns undefined', () => {
    expect(mergeTextFormatting(undefined, undefined)).toBeUndefined();
  });
});
