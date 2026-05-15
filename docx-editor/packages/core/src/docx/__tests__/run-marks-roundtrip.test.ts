import { describe, test, expect } from 'bun:test';
import { parseRunProperties } from '../runParser';
import { serializeTextFormatting } from '../serializer/runSerializer';
import { parseXml } from '../xmlParser';
import type { XmlElement } from '../xmlParser';
import type { TextEffect } from '../../types/formatting';

function parseRPr(xml: string): XmlElement {
  const doc = parseXml(
    `<w:rPr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${xml}</w:rPr>`
  );
  return (doc.elements as XmlElement[])[0];
}

function roundTrip(innerXml: string) {
  const rPr = parseRPr(innerXml);
  const formatting = parseRunProperties(rPr, null);
  const serialized = serializeTextFormatting(formatting);
  return { formatting, serialized };
}

// ============================================================================
// w:vanish — hidden text (Gap 9)
// ============================================================================

describe('w:vanish round-trip', () => {
  test('parse and re-serialize', () => {
    const { formatting, serialized } = roundTrip('<w:vanish/>');
    expect(formatting?.hidden).toBe(true);
    expect(serialized).toContain('<w:vanish/>');
  });

  test('explicit w:val="false" disables hidden', () => {
    const { formatting } = roundTrip('<w:vanish w:val="false"/>');
    expect(formatting?.hidden).toBeFalsy();
  });

  test('absent w:vanish leaves hidden undefined', () => {
    const { formatting, serialized } = roundTrip('<w:b/>');
    expect(formatting?.hidden).toBeUndefined();
    expect(serialized).not.toContain('w:vanish');
  });
});

// ============================================================================
// w:rtl — per-run direction (Gap 10)
// ============================================================================

describe('w:rtl round-trip', () => {
  test('parse and re-serialize', () => {
    const { formatting, serialized } = roundTrip('<w:rtl/>');
    expect(formatting?.rtl).toBe(true);
    expect(serialized).toContain('<w:rtl/>');
  });

  test('absent w:rtl leaves rtl undefined', () => {
    const { formatting, serialized } = roundTrip('<w:i/>');
    expect(formatting?.rtl).toBeUndefined();
    expect(serialized).not.toContain('w:rtl');
  });
});

// ============================================================================
// w:effect — legacy text animations (Gap 11)
// ============================================================================

describe('w:effect round-trip', () => {
  test('blinkBackground round-trips through formatting.effect', () => {
    const { formatting, serialized } = roundTrip('<w:effect w:val="blinkBackground"/>');
    expect(formatting?.effect).toBe('blinkBackground');
    expect(serialized).toContain('<w:effect w:val="blinkBackground"/>');
  });

  const VARIANTS: TextEffect[] = ['lights', 'antsBlack', 'antsRed', 'shimmer', 'sparkle'];
  test.each(VARIANTS.map((v) => [v]))('all spec values round-trip: %s', (variant) => {
    const { formatting, serialized } = roundTrip(`<w:effect w:val="${variant}"/>`);
    expect(formatting?.effect).toBe(variant);
    expect(serialized).toContain(`<w:effect w:val="${variant}"/>`);
  });

  test('w:val="none" results in no effect', () => {
    const { formatting, serialized } = roundTrip('<w:effect w:val="none"/>');
    // The serializer skips effects when value is "none" — round-trip stays clean.
    expect(serialized).not.toContain('<w:effect');
    // Parser may still set formatting.effect = "none" for fidelity, that's fine.
    if (formatting?.effect !== undefined) {
      expect(formatting.effect).toBe('none');
    }
  });
});
