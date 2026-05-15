import { describe, test, expect } from 'bun:test';
import {
  generateThemeTintShadeMatrix,
  getThemeTintShadeHex,
  resolveColor,
  resolveColorToHex,
} from '../colorResolver';
import type { Theme, ThemeColorScheme } from '../../types/document';

const OFFICE_2016_DEFAULTS: ThemeColorScheme = {
  dk1: '000000',
  lt1: 'FFFFFF',
  dk2: '44546A',
  lt2: 'E7E6E6',
  accent1: '4472C4',
  accent2: 'ED7D31',
  accent3: 'A5A5A5',
  accent4: 'FFC000',
  accent5: '5B9BD5',
  accent6: '70AD47',
  hlink: '0563C1',
  folHlink: '954F72',
};

describe('generateThemeTintShadeMatrix', () => {
  test('returns 6 rows x 10 columns', () => {
    const matrix = generateThemeTintShadeMatrix(OFFICE_2016_DEFAULTS);
    expect(matrix).toHaveLength(6);
    for (const row of matrix) {
      expect(row).toHaveLength(10);
    }
  });

  test('row 0 contains base theme colors', () => {
    const matrix = generateThemeTintShadeMatrix(OFFICE_2016_DEFAULTS);
    const baseRow = matrix[0];
    // Column order: lt1, dk1, lt2, dk2, accent1-6
    expect(baseRow[0].hex).toBe('FFFFFF'); // lt1
    expect(baseRow[0].themeSlot).toBe('lt1');
    expect(baseRow[1].hex).toBe('000000'); // dk1
    expect(baseRow[1].themeSlot).toBe('dk1');
    expect(baseRow[4].hex).toBe('4472C4'); // accent1
    expect(baseRow[4].themeSlot).toBe('accent1');
  });

  test('base row cells have no tint/shade', () => {
    const matrix = generateThemeTintShadeMatrix(OFFICE_2016_DEFAULTS);
    for (const cell of matrix[0]) {
      expect(cell.tint).toBeUndefined();
      expect(cell.shade).toBeUndefined();
    }
  });

  test('tint rows (1-3) have tint values', () => {
    const matrix = generateThemeTintShadeMatrix(OFFICE_2016_DEFAULTS);
    expect(matrix[1][4].tint).toBe('CC'); // 80% tint
    expect(matrix[2][4].tint).toBe('99'); // 60% tint
    expect(matrix[3][4].tint).toBe('66'); // 40% tint
    // No shade on tint rows
    expect(matrix[1][4].shade).toBeUndefined();
  });

  test('shade rows (4-5) have shade values', () => {
    const matrix = generateThemeTintShadeMatrix(OFFICE_2016_DEFAULTS);
    expect(matrix[4][4].shade).toBe('BF'); // 25% darker
    expect(matrix[5][4].shade).toBe('80'); // 50% darker
    // No tint on shade rows
    expect(matrix[4][4].tint).toBeUndefined();
  });

  test('tinted colors are lighter than base', () => {
    const matrix = generateThemeTintShadeMatrix(OFFICE_2016_DEFAULTS);
    // accent1 base = 4472C4
    const baseHex = parseInt(matrix[0][4].hex.slice(0, 2), 16);
    const tintedHex = parseInt(matrix[1][4].hex.slice(0, 2), 16);
    // Tinted red channel should be higher (lighter)
    expect(tintedHex).toBeGreaterThan(baseHex);
  });

  test('shaded colors are darker than base', () => {
    const matrix = generateThemeTintShadeMatrix(OFFICE_2016_DEFAULTS);
    // accent1 base = 4472C4, blue channel
    const baseBlue = parseInt(matrix[0][4].hex.slice(4, 6), 16);
    const shadedBlue = parseInt(matrix[4][4].hex.slice(4, 6), 16);
    expect(shadedBlue).toBeLessThan(baseBlue);
  });

  test('labels include color name and variant', () => {
    const matrix = generateThemeTintShadeMatrix(OFFICE_2016_DEFAULTS);
    expect(matrix[0][4].label).toBe('Accent 1');
    expect(matrix[1][4].label).toBe('Accent 1, Lighter 80%');
    expect(matrix[4][4].label).toBe('Accent 1, Darker 25%');
  });

  test('falls back to Office 2016 defaults when no scheme provided', () => {
    const matrix = generateThemeTintShadeMatrix(null);
    expect(matrix[0][4].hex).toBe('4472C4'); // accent1 default
    expect(matrix[0][0].hex).toBe('FFFFFF'); // lt1 default
  });

  test('handles white theme color tints/shades', () => {
    const matrix = generateThemeTintShadeMatrix(OFFICE_2016_DEFAULTS);
    // lt1 = FFFFFF (white) - tinting white stays white
    expect(matrix[0][0].hex).toBe('FFFFFF');
    expect(matrix[1][0].hex).toBe('FFFFFF'); // tint of white = white
  });

  test('handles black theme color tints/shades', () => {
    const matrix = generateThemeTintShadeMatrix(OFFICE_2016_DEFAULTS);
    // dk1 = 000000 (black) - shading black stays black
    expect(matrix[4][1].hex).toBe('000000'); // shade of black
    expect(matrix[5][1].hex).toBe('000000');
    // Tinting black produces grays
    const tint80 = parseInt(matrix[1][1].hex.slice(0, 2), 16);
    expect(tint80).toBeGreaterThan(0);
  });
});

