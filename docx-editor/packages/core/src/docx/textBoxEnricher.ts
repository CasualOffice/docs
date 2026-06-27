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
  elementToXml,
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
import { parseVmlShapes } from './vmlTextBoxParser';
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
 * Tracks the original XML envelope (a `<w:drawing>`, `<w:pict>`, or
 * `<mc:AlternateContent>` element) that the enricher is currently
 * expanding into Shape/Image content for rendering. The serializer
 * uses this so a round-trip of unedited content re-emits the original
 * XML verbatim — the cleanest way to preserve every VML attribute,
 * mc:Fallback branch, and DrawingML descriptor we don't explicitly
 * model.
 *
 * Single-shape envelopes: the lone shape carries `rawXml` and
 * `envelopeKey`.
 *
 * Multi-shape envelopes (wpg:wgp groups, AlternateContent + group):
 * the FIRST extracted child carries `rawXml`; the rest share the same
 * `envelopeKey` but have no `rawXml`. The serializer emits the envelope
 * once via the first item and suppresses every item with a matching,
 * already-emitted envelopeKey.
 */
interface EnvelopeRef {
  rawXml: string;
  key: string;
  consumed: boolean;
}

let envelopeCounter = 0;
function makeEnvelopeRef(el: XmlElement): EnvelopeRef {
  envelopeCounter = (envelopeCounter + 1) & 0xffffffff;
  return {
    rawXml: elementToXml(el),
    key: `env-${envelopeCounter.toString(36)}`,
    consumed: false,
  };
}

/**
 * Returns the envelope tag for the FIRST shape/image in an envelope and
 * just the key for every subsequent sibling. Mutates `envRef.consumed`
 * so the next caller gets the suppress-only form.
 */
function takeEnvelopeTag(envRef: EnvelopeRef): {
  rawXml?: string;
  envelopeKey: string;
} {
  if (envRef.consumed) return { envelopeKey: envRef.key };
  envRef.consumed = true;
  return { rawXml: envRef.rawXml, envelopeKey: envRef.key };
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
      // Single-element envelope: the pict itself is the round-trip
      // anchor (every v:rect / v:shape / v:textbox child of a pict
      // shares one envelope).
      handleVmlPict(runEl, parsedRun, makeEnvelopeRef(runEl));
      continue;
    }

    if (elName === 'drawing') {
      handleDrawing(runEl, parsedRun, ctx, makeEnvelopeRef(runEl));
      continue;
    }

    if (elName === 'AlternateContent') {
      // `<mc:AlternateContent>` envelopes a modern wps / wpg shape +
      // a VML fallback for older clients. Prefer the Choice; fall
      // back to Fallback. Each branch can contain w:drawing / w:pict
      // elements we should still process.
      //
      // The round-trip envelope is the WHOLE AlternateContent, not
      // the inner Choice/Fallback — that way we re-emit both branches
      // on save and Word's "older clients fall back" contract stays
      // intact.
      const children = getChildElements(runEl);
      const choice = children.find((el) => getLocalName(el.name ?? '') === 'Choice');
      const fallback = children.find((el) => getLocalName(el.name ?? '') === 'Fallback');
      const target = choice ?? fallback;
      if (!target) continue;
      const envRef = makeEnvelopeRef(runEl);
      for (const inner of getChildElements(target)) {
        const innerName = getLocalName(inner.name ?? '');
        if (innerName === 'drawing') handleDrawing(inner, parsedRun, ctx, envRef);
        else if (innerName === 'pict') handleVmlPict(inner, parsedRun, envRef);
      }
    }
  }
}

function handleVmlPict(pictEl: XmlElement, parsedRun: RunContent, envRef: EnvelopeRef): void {
  // A `<w:pict>` may hold several shapes — directly, or inside a `<v:group>`
  // (e.g. the SDS divider line is a `<v:rect>` in `docshapegroup20`). Expand
  // them all, applying the group's coordinate transform to each child, so no
  // shape past the first is dropped and grouped shapes are placed/sized right.
  for (const shape of parseVmlShapes(pictEl, parseParagraph)) {
    injectShapeFromTextBox(shape, parsedRun, envRef);
  }
}

