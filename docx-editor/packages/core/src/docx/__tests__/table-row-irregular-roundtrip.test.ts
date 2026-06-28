/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Pin round-trip for irregular-row w:trPr children:
 *   <w:gridBefore w:val="N"/>     + <w:wBefore w:w=".." w:type=".."/>
 *   <w:gridAfter  w:val="N"/>     + <w:wAfter  w:w=".." w:type=".."/>
 *   <w:cnfStyle w:val="0000…"/>
 *
 * Form025U emits these to declare extra grid slots on rows that have
 * fewer painted cells than the table grid (partially-merged form
 * layouts). Before this commit scripts/roundtrip-audit.mjs flagged
 * 12 dropped w:trPr blocks, 1 gridAfter + 1 wAfter, 4 cnfStyle, and
 * the entire row collapsed to a no-op on save.
 */
import { describe, expect, test } from 'bun:test';
import type { XmlElement } from '../xmlParser';
import { parseXmlDocument } from '../xmlParser';
import { parseTableRowProperties } from '../tableParser';
import { serializeTableRowFormatting } from '../serializer/tableSerializer';

function roundTrip(innerXml: string): string {
  const trPrXml = `<w:trPr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${innerXml}</w:trPr>`;
  const root = parseXmlDocument(trPrXml) as XmlElement | null;
  if (!root) throw new Error('parse failed');
  const fmt = parseTableRowProperties(root);
  return serializeTableRowFormatting(fmt);
}

describe('irregular-row <w:trPr> children round-trip', () => {
  test('<w:gridAfter w:val="2"/> + <w:wAfter w:w="1288" w:type="dxa"/> survive', () => {
    const out = roundTrip('<w:gridAfter w:val="2"/><w:wAfter w:w="1288" w:type="dxa"/>');
    expect(out).toContain('<w:gridAfter w:val="2"/>');
    expect(out).toContain('<w:wAfter w:w="1288" w:type="dxa"/>');
  });

  test('gridBefore + wBefore symmetric path', () => {
    const out = roundTrip('<w:gridBefore w:val="1"/><w:wBefore w:w="500" w:type="dxa"/>');
    expect(out).toContain('<w:gridBefore w:val="1"/>');
    expect(out).toContain('<w:wBefore w:w="500" w:type="dxa"/>');
  });

  test('<w:cnfStyle w:val="100000000000"/> survives via the val-form', () => {
    const out = roundTrip('<w:cnfStyle w:val="100000000000" w:firstRow="1"/>');
    // The serializer emits the canonical 12-bit w:val form rather than
    // the individual per-flag attributes — Word accepts both.
    expect(out).toContain('<w:cnfStyle w:val="100000000000"/>');
  });

  test('coexists with trHeight + jc', () => {
    const out = roundTrip(
      '<w:gridAfter w:val="2"/>' +
        '<w:wAfter w:w="1288" w:type="dxa"/>' +
        '<w:trHeight w:val="284"/>' +
        '<w:jc w:val="center"/>'
    );
    expect(out).toContain('<w:gridAfter');
    expect(out).toContain('<w:wAfter');
    expect(out).toContain('<w:trHeight w:val="284"/>');
    expect(out).toContain('<w:jc w:val="center"/>');
  });

  test('empty trPr still emits nothing', () => {
    const out = roundTrip('');
    expect(out).toBe('');
  });
});
