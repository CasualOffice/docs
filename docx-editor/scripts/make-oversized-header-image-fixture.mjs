/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

// Build a fixture .docx whose header contains an inline image declared
// at 1800 px wide — much wider than the content area for US Letter with
// 1-inch left/right margins (content width ≈ 624 px). Used to pin GH
// #265: pasting an oversized image into a header used to render at
// full natural width and overlay body content. The painter now clamps
// inline images via `max-width: 100%`.
//
// Run: docker compose exec editor bun scripts/make-oversized-header-image-fixture.mjs

import JSZip from 'jszip';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, '..');
const OUT = join(projectRoot, 'e2e', 'fixtures', 'oversized-header-image.docx');

// Tiny 4×4 red PNG — base64. The pixel content is irrelevant; what
// matters is that we declare wp:extent at an absurd width so the
// painter's max-width clamp is the only thing keeping it in bounds.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR4nGP8z/CfgQGI/jMwMDAAAAQfAQGFklUNAAAAAElFTkSuQmCC';
const pngBytes = Uint8Array.from(atob(PNG_BASE64), (c) => c.charCodeAt(0));

const CT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
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

const HEADER_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
</Relationships>`;

// Inline image at 1800×600 px → wp:extent in EMU (914400 EMU per inch,
// 96 px per inch → 9525 EMU/px). 1800px = 17,145,000 EMU, 600px = 5,715,000 EMU.
const HEADER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:p>
    <w:r>
      <w:drawing>
        <wp:inline distT="0" distB="0" distL="0" distR="0">
          <wp:extent cx="17145000" cy="5715000"/>
          <wp:effectExtent l="0" t="0" r="0" b="0"/>
          <wp:docPr id="1" name="OversizedHeaderImage"/>
          <wp:cNvGraphicFramePr/>
          <a:graphic>
            <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:pic>
                <pic:nvPicPr>
                  <pic:cNvPr id="1" name="bigpx"/>
                  <pic:cNvPicPr/>
                </pic:nvPicPr>
                <pic:blipFill>
                  <a:blip r:embed="rId1"/>
                  <a:stretch><a:fillRect/></a:stretch>
                </pic:blipFill>
                <pic:spPr>
                  <a:xfrm><a:off x="0" y="0"/><a:ext cx="17145000" cy="5715000"/></a:xfrm>
                  <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                </pic:spPr>
              </pic:pic>
            </a:graphicData>
          </a:graphic>
        </wp:inline>
      </w:drawing>
    </w:r>
  </w:p>
</w:hdr>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:styles>`;

const DOCUMENT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p><w:r><w:t>BODY-LINE-ONE</w:t></w:r></w:p>
    <w:p><w:r><w:t>Body content line two.</w:t></w:r></w:p>
    <w:sectPr>
      <w:headerReference r:id="rId2" w:type="default"/>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"
               w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

const zip = new JSZip();
zip.file('[Content_Types].xml', CT);
zip.file('_rels/.rels', RELS);
zip.file('word/_rels/document.xml.rels', DOC_RELS);
zip.file('word/_rels/header1.xml.rels', HEADER_RELS);
zip.file('word/document.xml', DOCUMENT);
zip.file('word/styles.xml', STYLES);
zip.file('word/header1.xml', HEADER);
zip.file('word/media/image1.png', pngBytes);

const buf = await zip.generateAsync({ type: 'nodebuffer' });
writeFileSync(OUT, buf);
console.log(`wrote ${OUT} (${buf.byteLength} bytes)`);