function handleDrawing(
  drawingEl: XmlElement,
  parsedRun: RunContent,
  ctx: Ctx,
  envRef: EnvelopeRef
): void {
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
      const anchorWrap = container.name === 'wp:anchor' ? parseAnchorWrap(container) : undefined;
      walkGroupChildren(wgp, parsedRun, ctx, anchorPosition, anchorWrap, { x: 0, y: 0 }, envRef);
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
      injectShapeFromTextBox(textBox, parsedRun, envRef);
    }
    return;
  }

  // Decorative DrawingML shape (no text frame).
  if (isDecorativeShapeDrawing(drawingEl)) {
    const dec = parseDecorativeDrawing(drawingEl);
    if (dec) injectShapeFromTextBox(dec, parsedRun, envRef);
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
  parentOffsetEmu: { x: number; y: number } = { x: 0, y: 0 },
  envRef?: EnvelopeRef
): void {
  const wspChildren = getChildElements(wsp);
  const spPr = wspChildren.find((el) => el.name === 'wps:spPr');
  const txbx = wspChildren.find((el) => el.name === 'wps:txbx');
  const cNvPr = wspChildren.find((el) => el.name === 'wps:cNvPr');
  const cNvCnPr = wspChildren.find((el) => el.name === 'wps:cNvCnPr');
  const id = cNvPr ? (getAttribute(cNvPr, null, 'id') ?? undefined) : undefined;

  // Geometry hint: prstGeom of "line" / "straightConnector1" indicates a
  // connector / divider shape rather than a content rectangle. Combined
  // with the presence of `wps:cNvCnPr` we can be confident the wsp is
  // really a line.
  let geomPrst: string | null = null;
  if (spPr) {
    const prstGeom = getChildElements(spPr).find((el) => el.name === 'a:prstGeom');
    if (prstGeom) geomPrst = getAttribute(prstGeom, null, 'prst');
  }
  const isConnector =
    !!cNvCnPr || geomPrst === 'line' || geomPrst?.startsWith('straightConnector') === true;

  // Size + offset + rotation from xfrm inside spPr (per OOXML §20.4.2.3).
  // `a:xfrm@rot` is in 1/60000 degrees, plus `flipH`/`flipV` booleans.
  let cx = 952500;
  let cy = 952500;
  let offX = 0;
  let offY = 0;
  const xform = readXfrmDetails(spPr);
  if (xform.cx !== undefined) cx = xform.cx;
  if (xform.cy !== undefined) cy = xform.cy;
  offX = xform.offX;
  offY = xform.offY;

  let fill = parseFill(spPr ?? null) ?? undefined;
  const outline = parseOutline(spPr ?? null) ?? undefined;

  // Connector shapes (lines / dividers) come through with `cy=0` (or
  // `cx=0` for vertical lines). The painter renders fill+border on a
  // 0-thickness box as nothing, so the divider disappears. Bump the
  // thin axis to a few EMU + force the outline color into `fill` so the
  // line paints as a solid colored strip.
  if (isConnector || cy === 0 || cx === 0) {
    if (cy === 0) cy = Math.max(outline?.width ?? 0, 19050); // ≈ 2 px floor
    if (cx === 0) cx = Math.max(outline?.width ?? 0, 19050);
    if (!fill && outline?.color) {
      fill = { type: 'solid', color: outline.color };
    }
  }

  // Combine the group's outer anchor with the parent-group's running
  // offset and this child's own xfrm.off so each shape lands at its
  // correct absolute position rather than stacking at the group origin.
  const totalOff = { x: parentOffsetEmu.x + offX, y: parentOffsetEmu.y + offY };
  const childPosition = addOffsetToAnchor(anchorPosition, totalOff);

  // Inner text content, if this wsp is text-bearing. A connector (line /
  // divider) carries no text frame — give it EMPTY content so the empty
  // placeholder paragraph's line height (+ the default text-box insets)
  // don't inflate the thin line into a tall filled bar. Word's "Straight
  // Connector" with a bg1+lumMod fill is a ~1px rule under a logo; without
  // this it rendered as a ~10px gray block (medical-incident-form header).
  let content: Paragraph[] = isConnector ? [] : [{ type: 'paragraph', content: [] }];
  if (txbx && !isConnector) {
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
    // Connectors get zero insets so the line thickness is exactly `cy`/`cx`.
    textBody: isConnector
      ? { content, margins: { top: 0, bottom: 0, left: 0, right: 0 } }
      : { content },
  };
  if (id) shape.id = id;
  if (xform.rotation || xform.flipH || xform.flipV) {
    shape.transform = {
      ...(xform.rotation ? { rotation: xform.rotation } : {}),
      ...(xform.flipH ? { flipH: true } : {}),
      ...(xform.flipV ? { flipV: true } : {}),
    };
  }
  if (envRef) Object.assign(shape, takeEnvelopeTag(envRef));
  parsedRun.content.push({ type: 'shape', shape });
}