describe('getThemeTintShadeHex', () => {
  test('tint makes color lighter', () => {
    const result = getThemeTintShadeHex('4472C4', 'tint', 0.6);
    // Should be lighter than base
    const baseR = parseInt('44', 16);
    const resultR = parseInt(result.slice(0, 2), 16);
    expect(resultR).toBeGreaterThan(baseR);
  });

  test('shade makes color darker', () => {
    const result = getThemeTintShadeHex('4472C4', 'shade', 0.5);
    // Should be darker than base
    const baseR = parseInt('44', 16);
    const resultR = parseInt(result.slice(0, 2), 16);
    expect(resultR).toBeLessThan(baseR);
  });

  test('tint of 0 returns original color', () => {
    const result = getThemeTintShadeHex('FF0000', 'tint', 0);
    expect(result).toBe('FF0000');
  });

  test('shade of 1 returns original color', () => {
    const result = getThemeTintShadeHex('FF0000', 'shade', 1);
    expect(result).toBe('FF0000');
  });

  test('tint of 1 returns white', () => {
    const result = getThemeTintShadeHex('FF0000', 'tint', 1);
    expect(result).toBe('FFFFFF');
  });

  test('shade of 0 returns black', () => {
    const result = getThemeTintShadeHex('FF0000', 'shade', 0);
    expect(result).toBe('000000');
  });
});

