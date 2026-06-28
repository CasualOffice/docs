/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

// Build a minimal .docx with `<w:color w:val="auto" w:themeColor="dk1"/>`
// on a body run. Pins the openspec `ooxml-roundtrip-fidelity` Problem #2
// scenario: Word writes auto + themeColor for theme-resolved text (e.g.
// in table headers); pre-fix, our PM conversion dropped the textColor
// mark on `auto`, losing the theme slot. The e2e spec loads this fixture,
// saves it, reloads, and asserts the theme attrs survived.
//
// Run: docker compose exec editor bun scripts/make-theme-color-fixture.mjs

import JSZip from 'jszip';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, '..');
const OUT = join(projectRoot, 'e2e', 'fixtures', 'theme-color-auto.docx');

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

// The canary run carries auto + themeColor — the exact shape Word writes
// for theme-resolved text. A second run with rgb + themeColor + themeTint
// covers the more usual case so the e2e can pin both shapes at once.
const DOCUMENT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:rPr><w:color w:val="auto" w:themeColor="dk1"/></w:rPr>
        <w:t>AUTO-THEMED</w:t>
      </w:r>
      <w:r><w:t xml:space="preserve"> | </w:t></w:r>
      <w:r>
        <w:rPr><w:color w:val="B4C6E7" w:themeColor="accent1" w:themeTint="66"/></w:rPr>
        <w:t>TINTED-ACCENT</w:t>
      </w:r>
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
