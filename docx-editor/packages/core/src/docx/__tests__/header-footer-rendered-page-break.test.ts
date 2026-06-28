/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/** Headers/footers reflow on every page; honoring `<w:lastRenderedPageBreak/>`
 *  inside an HF would force body-level page breaks for every header repetition. */

import { describe, test, expect } from 'bun:test';
import { parseHeader, parseFooter } from '../headerFooterParser';

const HEADER_WITH_RENDERED_BREAK = `<?xml version="1.0" encoding="UTF-8"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:r><w:lastRenderedPageBreak/><w:t>Header text</w:t></w:r>
  </w:p>
</w:hdr>`;

const FOOTER_WITH_RENDERED_BREAK = HEADER_WITH_RENDERED_BREAK.replace(/w:hdr/g, 'w:ftr').replace(
  'Header text',
  'Footer text'
);

const HEADER_TABLE_WITH_RENDERED_BREAK = `<?xml version="1.0" encoding="UTF-8"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:tbl>
    <w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid>
    <w:tr><w:tc>
      <w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr>
      <w:p>
        <w:r><w:lastRenderedPageBreak/><w:t>Header table cell</w:t></w:r>
      </w:p>
    </w:tc></w:tr>
  </w:tbl>
</w:hdr>`;

describe('headerFooterParser strips renderedPageBreakBefore', () => {
  test('paragraphs in headers do not carry renderedPageBreakBefore', () => {
    const hf = parseHeader(HEADER_WITH_RENDERED_BREAK);
    const para = hf.content[0] as { renderedPageBreakBefore?: boolean };
    expect(para.renderedPageBreakBefore).toBeUndefined();
  });

  test('paragraphs in footers do not carry renderedPageBreakBefore', () => {
    const hf = parseFooter(FOOTER_WITH_RENDERED_BREAK);
    const para = hf.content[0] as { renderedPageBreakBefore?: boolean };
    expect(para.renderedPageBreakBefore).toBeUndefined();
  });

  test('paragraphs nested inside table cells in a header are also stripped', () => {
    const hf = parseHeader(HEADER_TABLE_WITH_RENDERED_BREAK);
    const table = hf.content[0] as {
      type: 'table';
      rows: { cells: { content: { type: string; renderedPageBreakBefore?: boolean }[] }[] }[];
    };
    const para = table.rows[0].cells[0].content[0];
    expect(para.type).toBe('paragraph');
    expect(para.renderedPageBreakBefore).toBeUndefined();
  });
});
