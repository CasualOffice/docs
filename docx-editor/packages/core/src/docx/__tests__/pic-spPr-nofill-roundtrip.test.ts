/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Pins `<a:noFill/>` and `<a:ln><a:noFill/></a:ln>` emission in
 * `<pic:spPr>` when an image has no explicit fill / outline.
 *
 * Before this fix the audit at scripts/roundtrip-audit.mjs surfaced 35
 * dropped `a:noFill` instances across 6 fixtures. Most live in
 * `pic:spPr` (Word's default for picture shape properties: "no fill
 * behind the image" + "no outline"). We were emitting neither, so the
 * elements vanished on round-trip — structural-only, but matters for
 * downstream consumers that diff document.xml literally and for
 * Word's own "is this file from us or from Word" heuristics.
 */
import { describe, expect, test } from 'bun:test';
import type { DrawingContent, Image } from '../../types/document';
import { serializeRun } from '../serializer/runSerializer';

function imageRun(overrides: Partial<Image> = {}) {
  const image: Image = {
    type: 'image',
    rId: 'rId7',
    src: 'media/image1.png',
    size: { width: 914400, height: 914400 }, // 1in × 1in EMU
    wrap: { type: 'inline' },
    ...overrides,
  };
  const drawing: DrawingContent = { type: 'drawing', image };
  return serializeRun({ type: 'run', content: [drawing] });
}

describe('pic:spPr a:noFill round-trip', () => {
  test('inline image with no outline emits pic:spPr > a:noFill', () => {
    const xml = imageRun();
    // Both the fill slot and the outline slot ("no outline") materialize.
    expect(xml).toContain('<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/>');
    expect(xml).toContain('<a:ln><a:noFill/></a:ln>');
  });

  test('image with an explicit outline emits the outline (not the no-outline placeholder)', () => {
    const xml = imageRun({
      outline: { width: 12700, color: { rgb: 'FF0000' } },
    });
    expect(xml).toContain('<a:ln w="12700">');
    expect(xml).toContain('<a:solidFill><a:srgbClr val="FF0000"/></a:solidFill>');
    // Per-shape fill is still `noFill` (we never store an explicit image fill).
    expect(xml).toContain('<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/>');
    // The `<a:ln><a:noFill/></a:ln>` placeholder is NOT emitted when a real outline exists.
    expect(xml).not.toContain('<a:ln><a:noFill/></a:ln>');
  });
});