function injectShapeFromTextBox(
  textBox: TextBox,
  parsedRun: RunContent,
  envRef?: EnvelopeRef
): void {
  const shape: Shape = {
    type: 'shape',
    shapeType: 'rect',
    size: textBox.size,
    position: textBox.position,
    wrap: textBox.wrap,
    fill: textBox.fill,
    outline: textBox.outline,
    textBody: {
      content: textBox.content.length > 0 ? textBox.content : [{ type: 'paragraph', content: [] }],
      margins: textBox.margins,
    },
  };
  if (textBox.id) shape.id = textBox.id;
  if (envRef) Object.assign(shape, takeEnvelopeTag(envRef));
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
  parentOffsetEmu: { x: number; y: number } = { x: 0, y: 0 },
  envRef: EnvelopeRef
): void {
  for (const child of getChildElements(group)) {
    const local = getLocalName(child.name ?? '');
    if (local === 'wsp') {
      extractShapeFromWsp(
        child,
        parsedRun,
        ctx,
        anchorPosition,
        anchorWrap,
        parentOffsetEmu,
        envRef
      );
    } else if (local === 'pic') {
      extractImageFromPic(
        child,
        parsedRun,
        ctx,
        anchorPosition,
        anchorWrap,
        parentOffsetEmu,
        envRef
      );
    } else if (local === 'grpSp') {
      // Nested group — read its own a:xfrm/a:off and add to the running
      // offset before recursing so deeply nested children land in
      // absolute group coordinates.
      const grpSpPr = findChild(child, 'wpg:grpSpPr');
      const innerOffset = readXfrmOff(grpSpPr);
      walkGroupChildren(
        child,
        parsedRun,
        ctx,
        anchorPosition,
        anchorWrap,
        {
          x: parentOffsetEmu.x + innerOffset.x,
          y: parentOffsetEmu.y + innerOffset.y,
        },
        envRef
      );
    }
    // Other group children (cNvGrpSpPr, etc.) are metadata; skip.
  }
}

/** Read `<a:xfrm><a:off x y>` EMU offset from a wps:spPr / wpg:grpSpPr. */
function readXfrmOff(spPr: XmlElement | undefined): { x: number; y: number } {
  const d = readXfrmDetails(spPr);
  return { x: d.offX, y: d.offY };
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
  parentOffsetEmu: { x: number; y: number } = { x: 0, y: 0 },
  envRef?: EnvelopeRef
): void {
  const blipFill = findChild(pic, 'pic:blipFill');
  const blip = blipFill ? findChild(blipFill, 'a:blip') : undefined;
  const rId =
    (blip && (getAttribute(blip, 'r', 'embed') || getAttribute(blip, null, 'embed'))) || '';
  if (!rId) return;

  const spPr = findChild(pic, 'pic:spPr');
  const xform = readXfrmDetails(spPr);
  const cx = xform.cx ?? 0;
  const cy = xform.cy ?? 0;
  const offX = xform.offX;
  const offY = xform.offY;
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
  if (xform.rotation || xform.flipH || xform.flipV) {
    image.transform = {
      ...(xform.rotation ? { rotation: xform.rotation } : {}),
      ...(xform.flipH ? { flipH: true } : {}),
      ...(xform.flipV ? { flipV: true } : {}),
    };
  }
  if (envRef) Object.assign(image, takeEnvelopeTag(envRef));

  parsedRun.content.push({ type: 'drawing', image });
}

/**
 * Pull size + offset + rotation + flip flags out of an `<a:xfrm>` (or
 * `<wpg:grpSpPr><a:xfrm>`). Rotation comes back in CSS degrees, not the
 * 1/60000ths Word stores. Returns offsets as 0 when missing so callers
 * never need to null-check the numbers.
 */
function readXfrmDetails(spPr: XmlElement | undefined): {
  cx?: number;
  cy?: number;
  offX: number;
  offY: number;
  rotation?: number;
  flipH?: boolean;
  flipV?: boolean;
} {
  const out = {
    cx: undefined as number | undefined,
    cy: undefined as number | undefined,
    offX: 0,
    offY: 0,
  } as {
    cx?: number;
    cy?: number;
    offX: number;
    offY: number;
    rotation?: number;
    flipH?: boolean;
    flipV?: boolean;
  };
  if (!spPr) return out;
  const xfrm = getChildElements(spPr).find((el) => el.name === 'a:xfrm');
  if (!xfrm) return out;

  const ext = getChildElements(xfrm).find((el) => el.name === 'a:ext');
  if (ext) {
    out.cx = Number(getAttribute(ext, null, 'cx') ?? 0);
    out.cy = Number(getAttribute(ext, null, 'cy') ?? 0);
  }
  const off = getChildElements(xfrm).find((el) => el.name === 'a:off');
  if (off) {
    out.offX = Number(getAttribute(off, null, 'x') ?? 0);
    out.offY = Number(getAttribute(off, null, 'y') ?? 0);
  }

  // Word stores rotation in 1/60000 degrees (`rot="5400000"` = 90°).
  // Convert to CSS degrees so consumers can use it directly.
  const rot = getAttribute(xfrm, null, 'rot');
  if (rot) {
    const n = Number(rot);
    if (Number.isFinite(n) && n !== 0) {
      // Keep the result in 0–360 to avoid CSS picking the long path
      // around when the source value is huge.
      out.rotation = (((n / 60000) % 360) + 360) % 360;
    }
  }
  if (getAttribute(xfrm, null, 'flipH') === '1') out.flipH = true;
  if (getAttribute(xfrm, null, 'flipV') === '1') out.flipV = true;

  return out;
}
