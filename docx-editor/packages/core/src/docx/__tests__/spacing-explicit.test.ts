/** Regression for #391 — paragraphParser flags `<w:spacing>` attrs that
 *  the paragraph wrote on its own pPr so the renderer can suppress style-
 *  inherited spacing on empty paragraphs. */

import { describe, test, expect } from 'bun:test';
import { parseParagraph } from '../paragraphParser';
import { parseXmlDocument, type XmlElement } from '../xmlParser';

function parsePara(xml: string) {
  const root = parseXmlDocument(xml) as XmlElement | null;
  if (!root) throw new Error('xml parse failed');
  return parseParagraph(root, null, null, null, null, null);
}

describe('paragraphParser spacingExplicit', () => {
  test('inline w:before is flagged', () => {
    const p =
      parsePara(`<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:pPr><w:spacing w:before="200"/></w:pPr>
    </w:p>`);
    expect(p.formatting?.spacingExplicit).toEqual({ before: true });
  });

  test('inline w:after only is flagged', () => {
    const p =
      parsePara(`<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:pPr><w:spacing w:after="100"/></w:pPr>
    </w:p>`);
    expect(p.formatting?.spacingExplicit).toEqual({ after: true });
  });

  test('inline both attrs', () => {
    const p =
      parsePara(`<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>
    </w:p>`);
    expect(p.formatting?.spacingExplicit).toEqual({ before: true, after: true });
  });

  test('paragraph without inline w:spacing has no explicit flags', () => {
    const p =
      parsePara(`<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:pPr><w:pStyle w:val="Normal"/></w:pPr>
    </w:p>`);
    expect(p.formatting?.spacingExplicit).toBeUndefined();
  });
});
