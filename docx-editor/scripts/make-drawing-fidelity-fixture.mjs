/**
 * Build a single fixture with one of each drawing kind at *known*
 * EMU coordinates so the e2e can assert "OOXML → rendered" geometry
 * one-to-one.
 *
 * Coordinate primer:
 *   1 inch       = 914 400 EMU
 *   1 px @ 96dpi =   9 525 EMU
 *   So:  px = EMU / 9525
 *
 * Layout choices (all dimensions in EMU unless noted):
 *
 *   1. Inline image — 100 px × 80 px (cx = 952500, cy = 762000)
 *      Should render in-line with text; bbox width ≈ 100, height ≈ 80.
 *
 *   2. Anchored image (wrap = none, position relative to "margin"):
 *      posOffset = (100 px, 200 px) → x = 952500, y = 1905000.
 *      Size = 120 × 90 → cx = 1143000, cy = 857250.
 *
 *   3. Shape (wps:wsp rectangle) at known position, with explicit
 *      4 px thick red border:
 *      pos = (200 px, 50 px), size = 160 × 60.
 *      a:ln w = 4 × 9525 = 38100 EMU. solidFill srgbClr = "FF0000".
 *
 *   4. Group (wpg:wgp) at outer position (0, 350), containing two
 *      child shapes at relative offsets:
 *        - Child A: rel (0, 0)   size 100 × 40, fill 4F46E5 (indigo)
 *        - Child B: rel (120, 0) size 100 × 40, fill 16A34A (green)
 *      Expected absolute positions:
 *        - Child A: 0 + 0,   350 + 0  = (0, 350)   px
 *        - Child B: 0 + 120, 350 + 0  = (120, 350) px
 *      (Both relative to the page-content origin; this catches the
 *       wpg-child-positioning bug that the prior fix addressed.)
 *
 * Run: bun scripts/make-drawing-fidelity-fixture.mjs
 *
 * Output: e2e/fixtures/drawing-fidelity.docx
 */
import JSZip from 'jszip';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, '..');
const OUT = join(projectRoot, 'e2e/fixtures/drawing-fidelity.docx');

// Reuse the existing test-image.png so we don't ship more binaries.
const TEST_IMG_PATH = join(projectRoot, 'e2e/fixtures/test-image.png');
if (!existsSync(TEST_IMG_PATH)) {
  console.error(`expected ${TEST_IMG_PATH} to exist (reused from existing fixtures)`);
  process.exit(1);
}
const imgBytes = readFileSync(TEST_IMG_PATH);

// EMU helpers — `px(n)` returns EMUs at 96 DPI.
const px = (n) => n * 9525;

// ---------- inline image (drawing 1) ----------
const INLINE_IMG = `
<w:r>
  <w:drawing>
    <wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
               xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
               xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
               xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
               distT="0" distB="0" distL="0" distR="0">
      <wp:extent cx="${px(100)}" cy="${px(80)}"/>
      <wp:effectExtent l="0" t="0" r="0" b="0"/>
      <wp:docPr id="1" name="InlineImage1" descr="inline-100x80"/>
      <wp:cNvGraphicFramePr/>
      <a:graphic>
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
          <pic:pic>
            <pic:nvPicPr>
              <pic:cNvPr id="1" name="img1.png"/>
              <pic:cNvPicPr/>
            </pic:nvPicPr>
            <pic:blipFill>
              <a:blip r:embed="rIdImg1"/>
              <a:stretch><a:fillRect/></a:stretch>
            </pic:blipFill>
            <pic:spPr>
              <a:xfrm><a:off x="0" y="0"/><a:ext cx="${px(100)}" cy="${px(80)}"/></a:xfrm>
              <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
            </pic:spPr>
          </pic:pic>
        </a:graphicData>
      </a:graphic>
    </wp:inline>
  </w:drawing>
</w:r>
`;

// ---------- anchored image (drawing 2) ----------
const ANCHOR_IMG = `
<w:r>
  <w:drawing>
    <wp:anchor xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
               xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
               xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
               xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
               distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="2" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">
      <wp:simplePos x="0" y="0"/>
      <wp:positionH relativeFrom="margin"><wp:posOffset>${px(100)}</wp:posOffset></wp:positionH>
      <wp:positionV relativeFrom="margin"><wp:posOffset>${px(200)}</wp:posOffset></wp:positionV>
      <wp:extent cx="${px(120)}" cy="${px(90)}"/>
      <wp:effectExtent l="0" t="0" r="0" b="0"/>
      <wp:wrapNone/>
      <wp:docPr id="2" name="AnchoredImage2" descr="anchored-120x90"/>
      <wp:cNvGraphicFramePr/>
      <a:graphic>
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
          <pic:pic>
            <pic:nvPicPr><pic:cNvPr id="2" name="img2.png"/><pic:cNvPicPr/></pic:nvPicPr>
            <pic:blipFill><a:blip r:embed="rIdImg1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
            <pic:spPr>
              <a:xfrm><a:off x="0" y="0"/><a:ext cx="${px(120)}" cy="${px(90)}"/></a:xfrm>
              <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
            </pic:spPr>
          </pic:pic>
        </a:graphicData>
      </a:graphic>
    </wp:anchor>
  </w:drawing>
</w:r>
`;

