import { describe, expect, test } from 'bun:test';
import { emuToPixels, emuToTwips, pixelsToEmu, twipsToEmu } from '../units';

describe('EMU conversions return integers', () => {
  // Word treats EMU attributes as xs:long; floating-point values like
  // (52 / 96) * 914400 === 495299.99999999994 cause "file is corrupt"
  // dialogs in Microsoft Word. See issue #417.

  test('pixelsToEmu rounds the IEEE-754 drift cases from issue #417', () => {
    // 52 px → 495299.99999999994 unrounded → 495300
    expect(pixelsToEmu(52)).toBe(495300);
    // 98 px → 933449.9999999999 unrounded → 933450
    expect(pixelsToEmu(98)).toBe(933450);
    // 25 px → 238125.00000000003 unrounded → 238125
    expect(pixelsToEmu(25)).toBe(238125);
    // 200 px → 1905000.0000000002 unrounded → 1905000
    expect(pixelsToEmu(200)).toBe(1905000);
  });

  test('pixelsToEmu always returns an integer for fractional pixel input', () => {
    for (let px = 1; px <= 800; px += 1) {
      expect(Number.isInteger(pixelsToEmu(px))).toBe(true);
    }
    expect(Number.isInteger(pixelsToEmu(123.456))).toBe(true);
  });

  test('twipsToEmu and emuToTwips round to integers', () => {
    expect(Number.isInteger(twipsToEmu(720))).toBe(true);
    expect(Number.isInteger(emuToTwips(914400))).toBe(true);
    expect(twipsToEmu(1440)).toBe(914400);
    expect(emuToTwips(914400)).toBe(1440);
  });

  test('emuToPixels still rounds and tolerates null/NaN', () => {
    expect(emuToPixels(914400)).toBe(96);
    expect(emuToPixels(null)).toBe(0);
    expect(emuToPixels(undefined)).toBe(0);
    expect(emuToPixels(NaN)).toBe(0);
  });
});
