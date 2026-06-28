/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Pin parse + serialize round-trip for `<w:lang>` on runs.
 *
 * Before this fix, w:lang was silently dropped (693 occurrences across
 * 9 e2e fixtures per scripts/roundtrip-audit.mjs). The value isn't
 * acted on by the renderer, but losing it on save degrades
 * accessibility (screen readers / hyphenation) and re-introduces
 * spell-check noise the original author had suppressed via locale.
 */
import { describe, expect, test } from 'bun:test';
import type { XmlElement } from '../xmlParser';
import { parseXmlDocument } from '../xmlParser';
import { parseRunProperties } from '../runParser';
import { serializeTextFormatting } from '../serializer/runSerializer';

function parseRPr(innerXml: string) {
  const rPrXml = `<w:rPr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${innerXml}</w:rPr>`;
  const root = parseXmlDocument(rPrXml) as XmlElement | null;
  if (!root) throw new Error('Failed to parse rPr fixture');
  return parseRunProperties(root, null, undefined);
}

describe('w:lang round-trip on runs', () => {
  test('w:val (Latin script) survives parse + serialize', () => {
    const parsed = parseRPr('<w:lang w:val="en-US"/>');
    expect(parsed?.lang).toEqual({ val: 'en-US' });
    const out = serializeTextFormatting(parsed);
    expect(out).toContain('<w:lang w:val="en-US"/>');
  });

  test('w:eastAsia survives parse + serialize', () => {
    const parsed = parseRPr('<w:lang w:eastAsia="ja-JP"/>');
    expect(parsed?.lang).toEqual({ eastAsia: 'ja-JP' });
    expect(serializeTextFormatting(parsed)).toContain('<w:lang w:eastAsia="ja-JP"/>');
  });

  test('w:bidi survives parse + serialize', () => {
    const parsed = parseRPr('<w:lang w:bidi="ar-SA"/>');
    expect(parsed?.lang).toEqual({ bidi: 'ar-SA' });
    expect(serializeTextFormatting(parsed)).toContain('<w:lang w:bidi="ar-SA"/>');
  });

  test('all three attributes survive together', () => {
    const parsed = parseRPr('<w:lang w:val="en-US" w:eastAsia="ja-JP" w:bidi="ar-SA"/>');
    expect(parsed?.lang).toEqual({ val: 'en-US', eastAsia: 'ja-JP', bidi: 'ar-SA' });
    const out = serializeTextFormatting(parsed);
    expect(out).toContain('w:val="en-US"');
    expect(out).toContain('w:eastAsia="ja-JP"');
    expect(out).toContain('w:bidi="ar-SA"');
  });

  test('empty <w:lang/> with no attributes is not stored', () => {
    // Word allows a bare <w:lang/> in some places; treat as no-op since
    // we have nothing to round-trip.
    const parsed = parseRPr('<w:lang/>');
    expect(parsed?.lang).toBeUndefined();
  });

  test('coexists with other rPr children — bold + lang both preserved', () => {
    const parsed = parseRPr('<w:b/><w:lang w:val="fr-FR"/>');
    expect(parsed?.bold).toBe(true);
    expect(parsed?.lang).toEqual({ val: 'fr-FR' });
    const out = serializeTextFormatting(parsed);
    expect(out).toContain('<w:b/>');
    expect(out).toContain('<w:lang w:val="fr-FR"/>');
  });
});
