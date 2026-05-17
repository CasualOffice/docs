/**
 * Pin per-paragraph <w:sectPr> round-trip — the schema-last child of
 * <w:pPr>, used to mark "this paragraph ends a section".
 *
 * Before this commit only the body-level (final) <w:sectPr> was
 * serialized. Multi-section docs (sds-real-world has 7) collapsed to
 * one section on save — scripts/roundtrip-audit.mjs flagged 15 dropped
 * w:type, 14 dropped w:col, 7 dropped w:cols among others, all from
 * intermediate sectPrs that never made it back to disk.
 */
import { describe, expect, test } from 'bun:test';
import type { XmlElement } from '../xmlParser';
import { parseXmlDocument } from '../xmlParser';
import { parseParagraph } from '../paragraphParser';
import { serializeParagraph } from '../serializer/paragraphSerializer';

function roundTrip(innerPpr: string): string {
  const pXml = `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:pPr>${innerPpr}</w:pPr>
    <w:r><w:t>section break</w:t></w:r>
  </w:p>`;
  const root = parseXmlDocument(pXml) as XmlElement | null;
  if (!root) throw new Error('parse failed');
  const para = parseParagraph(root, null, null, null, null, null);
  return serializeParagraph(para);
}

describe('per-paragraph <w:sectPr> round-trip', () => {
  test('continuous-section sectPr with cols + type survives', () => {
    const out = roundTrip(
      '<w:sectPr>' +
        '<w:type w:val="continuous"/>' +
        '<w:pgSz w:w="12240" w:h="15840"/>' +
        '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>' +
        '<w:cols w:num="2" w:equalWidth="0">' +
        '<w:col w:w="3163" w:space="40"/>' +
        '<w:col w:w="3163"/>' +
        '</w:cols>' +
        '</w:sectPr>'
    );
    expect(out).toContain('<w:sectPr>');
    expect(out).toContain('<w:type w:val="continuous"/>');
    expect(out).toContain('<w:cols w:num="2"');
    expect(out).toContain('<w:col w:w="3163" w:space="40"/>');
    expect(out).toContain('<w:col w:w="3163"/>');
    expect(out).toContain('</w:sectPr>');
  });

  test('<w:sectPr> sits inside <w:pPr> after other pPr children', () => {
    const out = roundTrip(
      '<w:pStyle w:val="Heading1"/>' +
        '<w:spacing w:before="240" w:after="120"/>' +
        '<w:sectPr><w:type w:val="continuous"/></w:sectPr>'
    );
    const pStyle = out.indexOf('<w:pStyle');
    const sect = out.indexOf('<w:sectPr');
    const pPrEnd = out.indexOf('</w:pPr>');
    expect(pStyle).toBeGreaterThan(0);
    expect(sect).toBeGreaterThan(pStyle);
    expect(pPrEnd).toBeGreaterThan(sect);
  });

  test('paragraph with no other pPr children still emits <w:pPr><w:sectPr/></w:pPr>', () => {
    const out = roundTrip('<w:sectPr><w:type w:val="nextPage"/></w:sectPr>');
    expect(out).toContain('<w:pPr><w:sectPr>');
    expect(out).toContain('<w:type w:val="nextPage"/>');
    expect(out).toContain('</w:sectPr></w:pPr>');
  });

  test('absent sectionProperties leaves <w:pPr> alone', () => {
    const out = roundTrip('<w:pStyle w:val="Normal"/>');
    expect(out).toContain('<w:pStyle');
    expect(out).not.toContain('<w:sectPr');
  });
});
