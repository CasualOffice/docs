/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

// Fixture: a wpg:wgp group containing two text-bearing wps:wsp shapes
// (a label + a hyperlink) plus a decorative rect, all under an
// `mc:AlternateContent` envelope (Word's typical wrapping for modern
// drawings). Pins the wpg:wgp + AlternateContent path that surfaces in
// real letterhead-style docs.
//
// Run: docker compose exec editor bun scripts/make-wpg-group-fixture.mjs

import JSZip from 'jszip';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, '..');
const OUT = join(projectRoot, 'e2e', 'fixtures', 'wpg-group.docx');

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

const DOCUMENT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
            xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
  <w:body>
    <w:p>
      <w:r>
        <mc:AlternateContent>
          <mc:Choice Requires="wpg">
            <w:drawing>
              <wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0"
                         relativeHeight="251675648" behindDoc="0" locked="0" layoutInCell="1"
                         allowOverlap="1">
                <wp:simplePos x="0" y="0"/>
                <wp:positionH relativeFrom="column"><wp:posOffset>0</wp:posOffset></wp:positionH>
                <wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>
                <wp:extent cx="3000000" cy="800000"/>
                <wp:effectExtent l="0" t="0" r="0" b="0"/>
                <wp:wrapNone/>
                <wp:docPr id="100" name="Group 1"/>
                <wp:cNvGraphicFramePr/>
                <a:graphic>
                  <a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup">
                    <wpg:wgp>
                      <wpg:cNvGrpSpPr/>
                      <wpg:grpSpPr>
                        <a:xfrm><a:off x="0" y="0"/><a:ext cx="3000000" cy="800000"/></a:xfrm>
                      </wpg:grpSpPr>
                      <wps:wsp>
                        <wps:cNvPr id="101" name="Text Box A"/>
                        <wps:cNvSpPr txBox="1"/>
                        <wps:spPr>
                          <a:xfrm><a:off x="0" y="0"/><a:ext cx="1500000" cy="300000"/></a:xfrm>
                          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                          <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
                        </wps:spPr>
                        <wps:txbx>
                          <w:txbxContent>
                            <w:p><w:r><w:t>GROUP-TEXT-A</w:t></w:r></w:p>
                          </w:txbxContent>
                        </wps:txbx>
                        <wps:bodyPr/>
                      </wps:wsp>
                      <wps:wsp>
                        <wps:cNvPr id="102" name="Text Box B"/>
                        <wps:cNvSpPr txBox="1"/>
                        <wps:spPr>
                          <a:xfrm><a:off x="0" y="400000"/><a:ext cx="1500000" cy="300000"/></a:xfrm>
                          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                        </wps:spPr>
                        <wps:txbx>
                          <w:txbxContent>
                            <w:p><w:r><w:t>GROUP-TEXT-B</w:t></w:r></w:p>
                          </w:txbxContent>
                        </wps:txbx>
                        <wps:bodyPr/>
                      </wps:wsp>
                    </wpg:wgp>
                  </a:graphicData>
                </a:graphic>
              </wp:anchor>
            </w:drawing>
          </mc:Choice>
          <mc:Fallback/>
        </mc:AlternateContent>
      </w:r>
    </w:p>
    <w:p><w:r><w:t>BODY-AFTER-GROUP</w:t></w:r></w:p>
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
