/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Pin <w:textAlignment> + <w:overflowPunct> round-trip in <w:pPr>.
 *
 * scripts/roundtrip-audit.mjs flagged 8 dropped w:textAlignment and
 * 8 dropped w:overflowPunct (both in issue-319-sections). Neither
 * drives our rendering yet, but losing them on save degrades
 * East-Asian / Hebrew typography on doc reopen.
 */
import { describe, expect, test } from 'bun:test';
import type { XmlElement } from '../xmlParser';
import { parseXmlDocument } from '../xmlParser';
import { parseParagraphProperties } from '../paragraphParser';
import { serializeParagraphFormatting } from '../serializer/paragraphSerializer';

function roundTrip(innerXml: string): string {
  const pPrXml = `<w:pPr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${innerXml}</w:pPr>`;
  const root = parseXmlDocument(pPrXml) as XmlElement | null;
  if (!root) throw new Error('parse failed');
  const fmt = parseParagraphProperties(root, null);
  return serializeParagraphFormatting(fmt);
}

describe('<w:textAlignment> + <w:overflowPunct> round-trip', () => {
  test('<w:textAlignment w:val="baseline"/> survives', () => {
    const out = roundTrip('<w:textAlignment w:val="baseline"/>');
    expect(out).toContain('<w:textAlignment w:val="baseline"/>');
  });

  test('every spec value survives', () => {
    for (const v of ['top', 'center', 'baseline', 'bottom', 'auto']) {
      const out = roundTrip(`<w:textAlignment w:val="${v}"/>`);
      expect(out).toContain(`<w:textAlignment w:val="${v}"/>`);
    }
  });

  test('unknown w:val is dropped (defensive)', () => {
    const out = roundTrip('<w:textAlignment w:val="bogus"/>');
    expect(out).not.toContain('bogus');
  });

  test('<w:overflowPunct w:val="0"/> survives as explicit-false', () => {
    const out = roundTrip('<w:overflowPunct w:val="0"/>');
    expect(out).toContain('<w:overflowPunct w:val="0"/>');
  });

  test('coexists with autoSpaceDE / DN', () => {
    const out = roundTrip(
      '<w:overflowPunct w:val="0"/>' +
        '<w:autoSpaceDE w:val="0"/>' +
        '<w:autoSpaceDN w:val="0"/>' +
        '<w:textAlignment w:val="baseline"/>'
    );
    expect(out).toContain('<w:overflowPunct w:val="0"/>');
    expect(out).toContain('<w:autoSpaceDE w:val="0"/>');
    expect(out).toContain('<w:autoSpaceDN w:val="0"/>');
    expect(out).toContain('<w:textAlignment w:val="baseline"/>');
  });
});
