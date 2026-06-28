/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

// Build a fixture .docx that exercises Word's 3-section header layout:
//   Left[tab]Center[tab]Right
// with explicit tab stops:
//   - center tab at the page-content midpoint (4680 twips)
//   - right tab at the right margin (9360 twips)
//
// Pins the openspec `header-footer-rendering` proposal's "alignment
// distortion" case — the painter must honor the tab stops in headers so
// the three texts land at left/center/right of the content area.
//
// Run: docker compose exec editor bun scripts/make-three-section-header-fixture.mjs

import JSZip from 'jszip';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, '..');
const OUT = join(projectRoot, 'e2e', 'fixtures', 'three-section-header.docx');

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
</Relationships>`;

// 12240×15840 twips = US Letter portrait. left/right margins 1440 twips (1 in)
// each → content width = 12240 - 2*1440 = 9360 twips.
// center tab at content midpoint (9360/2 = 4680 twips from content-left).
// right tab at content right edge (9360 twips from content-left).
const HEADER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr>
      <w:tabs>
        <w:tab w:val="center" w:pos="4680"/>
        <w:tab w:val="right" w:pos="9360"/>
      </w:tabs>
    </w:pPr>
    <w:r><w:t>LEFT</w:t></w:r>
    <w:r><w:tab/></w:r>
    <w:r><w:t>CENTER</w:t></w:r>
    <w:r><w:tab/></w:r>
    <w:r><w:t>RIGHT</w:t></w:r>
  </w:p>
</w:hdr>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
        <w:sz w:val="22"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
</w:styles>`;

const DOCUMENT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p>
      <w:r><w:t>Body paragraph one.</w:t></w:r>
    </w:p>
    <w:sectPr>
      <w:headerReference r:id="rId2" w:type="default"/>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"
               w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

const zip = new JSZip();
zip.file('[Content_Types].xml', CONTENT_TYPES);
zip.file('_rels/.rels', RELS);
zip.file('word/_rels/document.xml.rels', DOC_RELS);
zip.file('word/document.xml', DOCUMENT);
zip.file('word/styles.xml', STYLES);
zip.file('word/header1.xml', HEADER);

const out = await zip.generateAsync({ type: 'nodebuffer' });
writeFileSync(OUT, out);
console.log(`wrote ${OUT} (${out.byteLength} bytes)`);
