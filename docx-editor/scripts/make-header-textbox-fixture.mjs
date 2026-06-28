/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

// Build a fixture .docx that has a textbox INSIDE the page header.
// Used by e2e/tests/textbox-rendering-header.spec.ts to exercise the
// header-parsing path for textboxes (issue #318 — "the textbox is only
// visible in Microsoft Word when editing the header section, but it is
// not rendered in the editor at all").
//
// Run: docker compose exec editor bun docx-editor/scripts/make-header-textbox-fixture.mjs

import JSZip from 'jszip';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, '..');
const fixtureDir = join(projectRoot, 'e2e', 'fixtures');

const SRC = join(fixtureDir, 'template-with-hf-rule.docx');
const OUT = join(fixtureDir, 'header-with-textbox.docx');

// Self-contained textbox XML to splice into the header. Roughly the same
// shape as the simple textboxes inside textbox-test.docx, with a heading
// "Header Textbox" + a one-line body. We use an inline drawing so the
// textbox lives in normal flow inside the header content.
const headerTextboxXml = `
  <w:p>
    <w:r>
      <w:drawing>
        <wp:inline distT="0" distB="0" distL="0" distR="0">
          <wp:extent cx="2200000" cy="500000"/>
          <wp:effectExtent l="0" t="0" r="0" b="0"/>
          <wp:docPr id="100" name="HeaderTextbox"/>
          <wp:cNvGraphicFramePr>
            <a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/>
          </wp:cNvGraphicFramePr>
          <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
            <a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
              <wps:wsp xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
                <wps:cNvSpPr txBox="1"/>
                <wps:spPr>
                  <a:xfrm><a:off x="0" y="0"/><a:ext cx="2200000" cy="500000"/></a:xfrm>
                  <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                  <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
                  <a:ln w="6350"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln>
                </wps:spPr>
                <wps:txbx>
                  <w:txbxContent>
                    <w:p><w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">Header Textbox</w:t></w:r></w:p>
                    <w:p><w:r><w:t xml:space="preserve">A textbox inside the page header.</w:t></w:r></w:p>
                  </w:txbxContent>
                </wps:txbx>
                <wps:bodyPr rot="0" spcFirstLastPara="0" vertOverflow="overflow" horzOverflow="overflow"/>
              </wps:wsp>
            </a:graphicData>
          </a:graphic>
        </wp:inline>
      </w:drawing>
    </w:r>
  </w:p>
`;

const buf = readFileSync(SRC);
const zip = await JSZip.loadAsync(buf);

const headerFile = zip.file('word/header1.xml');
if (!headerFile) {
  console.error('source fixture has no word/header1.xml — pick a different template');
  process.exit(1);
}

const original = await headerFile.async('text');
// Insert the textbox paragraph immediately before </w:hdr>. If the source
// has unusual whitespace we still want to inject in the right place.
if (!original.includes('</w:hdr>')) {
  console.error('source header.xml does not contain </w:hdr>');
  process.exit(1);
}
const patched = original.replace('</w:hdr>', `${headerTextboxXml}</w:hdr>`);

zip.file('word/header1.xml', patched);

const out = await zip.generateAsync({ type: 'nodebuffer' });
writeFileSync(OUT, out);

console.log(`wrote ${OUT} (${out.byteLength} bytes)`);
console.log(`added textbox to word/header1.xml between <w:hdr> tags`);
