/**
 * Text Box Enrichment
 *
 * During initial paragraph parsing, `w:drawing` elements that contain a
 * text box (`wps:wsp` with `wps:txbx`) are skipped because the image
 * parser returns `null` for non-image drawings. This module does a
 * second pass over the raw XML of a parsed paragraph, finds those text
 * box drawings, parses them with their inner content, and injects them
 * back into the parsed paragraph as `ShapeContent` on the matching run.
 *
 * Used by:
 * - `documentParser.parseBlockContent` for the document body.
 * - `headerFooterParser.parseHeaderFooterContent` for headers/footers
 *   (issue #318 — without this call, textboxes inside headers/footers
 *   silently disappear).
 *
 * Also handles:
 * - `<mc:AlternateContent>` envelopes — descends into `<mc:Choice>`
 *   (preferred) or `<mc:Fallback>` to find nested `<w:drawing>` /
 *   `<w:pict>`. Word wraps modern wps shapes in this envelope so older
 *   clients can fall back to a VML representation.
 * - `<wpg:wgp>` groups inside a drawing — Word's "Group" command.
 *   Each inner `<wps:wsp>` is extracted as its own shape so the group's
 *   children (logos, taglines, decorative bars assembled into one
 *   moveable unit) all surface in the painted output instead of just
 *   the first one. The group's outer `<wp:anchor>` position is
 *   inherited by each child (precise per-child placement within the
 *   group's coordinate space is a deeper layout problem; this gets the
 *   content visible at the right place on the page).
 */

import type {
  Paragraph,
  Run as RunContent,
  Shape,
  Theme,
  RelationshipMap,
  MediaFile,
  TextBox,
  ImagePosition,
  ImageWrap,
} from '../types/document';
import type { StyleMap } from './styleParser';
import type { NumberingMap } from './numberingParser';
import {
  findDeep,
  getChildElements,
  getLocalName,
  getAttribute,
  type XmlElement,
} from './xmlParser';
import { parseParagraph } from './paragraphParser';
import {
  isTextBoxDrawing,
  parseTextBox,
  getTextBoxContentElement,
  parseTextBoxContent,
  isDecorativeShapeDrawing,
  parseDecorativeDrawing,
} from './textBoxParser';
import {
  isVmlTextBoxPict,
  parseVmlTextBox,
  isVmlDecorativeShapePict,
  parseVmlDecorativeShape,
} from './vmlTextBoxParser';
import { parseFill, parseOutline, parseAnchorPosition, parseAnchorWrap } from './drawingUtils';

const WPG_URI = 'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup';

interface Ctx {
  styles: StyleMap | null;
  theme: Theme | null;
  numbering: NumberingMap | null;
  rels: RelationshipMap | null;
  media: Map<string, MediaFile> | null;
}

/**
 * Enrich a parsed paragraph with text-box content from its raw XML.
 */
export function enrichParagraphTextBoxes(
  paragraph: Paragraph,
  paraXml: XmlElement,
  styles: StyleMap | null,
  theme: Theme | null,
  numbering: NumberingMap | null,
  rels: RelationshipMap | null,
  media: Map<string, MediaFile> | null
): void {
  if (paragraph.content.length === 0) return;
  const ctx: Ctx = { styles, theme, numbering, rels, media };

  const xmlChildren = getChildElements(paraXml);
  let runIndex = 0;

  for (const xmlChild of xmlChildren) {
    if (getLocalName(xmlChild.name ?? '') !== 'r') continue;
    if (runIndex >= paragraph.content.length) {
      runIndex++;
      continue;
    }
    const parsedRun = paragraph.content[runIndex];
    if (parsedRun.type === 'run') {
      processRunElement(xmlChild, parsedRun, ctx);
    }
    runIndex++;
  }
}

function processRunElement(runXml: XmlElement, parsedRun: RunContent, ctx: Ctx): void {
  for (const runEl of getChildElements(runXml)) {
    const elName = getLocalName(runEl.name ?? '');

    if (elName === 'pict') {
      handleVmlPict(runEl, parsedRun);
      continue;
    }

    if (elName === 'drawing') {
      handleDrawing(runEl, parsedRun, ctx);
      continue;
    }

    if (elName === 'AlternateContent') {
      // `<mc:AlternateContent>` envelopes a modern wps / wpg shape +
      // a VML fallback for older clients. Prefer the Choice; fall
      // back to Fallback. Each branch can contain w:drawing / w:pict
      // elements we should still process.
      const children = getChildElements(runEl);
      const choice = children.find((el) => getLocalName(el.name ?? '') === 'Choice');
      const fallback = children.find((el) => getLocalName(el.name ?? '') === 'Fallback');
      const target = choice ?? fallback;
      if (!target) continue;
      for (const inner of getChildElements(target)) {
        const innerName = getLocalName(inner.name ?? '');
        if (innerName === 'drawing') handleDrawing(inner, parsedRun, ctx);
        else if (innerName === 'pict') handleVmlPict(inner, parsedRun);
      }
    }
  }
}

function handleVmlPict(pictEl: XmlElement, parsedRun: RunContent): void {
  if (isVmlTextBoxPict(pictEl)) {
    const vml = parseVmlTextBox(pictEl, parseParagraph);
    if (vml) injectShapeFromTextBox(vml, parsedRun);
    return;
  }
  if (isVmlDecorativeShapePict(pictEl)) {
    const dec = parseVmlDecorativeShape(pictEl);
    if (dec) injectShapeFromTextBox(dec, parsedRun);
  }
}

