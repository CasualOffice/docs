/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

// Build a fixture .docx whose paragraphs use `w:pBdr/w:between` (rule
// between adjacent paragraphs sharing the border) and `w:pBdr/w:bar`
// (left-margin vertical bar). Used to pin the openspec
// `paragraph-border-rendering` gap, which the matrix lists as "parsed
// but silently dropped" — the audit found that's no longer true: every
// layer (parse → PM round-trip → layout-bridge → renderer → serializer)
// already carries both sides.
//
// Run: docker compose exec editor bun scripts/make-between-bar-borders-fixture.mjs

import JSZip from 'jszip';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, '..');
const OUT = join(projectRoot, 'e2e', 'fixtures', 'between-bar-borders.docx');

const CT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:styles>`;

// Two adjacent paragraphs each carrying matching `w:between` (so the
// renderer paints a horizontal rule between them) plus a `w:bar` on the
// left margin. Followed by an unrelated paragraph.
const DOCUMENT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr>
        <w:pBdr>
          <w:between w:val="single" w:sz="8" w:space="1" w:color="0070C0"/>
          <w:bar w:val="single" w:sz="12" w:space="4" w:color="FF0000"/>
        </w:pBdr>
      </w:pPr>
      <w:r><w:t>BETWEEN-A</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr>
        <w:pBdr>
          <w:between w:val="single" w:sz="8" w:space="1" w:color="0070C0"/>
          <w:bar w:val="single" w:sz="12" w:space="4" w:color="FF0000"/>
        </w:pBdr>
      </w:pPr>
      <w:r><w:t>BETWEEN-B</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>PLAIN-TAIL</w:t></w:r>
    </w:p>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

const zip = new JSZip();
zip.file('[Content_Types].xml', CT);
zip.file('_rels/.rels', RELS);
zip.file('word/_rels/document.xml.rels', DOC_RELS);
zip.file('word/document.xml', DOCUMENT);
zip.file('word/styles.xml', STYLES);

const buf = await zip.generateAsync({ type: 'nodebuffer' });
writeFileSync(OUT, buf);
console.log(`wrote ${OUT} (${buf.byteLength} bytes)`);
