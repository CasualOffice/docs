/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Pins round-trip for a batch of boolean flag round-trips that
 * scripts/roundtrip-audit.mjs surfaced (546 occurrences total before
 * this commit):
 *
 *   - <w:noProof>      / <w:webHidden>            on runs (rPr)
 *   - <w:autoSpaceDE>  / <w:autoSpaceDN>          on paragraphs (pPr)
 *   - <w:adjustRightInd>                          on paragraphs (pPr)
 *
 * None drive any of our rendering, but losing them on save:
 *   - re-introduces spell-check noise the author had silenced (noProof)
 *   - silently re-enables East-Asian auto-spacing rules that may
 *     reflow tight CJK layouts
 *
 * The pPr flags default to *true* in OOXML — Word only writes them out
 * when explicitly disabled (`w:val="0"`).
 */
import { describe, expect, test } from 'bun:test';
import type { XmlElement } from '../xmlParser';
import { parseXmlDocument } from '../xmlParser';
import { parseRunProperties } from '../runParser';
import { parseParagraphProperties } from '../paragraphParser';
import { serializeTextFormatting } from '../serializer/runSerializer';
import { serializeParagraphFormatting } from '../serializer/paragraphSerializer';

function parseRPr(innerXml: string) {
  const rPrXml = `<w:rPr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${innerXml}</w:rPr>`;
  const root = parseXmlDocument(rPrXml) as XmlElement | null;
  if (!root) throw new Error('parse failure');
  return parseRunProperties(root, null, undefined);
}

function parsePPr(innerXml: string) {
  const pPrXml = `<w:pPr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${innerXml}</w:pPr>`;
  const root = parseXmlDocument(pPrXml) as XmlElement | null;
  if (!root) throw new Error('parse failure');
  return parseParagraphProperties(root, null);
}

describe('w:noProof + w:webHidden round-trip on runs', () => {
  test('<w:noProof/> round-trips as true', () => {
    const fmt = parseRPr('<w:noProof/>');
    expect(fmt?.noProof).toBe(true);
    expect(serializeTextFormatting(fmt)).toContain('<w:noProof/>');
  });

  test('<w:webHidden/> round-trips as true', () => {
    const fmt = parseRPr('<w:webHidden/>');
    expect(fmt?.webHidden).toBe(true);
    expect(serializeTextFormatting(fmt)).toContain('<w:webHidden/>');
  });

  test('coexists with other rPr children', () => {
    const fmt = parseRPr('<w:b/><w:noProof/><w:webHidden/>');
    expect(fmt?.bold).toBe(true);
    expect(fmt?.noProof).toBe(true);
    expect(fmt?.webHidden).toBe(true);
    const out = serializeTextFormatting(fmt);
    expect(out).toContain('<w:b/>');
    expect(out).toContain('<w:noProof/>');
    expect(out).toContain('<w:webHidden/>');
  });
});

describe('East-Asian spacing flags round-trip on paragraphs', () => {
  test('<w:autoSpaceDE w:val="0"/> survives', () => {
    const fmt = parsePPr('<w:autoSpaceDE w:val="0"/>');
    expect(fmt?.autoSpaceDE).toBe(false);
    expect(serializeParagraphFormatting(fmt)).toContain('<w:autoSpaceDE w:val="0"/>');
  });

  test('<w:autoSpaceDN w:val="0"/> survives', () => {
    const fmt = parsePPr('<w:autoSpaceDN w:val="0"/>');
    expect(fmt?.autoSpaceDN).toBe(false);
    expect(serializeParagraphFormatting(fmt)).toContain('<w:autoSpaceDN w:val="0"/>');
  });

  test('<w:adjustRightInd w:val="0"/> survives', () => {
    const fmt = parsePPr('<w:adjustRightInd w:val="0"/>');
    expect(fmt?.adjustRightInd).toBe(false);
    expect(serializeParagraphFormatting(fmt)).toContain('<w:adjustRightInd w:val="0"/>');
  });

  test('all three coexisting survive together', () => {
    const fmt = parsePPr(
      '<w:autoSpaceDE w:val="0"/><w:autoSpaceDN w:val="0"/><w:adjustRightInd w:val="0"/>'
    );
    const out = serializeParagraphFormatting(fmt);
    expect(out).toContain('<w:autoSpaceDE w:val="0"/>');
    expect(out).toContain('<w:autoSpaceDN w:val="0"/>');
    expect(out).toContain('<w:adjustRightInd w:val="0"/>');
  });

  test('explicit-true round-trips as the bare element', () => {
    // A doc that explicitly enables (rather than relying on default).
    const fmt = parsePPr('<w:autoSpaceDE w:val="1"/>');
    expect(fmt?.autoSpaceDE).toBe(true);
    expect(serializeParagraphFormatting(fmt)).toContain('<w:autoSpaceDE/>');
  });
});
