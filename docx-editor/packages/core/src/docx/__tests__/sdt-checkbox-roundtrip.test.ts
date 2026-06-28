/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Pin round-trip for SDT form-checkbox properties.
 *
 * scripts/roundtrip-audit.mjs flagged 5 drops × 8 occurrences each in
 * medical-incident-form (40 total): w14:checkbox, w14:checked,
 * w14:checkedState, w14:uncheckedState, w15:color, w:id. The cause was
 * twofold:
 *
 *   1. parseSdtProperties stripped only `w:` prefixes, so
 *      <w14:checkbox> was never matched by the `'checkbox'` case.
 *   2. serializeInlineSdt only emitted <w14:checked>, never the
 *      checkedState/uncheckedState glyph pair, the SDT id, or the
 *      w15:color review hint.
 *
 * Both ends now handle the full ECMA-376 (+w14/w15) shape.
 */
import { describe, expect, test } from 'bun:test';
import type { XmlElement } from '../xmlParser';
import { parseXmlDocument } from '../xmlParser';
import { parseParagraph } from '../paragraphParser';
import { serializeParagraph } from '../serializer/paragraphSerializer';

function roundTrip(innerSdtPrXml: string): { out: string } {
  const pXml = `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
                     xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
                     xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml">
    <w:sdt>
      <w:sdtPr>${innerSdtPrXml}</w:sdtPr>
      <w:sdtContent>
        <w:r><w:sym w:font="Wingdings 2" w:char="F0A3"/></w:r>
      </w:sdtContent>
    </w:sdt>
  </w:p>`;
  const root = parseXmlDocument(pXml) as XmlElement | null;
  if (!root) throw new Error('parse failed');
  const para = parseParagraph(root, null, null, null, null, null);
  return { out: serializeParagraph(para) };
}

describe('SDT checkbox round-trip', () => {
  test('w14:checkbox with full glyph pair survives parse + serialize', () => {
    const { out } = roundTrip(
      '<w:id w:val="1613008741"/>' +
        '<w15:color w:val="33CCCC"/>' +
        '<w14:checkbox>' +
        '<w14:checked w14:val="0"/>' +
        '<w14:checkedState w14:val="0052" w14:font="Wingdings 2"/>' +
        '<w14:uncheckedState w14:val="00A3" w14:font="Wingdings 2"/>' +
        '</w14:checkbox>'
    );
    expect(out).toContain('<w:id w:val="1613008741"/>');
    expect(out).toContain('<w15:color w:val="33CCCC"/>');
    expect(out).toContain('<w14:checkbox>');
    expect(out).toContain('<w14:checked w14:val="0"/>');
    expect(out).toContain('<w14:checkedState w14:val="0052" w14:font="Wingdings 2"/>');
    expect(out).toContain('<w14:uncheckedState w14:val="00A3" w14:font="Wingdings 2"/>');
    expect(out).toContain('</w14:checkbox>');
  });

  test('a checked-true checkbox round-trips with val="1"', () => {
    const { out } = roundTrip(
      '<w14:checkbox>' +
        '<w14:checked w14:val="1"/>' +
        '<w14:checkedState w14:val="2611" w14:font="MS Gothic"/>' +
        '<w14:uncheckedState w14:val="2610" w14:font="MS Gothic"/>' +
        '</w14:checkbox>'
    );
    expect(out).toContain('<w14:checked w14:val="1"/>');
    expect(out).toContain('w14:font="MS Gothic"');
  });

  test('checkbox without explicit glyph pair still round-trips the checked flag', () => {
    const { out } = roundTrip('<w14:checkbox><w14:checked w14:val="0"/></w14:checkbox>');
    expect(out).toContain('<w14:checkbox><w14:checked w14:val="0"/></w14:checkbox>');
    // No spurious empty checkedState/uncheckedState emitted.
    expect(out).not.toContain('<w14:checkedState');
    expect(out).not.toContain('<w14:uncheckedState');
  });
});
