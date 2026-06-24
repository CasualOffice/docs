/**
 * Fixture for the `<DocxEditor wordCompat>` React-prop e2e:
 * a single table where `<w:tblBorders>` declares ONLY a `firstRow`
 * bottom (the canonical case the heuristic targets). With wordCompat
 * off, the last body row's last cell has no bottom border. With
 * wordCompat on, that cell inherits the firstRow bottom border.
 */
import JSZip from 'jszip';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, '..');
const OUT = join(projectRoot, 'e2e/fixtures/word-compat-closing-border.docx');

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function run(text) {
  return `<w:r><w:t>${esc(text)}</w:t></w:r>`;
}
function para(text) {
  return `<w:p>${run(text)}</w:p>`;
}
function cell(text) {
  return `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr>${para(text)}</w:tc>`;
}

const ROWS = [
  ['H1', 'H2', 'H3'],
  ['cell-1-A', 'cell-1-B', 'cell-1-C'],
  ['LAST-A', 'LAST-B', 'LAST-C'],
];

const rows = ROWS.map((r) => `<w:tr>${r.map(cell).join('')}</w:tr>`).join('');
const grid = `<w:tblGrid>${ROWS[0].map(() => `<w:gridCol w:w="2400"/>`).join('')}</w:tblGrid>`;

// Only `firstRow` declares a bottom border — no whole-table bottom,
// no insideH, no per-row bottom on the last row. This is the gap-row
// scenario that the wordCompat heuristic targets.
const body = `
  ${para('WORDCOMPAT-FIXTURE')}
  <w:tbl>
    <w:tblPr>
      <w:tblW w:w="7200" w:type="dxa"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:color="000000"/>
        <w:left w:val="single" w:sz="4" w:color="000000"/>
        <w:right w:val="single" w:sz="4" w:color="000000"/>
        <w:insideV w:val="single" w:sz="4" w:color="888888"/>
      </w:tblBorders>
    </w:tblPr>
    ${grid}
    <w:tr>
      ${ROWS[0]
        .map(
          (t) =>
            `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/><w:tcBorders><w:bottom w:val="single" w:sz="8" w:color="222222"/></w:tcBorders></w:tcPr>${para(t)}</w:tc>`
        )
        .join('')}
    </w:tr>
    <w:tr>${ROWS[1].map(cell).join('')}</w:tr>
    <w:tr>${ROWS[2].map(cell).join('')}</w:tr>
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
