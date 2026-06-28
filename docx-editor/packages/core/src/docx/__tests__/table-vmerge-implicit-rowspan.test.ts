/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Regression — `inferImplicitSingleCellRowSpans` must not expand a row whose
 * sole cell is a `<w:vMerge w:val="continue"/>` continuation, nor a row whose
 * sole cell explicitly sets `<w:gridSpan>`. Previous version blindly forced
 * gridSpan to maxColumns, corrupting tables with vertically merged columns
 * and tables that intentionally leave grid gaps.
 */

import { describe, test, expect } from 'bun:test';
import { parseTable } from '../tableParser';
import { parseXmlDocument, type XmlElement } from '../xmlParser';

function parseT(xml: string) {
  const root = parseXmlDocument(xml) as XmlElement | null;
  if (!root) throw new Error('xml parse failed');
  return parseTable(root, null, null, null, null, new Map());
}

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

describe('inferImplicitSingleCellRowSpans', () => {
  test('does not expand a vMerge continuation single-cell row', () => {
    const xml = `<w:tbl ${NS}>
      <w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/><w:vMerge w:val="restart"/></w:tcPr><w:p/></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr><w:p/></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr><w:p/></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/><w:vMerge/></w:tcPr><w:p/></w:tc>
      </w:tr>
    </w:tbl>`;
    const t = parseT(xml);
    expect(t.rows[1].cells.length).toBe(1);
    // Continuation cell stays at gridSpan 1; the renderer infers width from
    // the column above, not from a forced full-row span.
    expect(t.rows[1].cells[0].formatting?.gridSpan ?? 1).toBe(1);
  });

  test('vMerge continuation + sparse single-cell rows + explicit gridSpan in same table', () => {
    // Combined edge case: row 0 sets up a vMerge restart, row 1 carries the
    // continuation, row 2 has a single cell with explicit gridSpan=2 (must
    // stay 2, not be promoted to 3), and row 3 has a sparse single cell with
    // no annotations (still gets the implicit full-row expansion).
    const xml = `<w:tbl ${NS}>
      <w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/><w:vMerge w:val="restart"/></w:tcPr><w:p/></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr><w:p/></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr><w:p/></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/><w:vMerge/></w:tcPr><w:p/></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/><w:gridSpan w:val="2"/></w:tcPr><w:p/></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="6000" w:type="dxa"/></w:tcPr><w:p/></w:tc>
      </w:tr>
    </w:tbl>`;
    const t = parseT(xml);
    expect(t.rows[1].cells[0].formatting?.gridSpan ?? 1).toBe(1);
    expect(t.rows[2].cells[0].formatting?.gridSpan).toBe(2);
    expect(t.rows[3].cells[0].formatting?.gridSpan).toBe(3);
  });

  test('still expands a single-cell row with no vMerge or explicit gridSpan', () => {
    const xml = `<w:tbl ${NS}>
      <w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr><w:p/></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr><w:p/></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr><w:p/></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="6000" w:type="dxa"/></w:tcPr><w:p/></w:tc>
      </w:tr>
    </w:tbl>`;
    const t = parseT(xml);
    expect(t.rows[1].cells[0].formatting?.gridSpan).toBe(3);
  });
});
