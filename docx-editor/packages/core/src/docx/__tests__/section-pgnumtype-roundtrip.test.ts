/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Pins `<w:pgNumType>` round-trip.
 *
 * Affects 4 fixtures in the round-trip audit. Two forms in the wild:
 *   <w:pgNumType w:fmt="decimal"/>         (3 fixtures)
 *   <w:pgNumType w:start="1"/>             (1 fixture)
 *
 * The parser was missing the element entirely, so both forms vanished
 * on save. This test pins the round-trip for both at the section-prop
 * serializer level, plus the full parse→model→serialize loop via the
 * XML parser to catch any future regression in either layer.
 */

import { describe, expect, test } from 'bun:test';
import type { SectionProperties } from '../../types/document';
import { serializeSectionProperties } from '../serializer/documentSerializer';
import { parseSectionProperties } from '../sectionParser';
import { parseXml } from '../xmlParser';
import type { XmlElement } from '../xmlParser';

function emit(props: SectionProperties): string {
  return serializeSectionProperties(props);
}

function findSectPr(node: XmlElement): XmlElement | null {
  if (node.name === 'w:sectPr' || node.name?.endsWith(':sectPr')) return node;
  for (const child of node.elements ?? []) {
    if (child.type === 'element') {
      const found = findSectPr(child);
      if (found) return found;
    }
  }
  return null;
}

function parseSectPr(xml: string): SectionProperties {
  const root = parseXml(
    `<?xml version="1.0"?><w:root xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${xml}</w:root>`
  );
  const sectPr = findSectPr(root);
  if (!sectPr) throw new Error('no sectPr in test input');
  return parseSectionProperties(sectPr);
}

describe('<w:pgNumType> round-trip', () => {
  test('serializer emits w:fmt only', () => {
    const xml = emit({ pageNumberType: { fmt: 'decimal' } });
    expect(xml).toContain('<w:pgNumType w:fmt="decimal"/>');
  });

  test('serializer emits w:start only', () => {
    const xml = emit({ pageNumberType: { start: 1 } });
    expect(xml).toContain('<w:pgNumType w:start="1"/>');
  });

  test('serializer emits all four attributes when present', () => {
    const xml = emit({
      pageNumberType: { start: 5, fmt: 'lowerRoman', chapStyle: 2, chapSep: 'emDash' },
    });
    expect(xml).toContain('<w:pgNumType');
    expect(xml).toContain('w:fmt="lowerRoman"');
    expect(xml).toContain('w:start="5"');
    expect(xml).toContain('w:chapStyle="2"');
    expect(xml).toContain('w:chapSep="emDash"');
  });

  test('serializer omits the element entirely when no pageNumberType is set', () => {
    expect(emit({})).not.toContain('<w:pgNumType');
  });

  test('parser round-trips w:fmt-only form (3 fixtures in the wild)', () => {
    const inputXml = '<w:sectPr><w:pgNumType w:fmt="decimal"/></w:sectPr>';
    const props = parseSectPr(inputXml);
    expect(props.pageNumberType).toBeDefined();
    expect(props.pageNumberType!.fmt).toBe('decimal');
    expect(props.pageNumberType!.start).toBeUndefined();

    const reEmitted = emit(props);
    expect(reEmitted).toContain('<w:pgNumType w:fmt="decimal"/>');
  });

  test('parser round-trips w:start-only form (sds-real-world.docx)', () => {
    const inputXml = '<w:sectPr><w:pgNumType w:start="1"/></w:sectPr>';
    const props = parseSectPr(inputXml);
    expect(props.pageNumberType).toBeDefined();
    expect(props.pageNumberType!.start).toBe(1);
    expect(props.pageNumberType!.fmt).toBeUndefined();

    const reEmitted = emit(props);
    expect(reEmitted).toContain('<w:pgNumType w:start="1"/>');
  });

  test('parser ignores unrecognized chapSep values', () => {
    // The spec defines only hyphen / period / colon / emDash / enDash.
    const inputXml = '<w:sectPr><w:pgNumType w:chapSep="garbage"/></w:sectPr>';
    const props = parseSectPr(inputXml);
    // pgNumType should be absent because no valid attrs landed.
    expect(props.pageNumberType).toBeUndefined();
  });
});
