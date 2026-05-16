/**
 * Custom-hex highlight color roundtrip — openspec
 * `ooxml-roundtrip-fidelity` Problem #1.
 *
 * Predefined OOXML highlight color names (yellow, green, cyan, etc.)
 * roundtrip cleanly via `<w:highlight w:val="..."/>`. Custom hex colors
 * can't use `<w:highlight>` (the element only accepts the named-color
 * enum per ECMA-376 §17.18.40), so the serializer falls back to
 * `<w:shd w:val="clear" w:color="auto" w:fill="HEX"/>` (run-level
 * shading), which Word preserves.
 *
 * The parser used to read `<w:shd>` ONLY into `formatting.shading` —
 * NOT back into `formatting.highlight`. The user's "highlight" lost its
 * semantic label inside the model so the highlight toolbar button
 * couldn't show "active" and toggling highlight off didn't clear it.
 *
 * Fix: when run-level `<w:shd>` is parsed and no explicit `<w:highlight>`
 * is present alongside it, the parser also sets `formatting.highlight`
 * to the shading fill's rgb. The fill stays in `formatting.shading`
 * verbatim too (so any code that reads shading directly is unaffected).
 *
 * These tests pin the round-trip: custom-color highlight in → custom-
 * color highlight out.
 */

import { describe, test, expect } from 'bun:test';
import { parseRunProperties } from '../runParser';
import { serializeTextFormatting } from '../serializer/runSerializer';
import { parseXml } from '../xmlParser';
import type { XmlElement } from '../xmlParser';
import type { TextFormatting } from '../../types/document';

/** Wrap raw inner XML in <w:rPr> and parse to an XmlElement. */
function parseInnerRPr(innerXml: string): XmlElement {
  const doc = parseXml(
    `<w:rPr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${innerXml}</w:rPr>`
  );
  return (doc.elements as XmlElement[])[0];
}

/** Parse an already-wrapped <w:rPr> string (e.g. serializer output). */
function parseWrappedRPr(rPrXml: string): XmlElement {
  // serializeTextFormatting omits namespace decls; reattach so parseXml
  // can resolve the `w:` prefix.
  const withNs = rPrXml.replace(
    /^<w:rPr/,
    '<w:rPr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
  );
  const doc = parseXml(withNs);
  return (doc.elements as XmlElement[])[0];
}

describe('Custom-hex highlight roundtrip (openspec ooxml-roundtrip-fidelity #1)', () => {
  test('a custom hex highlight serializes to <w:shd> (valid OOXML)', () => {
    const formatting = {
      highlight: 'FFEB3B' as TextFormatting['highlight'],
    } as TextFormatting;
    const serialized = serializeTextFormatting(formatting);
    expect(serialized).not.toMatch(/<w:highlight\b/);
    expect(serialized).toContain('<w:shd');
    expect(serialized).toContain('w:fill="FFEB3B"');
  });

  test('a serialized custom-hex highlight round-trips back to formatting.highlight', () => {
    const original = {
      highlight: 'FFEB3B' as TextFormatting['highlight'],
    } as TextFormatting;
    const serialized = serializeTextFormatting(original);

    const rPr = parseWrappedRPr(serialized);
    const reparsed = parseRunProperties(rPr, null);
    expect(reparsed?.highlight).toBe('FFEB3B');
  });

  test('a named highlight + a separate custom run-shading both round-trip independently', () => {
    const rPr = parseInnerRPr(
      '<w:highlight w:val="yellow"/><w:shd w:val="clear" w:color="auto" w:fill="ABCDEF"/>'
    );
    const parsed = parseRunProperties(rPr, null);
    expect(parsed?.highlight).toBe('yellow');
    expect(parsed?.shading?.fill?.rgb).toBe('ABCDEF');
  });

  test('lowercase hex round-trips stably (case-insensitive equality)', () => {
    const formatting = {
      highlight: 'ffeb3b' as TextFormatting['highlight'],
    } as TextFormatting;
    const serialized = serializeTextFormatting(formatting);
    expect(serialized).toContain('<w:shd');
    const rPr = parseWrappedRPr(serialized);
    const reparsed = parseRunProperties(rPr, null);
    expect(reparsed?.highlight?.toLowerCase()).toBe('ffeb3b');
  });

  test('shd alone (without highlight) is also exposed as highlight on parse', () => {
    // The case that triggers the round-trip fix directly: parser sees
    // run-level <w:shd> with no <w:highlight> sibling — should populate
    // both formatting.shading and formatting.highlight.
    const rPr = parseInnerRPr('<w:shd w:val="clear" w:color="auto" w:fill="FFEB3B"/>');
    const parsed = parseRunProperties(rPr, null);
    expect(parsed?.shading?.fill?.rgb).toBe('FFEB3B');
    expect(parsed?.highlight).toBe('FFEB3B');
  });
});
