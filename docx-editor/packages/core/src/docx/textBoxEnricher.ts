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
  Image,
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
import { resolveImageData } from './imageParser';

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

  // Group of shapes — enumerate each inner wps:wsp / pic:pic / nested
  // wpg:grpSp and emit each. Inner items inherit the group's anchor
  // position. The wpg:grpSp recursion handles letterhead layouts where
  // Word groups a logo image with surrounding text boxes (Medical
  // Incident Report Form's Safetymint logo is one such case).
  if (uri === WPG_URI && container && graphicData) {
    const wgp = findChild(graphicData, 'wpg:wgp');
    if (wgp) {
      const anchorPosition =
        container.name === 'wp:anchor' ? parseAnchorPosition(container) : undefined;
      const anchorWrap =
        container.name === 'wp:anchor' ? parseAnchorWrap(container) : undefined;
      walkGroupChildren(wgp, parsedRun, ctx, anchorPosition, anchorWrap);
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
  anchorWrap: ImageWrap | undefined,
  parentOffsetEmu: { x: number; y: number } = { x: 0, y: 0 }
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
  let offX = 0;
  let offY = 0;
  if (spPr) {
    const xfrm = getChildElements(spPr).find((el) => el.name === 'a:xfrm');
    if (xfrm) {
      const ext = getChildElements(xfrm).find((el) => el.name === 'a:ext');
      if (ext) {
        cx = Number(getAttribute(ext, null, 'cx') ?? cx);
        cy = Number(getAttribute(ext, null, 'cy') ?? cy);
      }
      const off = getChildElements(xfrm).find((el) => el.name === 'a:off');
      if (off) {
        offX = Number(getAttribute(off, null, 'x') ?? 0);
        offY = Number(getAttribute(off, null, 'y') ?? 0);
      }
    }
  }

  const fill = parseFill(spPr ?? null) ?? undefined;
  const outline = parseOutline(spPr ?? null) ?? undefined;

  // Combine the group's outer anchor with the parent-group's running
  // offset and this child's own xfrm.off so each shape lands at its
  // correct absolute position rather than stacking at the group origin.
  const totalOff = { x: parentOffsetEmu.x + offX, y: parentOffsetEmu.y + offY };
  const childPosition = addOffsetToAnchor(anchorPosition, totalOff);

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
    position: childPosition,
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

/**
 * Walk a `<wpg:wgp>` (or a nested `<wpg:grpSp>`) and emit each child:
 *   - `<wps:wsp>` → Shape via `extractShapeFromWsp`
 *   - `<pic:pic>` → inline image via `extractImageFromPic`
 *   - `<wpg:grpSp>` → recurse
 *
 * Inner content inherits the outer anchor's position so the painter
 * lands it near where Word draws the group. (Precise per-child
 * placement within the group's coordinate space is a future pass —
 * we currently stack children at the group origin.)
 */
function walkGroupChildren(
  group: XmlElement,
  parsedRun: RunContent,
  ctx: Ctx,
  anchorPosition: ImagePosition | undefined,
  anchorWrap: ImageWrap | undefined,
  parentOffsetEmu: { x: number; y: number } = { x: 0, y: 0 }
): void {
  for (const child of getChildElements(group)) {
    const local = getLocalName(child.name ?? '');
    if (local === 'wsp') {
      extractShapeFromWsp(child, parsedRun, ctx, anchorPosition, anchorWrap, parentOffsetEmu);
    } else if (local === 'pic') {
      extractImageFromPic(child, parsedRun, ctx, anchorPosition, anchorWrap, parentOffsetEmu);
    } else if (local === 'grpSp') {
      // Nested group — read its own a:xfrm/a:off and add to the running
      // offset before recursing so deeply nested children land in
      // absolute group coordinates.
      const grpSpPr = findChild(child, 'wpg:grpSpPr');
      const innerOffset = readXfrmOff(grpSpPr);
      walkGroupChildren(child, parsedRun, ctx, anchorPosition, anchorWrap, {
        x: parentOffsetEmu.x + innerOffset.x,
        y: parentOffsetEmu.y + innerOffset.y,
      });
    }
    // Other group children (cNvGrpSpPr, etc.) are metadata; skip.
  }
}

/** Read `<a:xfrm><a:off x cy>` EMU offset from a wps:spPr / wpg:grpSpPr. */
function readXfrmOff(spPr: XmlElement | undefined): { x: number; y: number } {
  if (!spPr) return { x: 0, y: 0 };
  const xfrm = findChild(spPr, 'a:xfrm');
  if (!xfrm) return { x: 0, y: 0 };
  const off = findChild(xfrm, 'a:off');
  if (!off) return { x: 0, y: 0 };
  return {
    x: Number(getAttribute(off, null, 'x') ?? 0),
    y: Number(getAttribute(off, null, 'y') ?? 0),
  };
}

/**
 * Combine the group's outer anchor position with a child's offset (in
 * EMU). The result is the absolute on-page position the child should
 * paint at. If the group has no anchor (inline drawing), return
 * undefined so the child falls back to inline flow.
 */
function addOffsetToAnchor(
  anchor: ImagePosition | undefined,
  childOffsetEmu: { x: number; y: number }
): ImagePosition | undefined {
  if (!anchor) {
    // Inline-group: synthesize a position relative to the paragraph so
    // children at non-zero offsets don't all stack at the line origin.
    if (childOffsetEmu.x === 0 && childOffsetEmu.y === 0) return undefined;
    return {
      horizontal: { relativeTo: 'margin', posOffset: childOffsetEmu.x },
      vertical: { relativeTo: 'paragraph', posOffset: childOffsetEmu.y },
    };
  }
  const next: ImagePosition = { ...anchor };
  if (anchor.horizontal) {
    next.horizontal = {
      ...anchor.horizontal,
      posOffset: (anchor.horizontal.posOffset ?? 0) + childOffsetEmu.x,
    };
  } else {
    next.horizontal = { relativeTo: 'margin', posOffset: childOffsetEmu.x };
  }
  if (anchor.vertical) {
    next.vertical = {
      ...anchor.vertical,
      posOffset: (anchor.vertical.posOffset ?? 0) + childOffsetEmu.y,
    };
  } else {
    next.vertical = { relativeTo: 'paragraph', posOffset: childOffsetEmu.y };
  }
  return next;
}

/**
 * Extract a `<pic:pic>` element directly inside a group as an inline
 * `Image`. The picture carries its own `<pic:blipFill><a:blip r:embed>`
 * for the rId, and `<pic:spPr><a:xfrm><a:ext cx cy>` for size. Used by
 * the group-walker when Word grouped a logo image with surrounding
 * text shapes — without this branch the image silently dropped.
 */
function extractImageFromPic(
  pic: XmlElement,
  parsedRun: RunContent,
  ctx: Ctx,
  anchorPosition: ImagePosition | undefined,
  anchorWrap: ImageWrap | undefined,
  parentOffsetEmu: { x: number; y: number } = { x: 0, y: 0 }
): void {
  const blipFill = findChild(pic, 'pic:blipFill');
  const blip = blipFill ? findChild(blipFill, 'a:blip') : undefined;
  const rId =
    (blip && (getAttribute(blip, 'r', 'embed') || getAttribute(blip, null, 'embed'))) || '';
  if (!rId) return;

  const spPr = findChild(pic, 'pic:spPr');
  let cx = 0;
  let cy = 0;
  let offX = 0;
  let offY = 0;
  if (spPr) {
    const xfrm = findChild(spPr, 'a:xfrm');
    if (xfrm) {
      const ext = findChild(xfrm, 'a:ext');
      if (ext) {
        cx = Number(getAttribute(ext, null, 'cx') ?? 0);
        cy = Number(getAttribute(ext, null, 'cy') ?? 0);
      }
      const off = findChild(xfrm, 'a:off');
      if (off) {
        offX = Number(getAttribute(off, null, 'x') ?? 0);
        offY = Number(getAttribute(off, null, 'y') ?? 0);
      }
    }
  }
  if (!cx || !cy) return;

  const resolved = resolveImageData(rId, ctx.rels ?? undefined, ctx.media ?? undefined);
  if (!resolved.src) return;

  const nvPicPr = findChild(pic, 'pic:nvPicPr');
  const cNvPr = nvPicPr ? findChild(nvPicPr, 'pic:cNvPr') : undefined;
  const id = cNvPr ? (getAttribute(cNvPr, null, 'id') ?? undefined) : undefined;
  const alt = cNvPr ? (getAttribute(cNvPr, null, 'descr') ?? undefined) : undefined;
  const name = cNvPr ? (getAttribute(cNvPr, null, 'name') ?? undefined) : undefined;

  const totalOff = { x: parentOffsetEmu.x + offX, y: parentOffsetEmu.y + offY };
  const childPosition = addOffsetToAnchor(anchorPosition, totalOff);

  const image: Image = {
    type: 'image',
    rId,
    src: resolved.src,
    mimeType: resolved.mimeType,
    filename: resolved.filename,
    size: { width: cx, height: cy },
    // Wrap matches the group's outer anchor wrap if any; otherwise
    // `inFront` — group children paint out of normal flow, positioned
    // with the group anchor (closest match to "no wrap" in the
    // OOXML WrapType enum).
    wrap: anchorWrap ?? { type: 'inFront' },
    position: childPosition,
  };
  if (id) image.id = id;
  if (alt) image.alt = alt;
  if (name && !image.title) image.title = name;

  parsedRun.content.push({ type: 'drawing', image });
}
