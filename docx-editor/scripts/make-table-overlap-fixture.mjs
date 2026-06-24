/**
 * Build a tight-pagination fixture that exercises the
 * `table-overlap-text` gap-matrix row:
 *   - A 30-row table whose total height (rows × 32 px) reaches into
 *     the lower part of the page content area.
 *   - A short paragraph after the table containing the marker
 *     "POST-TABLE-TEXT" so e2e can locate it.
 *   - A second table + second marker so the test exercises both the
 *     in-flow continuation pagination and the post-table flow.
 *
 * The e2e asserts: the post-table paragraph's bounding rect top
 * is strictly greater than the table's bounding rect bottom (no
 * overlap on screen).
 *
 * Run: bun scripts/make-table-overlap-fixture.mjs
 */
import JSZip from 'jszip';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, '..');
const OUT = join(projectRoot, 'e2e/fixtures/table-overlap.docx');

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function run(text) {
  return `<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}
function para(text) {
  return `<w:p>${run(text)}</w:p>`;
}
function row(cells) {
  const cellXml = cells
    .map(
      (c) =>
        `<w:tc><w:tcPr><w:tcW w:w="3120" w:type="dxa"/></w:tcPr>${para(c)}</w:tc>`
    )
    .join('');
  return `<w:tr>${cellXml}</w:tr>`;
}
function table(rows) {
  const grid = `<w:tblGrid>${rows[0].map(() => '<w:gridCol w:w="3120"/>').join('')}</w:tblGrid>`;
  const tblPr = `
  <w:tblPr>
    <w:tblW w:w="0" w:type="auto"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="4" w:color="888888"/>
      <w:left w:val="single" w:sz="4" w:color="888888"/>
      <w:bottom w:val="single" w:sz="4" w:color="888888"/>
      <w:right w:val="single" w:sz="4" w:color="888888"/>
      <w:insideH w:val="single" w:sz="4" w:color="888888"/>
      <w:insideV w:val="single" w:sz="4" w:color="888888"/>
    </w:tblBorders>
  </w:tblPr>`;
  return `<w:tbl>${tblPr}${grid}${rows.map(row).join('')}</w:tbl>`;
}

// 30 rows × 3 columns. 30 × ~24 px per row + borders ≈ 750 px = forces
// pagination into a second page (Letter content area ≈ 912 px).
const T1_ROWS = Array.from({ length: 30 }, (_, i) => [
  `R${i + 1}A`,
  `R${i + 1}B`,
  `R${i + 1}C`,
]);

const body = `
  ${para('PRE-T1-INTRO')}
  ${table(T1_ROWS)}
  ${para('POST-T1-MARKER')}
  ${para('POST-T1-FILL')}
  ${table(Array.from({ length: 20 }, (_, i) => [`S${i + 1}A`, `S${i + 1}B`, `S${i + 1}C`]))}
  ${para('POST-T2-MARKER')}
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
