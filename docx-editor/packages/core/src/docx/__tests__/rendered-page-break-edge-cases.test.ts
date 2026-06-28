/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/** Edge cases for `paragraphStartsWithRenderedPageBreak`. */

import { describe, test, expect } from 'bun:test';
import { parseParagraph } from '../paragraphParser';
import { parseXmlDocument, type XmlElement } from '../xmlParser';

function parsePara(xml: string) {
  const root = parseXmlDocument(xml) as XmlElement | null;
  if (!root) throw new Error('xml parse failed');
  return parseParagraph(root, null, null, null, null, null);
}

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

describe('renderedPageBreakBefore — edge cases', () => {
  test('lastRenderedPageBreak after an empty rPr-only first run still counts', () => {
    // Word frequently emits an empty leading run carrying only rPr.
    const p = parsePara(`<w:p ${NS}>
      <w:r><w:rPr><w:b/></w:rPr></w:r>
      <w:r><w:lastRenderedPageBreak/><w:t>After</w:t></w:r>
    </w:p>`);
    expect(p.renderedPageBreakBefore).toBe(true);
  });

  test('lastRenderedPageBreak inside a hyperlink wrapper is honored', () => {
    const p = parsePara(`<w:p ${NS}>
      <w:hyperlink>
        <w:r><w:lastRenderedPageBreak/><w:t>Hyper</w:t></w:r>
      </w:hyperlink>
    </w:p>`);
    expect(p.renderedPageBreakBefore).toBe(true);
  });

  test('lastRenderedPageBreak inside an SDT wrapper is honored', () => {
    const p = parsePara(`<w:p ${NS}>
      <w:sdt><w:sdtContent>
        <w:r><w:lastRenderedPageBreak/><w:t>Wrapped</w:t></w:r>
      </w:sdtContent></w:sdt>
    </w:p>`);
    expect(p.renderedPageBreakBefore).toBe(true);
  });

  test('lastRenderedPageBreak followed only by another empty run does NOT mark', () => {
    const p = parsePara(`<w:p ${NS}>
      <w:r><w:lastRenderedPageBreak/></w:r>
      <w:r><w:rPr/></w:r>
    </w:p>`);
    expect(p.renderedPageBreakBefore).toBeUndefined();
  });

  test('field-instruction text counts as visible content', () => {
    const p = parsePara(`<w:p ${NS}>
      <w:r><w:lastRenderedPageBreak/><w:instrText>PAGE</w:instrText></w:r>
    </w:p>`);
    expect(p.renderedPageBreakBefore).toBe(true);
  });
});
