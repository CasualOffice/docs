/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Pins `<w:cols>` round-trip for the common default cases.
 *
 * Word emits `<w:cols w:space="708"/>` even for single-column sections
 * to capture the default inter-column gutter. The serializer was
 * bailing whenever `columnCount` was undefined — which is exactly
 * what the parser produces for that default form — so the element
 * vanished on round-trip across 10+ fixtures
 * (scripts/roundtrip-audit.mjs).
 */
import { describe, expect, test } from 'bun:test';
import type { SectionProperties } from '../../types/document';
import { serializeSectionProperties } from '../serializer/documentSerializer';

function emit(props: SectionProperties): string {
  return serializeSectionProperties(props);
}

describe('<w:cols> round-trip', () => {
  test('single-column default <w:cols w:space="708"/> survives', () => {
    const xml = emit({ columnSpace: 708 });
    expect(xml).toContain('<w:cols w:space="708"/>');
  });

  test('multi-column section emits w:num + w:col children', () => {
    const xml = emit({
      columnCount: 2,
      equalWidth: false,
      columns: [{ width: 3163, space: 40 }, { width: 3163 }],
    });
    expect(xml).toContain('<w:cols w:num="2"');
    expect(xml).toContain('w:equalWidth="0"');
    expect(xml).toContain('<w:col w:w="3163" w:space="40"/>');
    expect(xml).toContain('<w:col w:w="3163"/>');
  });

  test('section with no column fields emits no <w:cols>', () => {
    // Sections that genuinely have no column declaration should still
    // produce no <w:cols/> element.
    const xml = emit({});
    expect(xml).not.toContain('<w:cols');
  });

  test('separator + space preserved together', () => {
    const xml = emit({ columnSpace: 720, separator: true });
    expect(xml).toContain('w:space="720"');
    expect(xml).toContain('w:sep="1"');
  });
});