function handleDrawing(drawingEl: XmlElement, parsedRun: RunContent, ctx: Ctx): void {
  // Locate the wp:inline / wp:anchor container and the a:graphicData URI
  // so we can branch on wpg:wgp groups (multi-shape) vs single shapes.
  const container = getChildElements(drawingEl).find(
    (el) => el.name === 'wp:inline' || el.name === 'wp:anchor'
  );
  const graphic = container ? findChild(container, 'a:graphic') : undefined;
  const graphicData = graphic ? findChild(graphic, 'a:graphicData') : undefined;
  const uri = graphicData ? getAttribute(graphicData, null, 'uri') : null;

  // Group of shapes — enumerate each inner wps:wsp and emit it
  // separately. Inner shapes inherit the group's anchor position.
  if (uri === WPG_URI && container && graphicData) {
    const wgp = findChild(graphicData, 'wpg:wgp');
    if (wgp) {
      const anchorPosition =
        container.name === 'wp:anchor' ? parseAnchorPosition(container) : undefined;
      const anchorWrap =
        container.name === 'wp:anchor' ? parseAnchorWrap(container) : undefined;
      for (const child of getChildElements(wgp)) {
        const childName = getLocalName(child.name ?? '');
        if (childName === 'wsp') {
          extractShapeFromWsp(child, parsedRun, ctx, anchorPosition, anchorWrap);
        }
        // Nested groups, pictures, etc. could be enumerated here in a
        // future pass; skipping for now keeps the diff focused on the
        // common letterhead-group case.
      }
      return;
    }
  }

  // Single text-bearing shape — the existing textbox path.
  if (isTextBoxDrawing(drawingEl)) {
    const textBox = parseTextBox(drawingEl);
    if (textBox) {
      const wsp = findDeep(drawingEl, 'wps', 'wsp');
      if (wsp) {
        const txbxContentEl = getTextBoxContentElement(wsp);
        if (txbxContentEl) {
          textBox.content = parseTextBoxContent(
            txbxContentEl,
            parseParagraph,
            null,
            ctx.styles,
            ctx.theme,
            ctx.numbering,
            ctx.rels ?? undefined,
            ctx.media ?? undefined
          );
        }
      }
      injectShapeFromTextBox(textBox, parsedRun);
    }
    return;
  }

  // Decorative DrawingML shape (no text frame).
  if (isDecorativeShapeDrawing(drawingEl)) {
    const dec = parseDecorativeDrawing(drawingEl);
    if (dec) injectShapeFromTextBox(dec, parsedRun);
  }
}

/**
 * Extract a single `<wps:wsp>` child of a `<wpg:wgp>` group as a Shape.
 * Inherits the group's anchor position and wrap so it lands on the page
 * near where Word would draw it. Inner offsets are not yet combined —
 * children appear stacked at the group anchor.
 */
function extractShapeFromWsp(
  wsp: XmlElement,
  parsedRun: RunContent,
  ctx: Ctx,
  anchorPosition: ImagePosition | undefined,
  anchorWrap: ImageWrap | undefined
): void {
  const wspChildren = getChildElements(wsp);
  const spPr = wspChildren.find((el) => el.name === 'wps:spPr');
  const txbx = wspChildren.find((el) => el.name === 'wps:txbx');
  const cNvPr = wspChildren.find((el) => el.name === 'wps:cNvPr');
  const id = cNvPr ? (getAttribute(cNvPr, null, 'id') ?? undefined) : undefined;

  // Size from xfrm.ext inside spPr (per OOXML §20.4.2.3, shapes inside
  // a group carry their own a:xfrm with offsets relative to the group's
  // coordinate space). Falls back to 100×100 px (≈ 952500 EMU) so empty
  // shapes still get a non-zero footprint.
  let cx = 952500;
  let cy = 952500;
  if (spPr) {
    const xfrm = getChildElements(spPr).find((el) => el.name === 'a:xfrm');
    if (xfrm) {
      const ext = getChildElements(xfrm).find((el) => el.name === 'a:ext');
      if (ext) {
        cx = Number(getAttribute(ext, null, 'cx') ?? cx);
        cy = Number(getAttribute(ext, null, 'cy') ?? cy);
      }
    }
  }

  const fill = parseFill(spPr ?? null) ?? undefined;
  const outline = parseOutline(spPr ?? null) ?? undefined;

  // Inner text content, if this wsp is text-bearing.
  let content: Paragraph[] = [{ type: 'paragraph', content: [] }];
  if (txbx) {
    const txbxContentEl = findDeep(txbx, 'w', 'txbxContent');
    if (txbxContentEl) {
      const parsed = parseTextBoxContent(
        txbxContentEl,
        parseParagraph,
        null,
        ctx.styles,
        ctx.theme,
        ctx.numbering,
        ctx.rels ?? undefined,
        ctx.media ?? undefined
      );
      if (parsed.length > 0) content = parsed;
    }
  }

  const shape: Shape = {
    type: 'shape',
    shapeType: 'rect',
    size: { width: cx, height: cy },
    position: anchorPosition,
    wrap: anchorWrap,
    fill,
    outline,
    textBody: { content },
  };
  if (id) shape.id = id;
  parsedRun.content.push({ type: 'shape', shape });
}

function injectShapeFromTextBox(textBox: TextBox, parsedRun: RunContent): void {
  const shape: Shape = {
    type: 'shape',
    shapeType: 'rect',
    size: textBox.size,
    position: textBox.position,
    wrap: textBox.wrap,
    fill: textBox.fill,
    outline: textBox.outline,
    textBody: {
      content:
        textBox.content.length > 0 ? textBox.content : [{ type: 'paragraph', content: [] }],
      margins: textBox.margins,
    },
  };
  if (textBox.id) shape.id = textBox.id;
  parsedRun.content.push({ type: 'shape', shape });
}

function findChild(parent: XmlElement, fullName: string): XmlElement | undefined {
  return getChildElements(parent).find((el) => el.name === fullName);
}