// ---------- shape (wps:wsp rectangle) (drawing 3) ----------
const SHAPE = `
<w:r>
  <w:drawing>
    <wp:anchor xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
               xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
               xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
               distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="3" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">
      <wp:simplePos x="0" y="0"/>
      <wp:positionH relativeFrom="margin"><wp:posOffset>${px(200)}</wp:posOffset></wp:positionH>
      <wp:positionV relativeFrom="margin"><wp:posOffset>${px(50)}</wp:posOffset></wp:positionV>
      <wp:extent cx="${px(160)}" cy="${px(60)}"/>
      <wp:effectExtent l="0" t="0" r="0" b="0"/>
      <wp:wrapNone/>
      <wp:docPr id="3" name="Shape3" descr="shape-rect-red-border"/>
      <wp:cNvGraphicFramePr/>
      <a:graphic>
        <a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
          <wps:wsp>
            <wps:cNvSpPr/>
            <wps:spPr>
              <a:xfrm><a:off x="0" y="0"/><a:ext cx="${px(160)}" cy="${px(60)}"/></a:xfrm>
              <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
              <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
              <a:ln w="${4 * 9525}"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:ln>
            </wps:spPr>
            <wps:txbx><w:txbxContent><w:p><w:r><w:t>SHAPE-3</w:t></w:r></w:p></w:txbxContent></wps:txbx>
            <wps:bodyPr/>
          </wps:wsp>
        </a:graphicData>
      </a:graphic>
    </wp:anchor>
  </w:drawing>
</w:r>
`;

// ---------- group (wpg:wgp) with two children (drawing 4 + 5) ----------
const GROUP = `
<w:r>
  <w:drawing>
    <wp:anchor xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
               xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
               xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
               xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
               distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="4" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">
      <wp:simplePos x="0" y="0"/>
      <wp:positionH relativeFrom="margin"><wp:posOffset>${px(0)}</wp:posOffset></wp:positionH>
      <wp:positionV relativeFrom="margin"><wp:posOffset>${px(350)}</wp:posOffset></wp:positionV>
      <wp:extent cx="${px(220)}" cy="${px(40)}"/>
      <wp:effectExtent l="0" t="0" r="0" b="0"/>
      <wp:wrapNone/>
      <wp:docPr id="4" name="Group4" descr="group-with-2-children"/>
      <wp:cNvGraphicFramePr/>
      <a:graphic>
        <a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup">
          <wpg:wgp>
            <wpg:cNvGrpSpPr/>
            <wpg:grpSpPr>
              <a:xfrm>
                <a:off x="0" y="0"/>
                <a:ext cx="${px(220)}" cy="${px(40)}"/>
                <a:chOff x="0" y="0"/>
                <a:chExt cx="${px(220)}" cy="${px(40)}"/>
              </a:xfrm>
            </wpg:grpSpPr>
            <wps:wsp>
              <wps:cNvSpPr/>
              <wps:spPr>
                <a:xfrm><a:off x="0" y="0"/><a:ext cx="${px(100)}" cy="${px(40)}"/></a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                <a:solidFill><a:srgbClr val="4F46E5"/></a:solidFill>
              </wps:spPr>
              <wps:txbx><w:txbxContent><w:p><w:r><w:t>GA</w:t></w:r></w:p></w:txbxContent></wps:txbx>
              <wps:bodyPr/>
            </wps:wsp>
            <wps:wsp>
              <wps:cNvSpPr/>
              <wps:spPr>
                <a:xfrm><a:off x="${px(120)}" y="0"/><a:ext cx="${px(100)}" cy="${px(40)}"/></a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                <a:solidFill><a:srgbClr val="16A34A"/></a:solidFill>
              </wps:spPr>
              <wps:txbx><w:txbxContent><w:p><w:r><w:t>GB</w:t></w:r></w:p></w:txbxContent></wps:txbx>
              <wps:bodyPr/>
            </wps:wsp>
          </wpg:wgp>
        </a:graphicData>
      </a:graphic>
    </wp:anchor>
  </w:drawing>
</w:r>
`;

const BODY = `
<w:p><w:r><w:t>HEAD</w:t></w:r></w:p>
<w:p>${INLINE_IMG}</w:p>
<w:p><w:r><w:t>BETWEEN</w:t></w:r>${ANCHOR_IMG}</w:p>
<w:p><w:r><w:t>MIDDLE</w:t></w:r>${SHAPE}</w:p>
<w:p><w:r><w:t>WITH-GROUP</w:t></w:r>${GROUP}</w:p>
<w:p><w:r><w:t>TAIL</w:t></w:r></w:p>
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
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/img1.png"/>
</Relationships>`;

const DOC = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
            xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
            xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
            xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
            mc:Ignorable="wp14 w14">
  <w:body>${BODY}</w:body>
</w:document>`;

const zip = new JSZip();
zip.file('[Content_Types].xml', CONTENT_TYPES);
zip.file('_rels/.rels', RELS);
zip.file('word/_rels/document.xml.rels', DOC_RELS);
zip.file('word/document.xml', DOC);
zip.file('word/media/img1.png', imgBytes);

const out = await zip.generateAsync({ type: 'nodebuffer' });
writeFileSync(OUT, out);
console.log(`wrote ${OUT} (${out.byteLength} bytes)`);