describe('resolveColor — OOXML theme color resolution', () => {
  const theme: Theme = {
    colorScheme: OFFICE_2016_DEFAULTS,
  };

  test('resolves plain RGB color', () => {
    const result = resolveColor({ rgb: 'FF0000' }, theme);
    expect(result).toBe('#FF0000');
  });

  test('resolves theme color without modifiers', () => {
    const result = resolveColor({ themeColor: 'accent1' }, theme);
    expect(result).toBe('#4472C4');
  });

  // Regression tests for the OOXML tint/shade fix.
  // Per ECMA-376 §17.3.2.41, the tint/shade byte represents "how much of the
  // original color to keep": 0xFF = no change, 0x00 = fully white/black.

  test('themeTint "FF" (255) keeps original color', () => {
    // tintByte/255 = 1.0 → no change
    const result = resolveColor({ themeColor: 'accent1', themeTint: 'FF' }, theme);
    expect(result).toBe('#4472C4');
  });

  test('themeTint "00" (0) produces white', () => {
    const result = resolveColor({ themeColor: 'accent1', themeTint: '00' }, theme);
    expect(result).toBe('#FFFFFF');
  });

  test('themeTint "33" (0x33 = 20%) produces near-white with slight color', () => {
    // accent1 = #4472C4 → R=0x44(68), G=0x72(114), B=0xC4(196)
    // t = 51/255 ≈ 0.2; new_r = 68*0.2 + 255*0.8 = 13.6 + 204 = 217.6 ≈ 0xDA
    // new_g = 114*0.2 + 255*0.8 = 22.8 + 204 = 226.8 ≈ 0xE3
    // new_b = 196*0.2 + 255*0.8 = 39.2 + 204 = 243.2 ≈ 0xF3
    const result = resolveColor({ themeColor: 'accent1', themeTint: '33' }, theme);
    expect(result).toBe('#DAE3F3');
  });

  test('themeTint "99" (0x99 = 60%) produces medium-light variant', () => {
    // t = 153/255 ≈ 0.6; keep 60% color, add 40% white
    // new_r = 68*0.6 + 255*0.4 = 40.8 + 102 = 142.8 ≈ 0x8F
    // new_g = 114*0.6 + 255*0.4 = 68.4 + 102 = 170.4 ≈ 0xAA
    // new_b = 196*0.6 + 255*0.4 = 117.6 + 102 = 219.6 ≈ 0xDC
    const result = resolveColor({ themeColor: 'accent1', themeTint: '99' }, theme);
    expect(result).toBe('#8FAADC');
  });

  test('themeShade "FF" (255) keeps original color', () => {
    const result = resolveColor({ themeColor: 'accent1', themeShade: 'FF' }, theme);
    expect(result).toBe('#4472C4');
  });

  test('themeShade "00" (0) produces black', () => {
    const result = resolveColor({ themeColor: 'accent1', themeShade: '00' }, theme);
    expect(result).toBe('#000000');
  });

  test('themeShade "F2" (0x F2 ≈ 95%) slightly darkens color', () => {
    // accent1 = #4472C4; s = 242/255 ≈ 0.949
    // new_r = 68*0.949 ≈ 65 = 0x41
    // new_g = 114*0.949 ≈ 108 = 0x6C
    // new_b = 196*0.949 ≈ 186 = 0xBA
    const result = resolveColor({ themeColor: 'accent1', themeShade: 'F2' }, theme);
    expect(result).toBe('#416CBA');
  });

  test('background1 with shade "F2" (light gray) — matches Word table row shading', () => {
    // background1 (lt1) = FFFFFF
    // s = 242/255 ≈ 0.949; new_r = 255*0.949 ≈ 242 = 0xF2
    const result = resolveColor({ themeColor: 'background1', themeShade: 'F2' }, theme);
    expect(result).toBe('#F2F2F2');
  });

  test('auto color returns default', () => {
    const result = resolveColor({ auto: true }, theme);
    expect(result).toBe('#000000');
  });
});

describe('resolveColorToHex — shared display-side color resolution', () => {
  const theme: Theme = {
    colorScheme: OFFICE_2016_DEFAULTS,
  };

  test('returns undefined for missing fill', () => {
    expect(resolveColorToHex(undefined, theme)).toBeUndefined();
    expect(resolveColorToHex(null, theme)).toBeUndefined();
  });

  test('returns undefined for auto fill (transparent)', () => {
    expect(resolveColorToHex({ auto: true }, theme)).toBeUndefined();
  });

  test('returns undefined for rgb="auto"', () => {
    expect(resolveColorToHex({ rgb: 'auto' }, theme)).toBeUndefined();
  });

  test('returns 6-char uppercase hex for plain rgb', () => {
    expect(resolveColorToHex({ rgb: 'ff0000' }, theme)).toBe('FF0000');
  });

  test('resolves themeColor to rgb via theme', () => {
    expect(resolveColorToHex({ themeColor: 'accent1' }, theme)).toBe('4472C4');
  });

  test('applies themeTint correctly', () => {
    expect(resolveColorToHex({ themeColor: 'accent1', themeTint: '33' }, theme)).toBe('DAE3F3');
  });

  test('applies themeShade correctly', () => {
    expect(resolveColorToHex({ themeColor: 'background1', themeShade: 'F2' }, theme)).toBe(
      'F2F2F2'
    );
  });

  test('themeColor without theme falls back to rgb if present', () => {
    expect(
      resolveColorToHex({ themeColor: 'accent1', themeTint: '33', rgb: 'DAE3F3' }, undefined)
    ).toBe('DAE3F3');
  });

  test('themeColor without theme and no rgb fallback returns undefined', () => {
    expect(
      resolveColorToHex({ themeColor: 'accent1', themeTint: '33' }, undefined)
    ).toBeUndefined();
  });

  test('strips leading # from rgb', () => {
    expect(resolveColorToHex({ rgb: '#ABCDEF' }, theme)).toBe('ABCDEF');
  });
});
