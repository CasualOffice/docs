/**
 * Build a small 3-column × 3-row table fixture so we can drag each
 * inter-column resize handle and assert the widths update on the
 * column we intend (not just the last column).
 *
 * The matrix entry `table-column-resize` says only the last column
 * grows on drag. Same verify-then-pin pattern as the other table
 * fidelity audits today — repro it as a test first.
 *
 * Output: e2e/fixtures/table-column-resize.docx
 */
import JSZip from 'jszip';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, '..');
const OUT = join(projectRoot, 'e2e/fixtures/table-column-resize.docx');

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function run(text) {
  return `<w:r><w:t>${esc(text)}</w:t></w:r>`;
}
function para(text) {
  return `<w:p>${run(text)}</w:p>`;
}
function cell(text, w) {
  return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>${para(text)}</w:tc>`;
}

// 3 columns at 2400 twips each = 7200 twips ≈ 5 inches wide.
const COL_W = 2400;
const ROWS = [
  ['Col-A', 'Col-B', 'Col-C'],
  ['cell-1-A', 'cell-1-B', 'cell-1-C'],
  ['cell-2-A', 'cell-2-B', 'cell-2-C'],
];

const rows = ROWS.map(
  (r) => `<w:tr>${r.map((t) => cell(t, COL_W)).join('')}</w:tr>`
).join('');

const grid =
  '<w:tblGrid>' + ROWS[0].map(() => `<w:gridCol w:w="${COL_W}"/>`).join('') + '</w:tblGrid>';

const body = `
  ${para('Resize fixture')}
  <w:tbl>
    <w:tblPr>
      <w:tblW w:w="7200" w:type="dxa"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:color="888888"/>
        <w:left w:val="single" w:sz="4" w:color="888888"/>
        <w:bottom w:val="single" w:sz="4" w:color="888888"/>
        <w:right w:val="single" w:sz="4" w:color="888888"/>
        <w:insideH w:val="single" w:sz="4" w:color="888888"/>
        <w:insideV w:val="single" w:sz="4" w:color="888888"/>
      </w:tblBorders>
    </w:tblPr>
    ${grid}
    ${rows}
  </w:tbl>
  <w:sectPr>
    <w:pgSz w:w="12240" w:h="15840"/>
    <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"
             w:header="720" w:footer="720" w:gutter="0"/>
  </w:sectPr>
`;

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${body}</w:body>
</w:document>`;

const zip = new JSZip();
zip.file('[Content_Types].xml', CONTENT_TYPES);
zip.file('_rels/.rels', RELS);
zip.file('word/document.xml', DOC);

const out = await zip.generateAsync({ type: 'nodebuffer' });
writeFileSync(OUT, out);
console.log(`wrote ${OUT} (${out.byteLength} bytes)`);
