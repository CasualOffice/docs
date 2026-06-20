/**
 * VML Text Box Parser
 *
 * Legacy Vector Markup Language (VML) shape format used by older Word
 * versions (and some current Word saves) for text frames:
 *
 *   <w:r>
 *     <w:pict>
 *       <v:group>?           [optional grouping element]
 *         <v:shape type="#_x0000_t202" ...>
 *           <v:textbox inset="...">
 *             <w:txbxContent>
 *               <w:p>...</w:p>
 *             </w:txbxContent>
 *           </v:textbox>
 *         </v:shape>
 *       </v:group>?
 *     </w:pict>
 *   </w:r>
 *
 * The shape type `#_x0000_t202` is Microsoft's well-known shape id for
 * text frames. Decorative VML shapes (lines, ovals, paths) carry other
 * type ids or no type at all and are not treated as text frames.
 *
 * The modern DrawingML equivalent (`<wps:wsp>` / `<wps:txbx>`) is parsed
 * by `textBoxParser.ts`. This module exists separately so the legacy
 * code path can be skipped quickly when only DrawingML is present.
 */

import type {
  TextBox,
  Paragraph,
  ImageSize,
  ShapeFill,
  ShapeOutline,
  ImagePosition,
} from '../types/content';
import {
  findDeep,
  findChild,
  getChildElements,
  getLocalName,
  getAttribute,
  type XmlElement,
} from './xmlParser';
import type { ParagraphParserFn } from './textBoxParser';

const VML_TEXTBOX_SHAPE_TYPE = '#_x0000_t202';

/**
 * Does this `<w:pict>` element contain a VML text frame we can parse?
 * Walks direct children + one level of grouping (`<v:group>`).
 */
export function isVmlTextBoxPict(pictEl: XmlElement): boolean {
  return findVmlTextBoxShape(pictEl) !== null;
}

/**
 * Locate the `<v:shape type="#_x0000_t202">` inside a `<w:pict>`.
 * Returns null if no text-frame shape is present.
 */
function findVmlTextBoxShape(pictEl: XmlElement): XmlElement | null {
  const children = getChildElements(pictEl);
  for (const child of children) {
    const local = getLocalName(child.name ?? '');
    if (local === 'shape' && isTextBoxShape(child)) return child;
    if (local === 'group') {
      const inGroup = findInGroup(child);
      if (inGroup) return inGroup;
    }
  }
  return null;
}

function findInGroup(groupEl: XmlElement): XmlElement | null {
  for (const child of getChildElements(groupEl)) {
    if (getLocalName(child.name ?? '') === 'shape' && isTextBoxShape(child)) return child;
  }
  return null;
}

function isTextBoxShape(shapeEl: XmlElement): boolean {
  const type = getAttribute(shapeEl, null, 'type');
  return type === VML_TEXTBOX_SHAPE_TYPE;
}

/**
 * Parse a `<w:pict>` element to a TextBox structure.
 * Size is derived best-effort from the `<v:shape>`'s `style` attribute
 * (CSS-like declarations using `pt`, `px`, or unit-less twips).
 * Returns null if no text-frame shape or `<w:txbxContent>` is found.
 */
export function parseVmlTextBox(
  pictEl: XmlElement,
  parseParagraph: ParagraphParserFn
): TextBox | null {
  const shape = findVmlTextBoxShape(pictEl);
  if (!shape) return null;
  return textBoxShapeToTextBox(shape, parseParagraph, undefined);
}

/**
 * Extract width/height from the VML shape's `style` attribute. Defaults
 * to a reasonable rendering size when unparseable so the user still sees
 * the content rather than a zero-area box.
 */
function parseVmlShapeSize(shapeEl: XmlElement): ImageSize {
  const DEFAULT_WIDTH_EMU = 2_200_000;
  const DEFAULT_HEIGHT_EMU = 500_000;

  const style = getAttribute(shapeEl, null, 'style') ?? '';
  const decls = new Map<string, string>();
  for (const part of style.split(';')) {
    const [k, v] = part.split(':');
    if (k && v) decls.set(k.trim().toLowerCase(), v.trim());
  }

  const widthEmu = lengthDeclToEmu(decls.get('width')) ?? DEFAULT_WIDTH_EMU;
  const heightEmu = lengthDeclToEmu(decls.get('height')) ?? DEFAULT_HEIGHT_EMU;

  return { width: widthEmu, height: heightEmu };
}

/**
 * Convert a VML length declaration to EMUs. VML accepts `Npt`, `Npx`,
 * or a bare number (interpreted as twips per Word's VML convention).
 */
function lengthDeclToEmu(value: string | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  const num = parseFloat(trimmed);
  if (!Number.isFinite(num)) return null;

  if (trimmed.endsWith('pt')) {
    // 1 pt = 12700 EMU
    return Math.round(num * 12700);
  }
  if (trimmed.endsWith('px')) {
    // 1 px ≈ 0.75 pt at 96dpi → 9525 EMU
    return Math.round(num * 9525);
  }
  // Bare number → twips
  // 1 twip = 635 EMU
  return Math.round(num * 635);
}

// ============================================================================
// VML DECORATIVE SHAPES (non-textbox)
// ============================================================================

/**
 * Decorative VML shapes — `<v:rect>`, `<v:oval>`, `<v:line>` — that do
 * NOT carry an inner `<v:textbox>`. Common in older Word docs as page
 * dividers, banner bars, signature lines, etc.
 *
 * We emit them as a `TextBox` whose `content` is a single empty
 * paragraph (the PM textBox schema requires `(paragraph | table)+`).
 * The renderer in `renderTextBox.ts` paints the fill + outline based on
 * the TextBox's `fill`/`outline` fields regardless of whether the inner
 * content has any text, so the box appears as a styled rectangle.
 *
 * Per OOXML §9.4.2 (legacy VML), the wire format is CSS-like style
 * declarations on a single attribute — same shape this module already
 * parses for VML text frames. The supported tags here are limited to
 * shapes whose visual is a single filled rectangle:
 *
 *   <v:rect ... fillcolor="#000" stroked="false">
 *     <v:fill type="solid"/>
 *   </v:rect>
 *
 * `<v:oval>` is rendered as a rectangle too — close enough for most
 * decorative-banner use cases, and round-trips faithfully on save
 * because we keep no shape-type-specific data here.
 */
const VML_DECORATIVE_TAGS = new Set(['rect', 'oval', 'line']);

function parseVmlStyle(styleAttr: string): Map<string, string> {
  const decls = new Map<string, string>();
  for (const part of styleAttr.split(';')) {
    const [k, v] = part.split(':');
    if (k && v) decls.set(k.trim().toLowerCase(), v.trim());
  }
  return decls;
}

function buildEmptyParagraph(): Paragraph {
  return { type: 'paragraph', content: [] };
}

function parseFillForShape(shapeEl: XmlElement): ShapeFill | undefined {
  // `filled="false"` means no fill regardless of fillcolor.
  const filled = getAttribute(shapeEl, null, 'filled');
  if (filled === 'false' || filled === 'f') return { type: 'none' };

  const fillcolor = getAttribute(shapeEl, null, 'fillcolor');
  if (!fillcolor) return undefined;
  const rgb = normalizeHex(fillcolor);
  if (!rgb) return undefined;
  return { type: 'solid', color: { rgb } };
}

function parseOutlineForShape(shapeEl: XmlElement): ShapeOutline | undefined {
  const stroked = getAttribute(shapeEl, null, 'stroked');
  if (stroked === 'false' || stroked === 'f') return undefined;

  const strokecolor = getAttribute(shapeEl, null, 'strokecolor');
  const strokeweight = getAttribute(shapeEl, null, 'strokeweight');
  if (!strokecolor && !strokeweight) return undefined;

  const outline: ShapeOutline = {};
  if (strokecolor) {
    const rgb = normalizeHex(strokecolor);
    if (rgb) outline.color = { rgb };
  }
  if (strokeweight) {
    const emu = lengthDeclToEmu(strokeweight);
    if (emu) outline.width = emu;
  }
  return outline;
}

function normalizeHex(value: string): string | null {
  const trimmed = value.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toUpperCase();
  if (/^[0-9a-fA-F]{3}$/.test(trimmed)) {
    return trimmed
      .toUpperCase()
      .split('')
      .map((c) => c + c)
      .join('');
  }
  // Some VML uses CSS-style names like "white", "black" — skip for now
  // (the SDS fixture's shapes all use #RRGGBB).
  return null;
}

/** VML `mso-position-horizontal-relative` → OOXML ST_RelFromH. */
const VML_H_REL: Record<string, ImagePosition['horizontal']['relativeTo']> = {
  page: 'page',
  margin: 'margin',
  text: 'column',
  char: 'character',
  'left-margin-area': 'leftMargin',
  'right-margin-area': 'rightMargin',
  'inner-margin-area': 'insideMargin',
  'outer-margin-area': 'outsideMargin',
};
/** VML `mso-position-vertical-relative` → OOXML ST_RelFromV. */
const VML_V_REL: Record<string, ImagePosition['vertical']['relativeTo']> = {
  page: 'page',
  margin: 'margin',
  text: 'paragraph',
  line: 'line',
  'top-margin-area': 'topMargin',
  'bottom-margin-area': 'bottomMargin',
  'inner-margin-area': 'insideMargin',
  'outer-margin-area': 'outsideMargin',
};
const VML_H_ALIGN: Record<string, ImagePosition['horizontal']['alignment']> = {
  left: 'left',
  center: 'center',
  right: 'right',
  inside: 'inside',
  outside: 'outside',
};
const VML_V_ALIGN: Record<string, ImagePosition['vertical']['alignment']> = {
  top: 'top',
  center: 'center',
  bottom: 'bottom',
  inside: 'inside',
  outside: 'outside',
};

function parseVmlShapePosition(
  _shapeEl: XmlElement,
  decls: Map<string, string>
): ImagePosition | undefined {
  const isAbsolute = decls.get('position') === 'absolute';
  if (!isAbsolute) return undefined;

  const left = lengthDeclToEmu(decls.get('margin-left'));
  const top = lengthDeclToEmu(decls.get('margin-top'));

  // `mso-position-*-relative` binds the offset frame (page / margin / column /
  // …); `mso-position-*` carries a symbolic alignment (left/center/right or
  // `absolute` = use the offset). Defaults mirror Word: margin for H, paragraph
  // for V.
  const hRel = VML_H_REL[decls.get('mso-position-horizontal-relative') ?? ''] ?? 'margin';
  const vRel = VML_V_REL[decls.get('mso-position-vertical-relative') ?? ''] ?? 'paragraph';
  const hPos = decls.get('mso-position-horizontal');
  const vPos = decls.get('mso-position-vertical');
  const hAlign = hPos && hPos !== 'absolute' ? VML_H_ALIGN[hPos] : undefined;
  const vAlign = vPos && vPos !== 'absolute' ? VML_V_ALIGN[vPos] : undefined;

  if (left === null && top === null && !hAlign && !vAlign) return undefined;

  return {
    horizontal: hAlign
      ? { relativeTo: hRel, alignment: hAlign }
      : { relativeTo: hRel, posOffset: left ?? 0 },
    vertical: vAlign
      ? { relativeTo: vRel, alignment: vAlign }
      : { relativeTo: vRel, posOffset: top ?? 0 },
  };
}

/** Does this `<w:pict>` contain a decorative VML shape we can render? */
export function isVmlDecorativeShapePict(pictEl: XmlElement): boolean {
  return findVmlDecorativeShape(pictEl) !== null;
}

function findVmlDecorativeShape(pictEl: XmlElement): XmlElement | null {
  for (const child of getChildElements(pictEl)) {
    const local = getLocalName(child.name ?? '');
    if (VML_DECORATIVE_TAGS.has(local)) return child;
    if (local === 'group') {
      for (const inner of getChildElements(child)) {
        if (VML_DECORATIVE_TAGS.has(getLocalName(inner.name ?? ''))) return inner;
      }
    }
  }
  return null;
}

/**
 * Parse a `<w:pict>` element containing one VML decorative shape to a
 * `TextBox`-shaped record. Returns `null` if no decorative shape was
 * found. The caller decides whether to wrap it back into a `Shape` /
 * `ShapeContent` for injection into the document tree (same as the
 * text-frame path).
 */
export function parseVmlDecorativeShape(pictEl: XmlElement): TextBox | null {
  const shape = findVmlDecorativeShape(pictEl);
  if (!shape) return null;
  // Only meaningful for a direct (ungrouped) decorative shape; grouped
  // shapes go through `parseVmlShapes` so the group transform applies.
  return decorativeShapeToTextBox(shape);
}

function decorativeShapeToTextBox(shape: XmlElement, transform?: GroupTransform): TextBox {
  const style = getAttribute(shape, null, 'style') ?? '';
  const decls = parseVmlStyle(style);

  const size = transform ? transformChildSize(decls, transform) : parseVmlShapeSize(shape);
  const position = transform
    ? transformChildPosition(decls, transform)
    : parseVmlShapePosition(shape, decls);

  const fill = parseFillForShape(shape);
  const outline = parseOutlineForShape(shape);
  const id = getAttribute(shape, null, 'id') ?? undefined;

  return {
    type: 'textBox',
    id,
    size,
    position,
    fill,
    outline,
    // Decorative shapes (box-border rects, dividers) are pure fill with no text
    // inset — zero margins so a ~0.6px hairline rect isn't floored to its 8px
    // default vertical padding under box-sizing:border-box (#18).
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    // Schema requires (paragraph | table)+ — emit one empty paragraph
    // so the textBox node is valid; the renderer paints fill + outline
    // regardless of inner content.
    content: [buildEmptyParagraph()],
  };
}

// ============================================================================
// VML GROUPS (<v:group>) — transform + multi-shape expansion
// ============================================================================

/**
 * The coordinate transform a `<v:group>` imposes on its children. A child
 * shape lives in the group's local coordinate space, defined by
 * `coordorigin="x,y"` / `coordsize="w,h"`. That space maps onto the page
 * rectangle the group's own `style` describes (margin offset + width/height).
 *
 * Mapping for a child at local (cx,cy) of local size (cw,ch):
 *   pageX = groupLeftEmu + (cx - originX) * scaleX
 *   pageY = groupTopEmu  + (cy - originY) * scaleY
 *   pageW = cw * scaleX,  pageH = ch * scaleY
 * where scaleX = groupWidthEmu / coordW, scaleY = groupHeightEmu / coordH.
 */
interface GroupTransform {
  /** Page-space offset of the group origin (EMU); undefined when the group
   *  carries only relative anchoring and no margin offset. */
  leftEmu: number | null;
  topEmu: number | null;
  /** Group anchoring frame, inherited by every child. */
  position: ImagePosition | undefined;
  originX: number;
  originY: number;
  scaleX: number;
  scaleY: number;
}

function parseCoordPair(value: string | null | undefined): [number, number] | null {
  if (!value) return null;
  const parts = value.split(',');
  if (parts.length !== 2) return null;
  const a = parseFloat(parts[0]);
  const b = parseFloat(parts[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return [a, b];
}

function buildGroupTransform(groupEl: XmlElement): GroupTransform {
  const style = getAttribute(groupEl, null, 'style') ?? '';
  const decls = parseVmlStyle(style);

  const groupWidthEmu = lengthDeclToEmu(decls.get('width'));
  const groupHeightEmu = lengthDeclToEmu(decls.get('height'));

  const origin = parseCoordPair(getAttribute(groupEl, null, 'coordorigin')) ?? [0, 0];
  const coordSize = parseCoordPair(getAttribute(groupEl, null, 'coordsize'));

  // Scale = page-EMU span / coordinate-unit span. Falls back to 1 (identity)
  // when either side is missing so children at least land at the origin.
  const scaleX =
    coordSize && coordSize[0] !== 0 && groupWidthEmu !== null ? groupWidthEmu / coordSize[0] : 1;
  const scaleY =
    coordSize && coordSize[1] !== 0 && groupHeightEmu !== null ? groupHeightEmu / coordSize[1] : 1;

  return {
    leftEmu: lengthDeclToEmu(decls.get('margin-left')),
    topEmu: lengthDeclToEmu(decls.get('margin-top')),
    position: parseVmlShapePosition(groupEl, decls),
    originX: origin[0],
    originY: origin[1],
    scaleX,
    scaleY,
  };
}

/**
 * A child of a `<v:group>` carries its geometry as bare numbers in the
 * group's coordinate space (NOT twips), e.g. `left:0;top:0;width:9131`.
 * Read them as plain floats — the transform converts to page EMU.
 */
function childCoordValue(value: string | undefined): number | null {
  if (!value) return null;
  const num = parseFloat(value.trim());
  return Number.isFinite(num) ? num : null;
}

function transformChildSize(decls: Map<string, string>, t: GroupTransform): ImageSize {
  const cw = childCoordValue(decls.get('width'));
  const ch = childCoordValue(decls.get('height'));
  return {
    width: cw !== null ? Math.max(1, Math.round(cw * t.scaleX)) : 0,
    height: ch !== null ? Math.max(1, Math.round(ch * t.scaleY)) : 0,
  };
}

function transformChildPosition(
  decls: Map<string, string>,
  t: GroupTransform
): ImagePosition | undefined {
  // No anchoring frame from the group → nothing meaningful to offset against.
  if (!t.position) return undefined;

  const cx = childCoordValue(decls.get('left')) ?? 0;
  const cy = childCoordValue(decls.get('top')) ?? 0;

  const childLeftEmu = Math.round((cx - t.originX) * t.scaleX);
  const childTopEmu = Math.round((cy - t.originY) * t.scaleY);

  const horizontal = { ...t.position.horizontal };
  const vertical = { ...t.position.vertical };

  // Add the child's in-group offset to the group's page offset. Only adjust
  // posOffset-style anchoring; alignment-anchored groups keep their alignment.
  if (horizontal.alignment === undefined) {
    horizontal.posOffset = (t.leftEmu ?? horizontal.posOffset ?? 0) + childLeftEmu;
  }
  if (vertical.alignment === undefined) {
    vertical.posOffset = (t.topEmu ?? vertical.posOffset ?? 0) + childTopEmu;
  }

  return { horizontal, vertical };
}

/**
 * Parse a `<w:pict>` into ALL the VML shapes it carries, expanding any
 * `<v:group>` into its individual children with the group's coordinate
 * transform applied. Text-frame shapes (`#_x0000_t202`) get their inner
 * `<w:txbxContent>` parsed; decorative `<v:rect>` / `<v:oval>` / `<v:line>`
 * become styled rectangles.
 *
 * This is the multi-shape entry point the enricher uses; the older
 * single-shape `parseVmlTextBox` / `parseVmlDecorativeShape` remain for
 * callers that only need the first shape (and the `isVml*Pict` probes).
 */
export function parseVmlShapes(pictEl: XmlElement, parseParagraph: ParagraphParserFn): TextBox[] {
  const out: TextBox[] = [];
  for (const child of getChildElements(pictEl)) {
    const local = getLocalName(child.name ?? '');
    if (local === 'group') {
      collectGroupShapes(child, buildGroupTransform(child), parseParagraph, out);
      continue;
    }
    if (local === 'shape' && isTextBoxShape(child)) {
      const tb = textBoxShapeToTextBox(child, parseParagraph, undefined);
      if (tb) out.push(tb);
      continue;
    }
    if (VML_DECORATIVE_TAGS.has(local)) {
      out.push(decorativeShapeToTextBox(child, undefined));
    }
  }
  return out;
}

function collectGroupShapes(
  groupEl: XmlElement,
  transform: GroupTransform,
  parseParagraph: ParagraphParserFn,
  out: TextBox[]
): void {
  for (const child of getChildElements(groupEl)) {
    const local = getLocalName(child.name ?? '');
    if (local === 'group') {
      // Nested group — compose transforms by chaining the outer onto a
      // fresh inner transform. Simplest faithful approach: recurse with the
      // inner group's own transform; the inner group's page offset already
      // derives from its style. (Deep nesting is rare in real docs.)
      collectGroupShapes(child, buildGroupTransform(child), parseParagraph, out);
      continue;
    }
    if (local === 'shape' && isTextBoxShape(child)) {
      const tb = textBoxShapeToTextBox(child, parseParagraph, transform);
      if (tb) out.push(tb);
      continue;
    }
    if (VML_DECORATIVE_TAGS.has(local)) {
      out.push(decorativeShapeToTextBox(child, transform));
    }
  }
}

/**
 * Convert a single `<v:shape type="#_x0000_t202">` text-frame element to a
 * TextBox, optionally applying a group transform to its size/position.
 */
function textBoxShapeToTextBox(
  shape: XmlElement,
  parseParagraph: ParagraphParserFn,
  transform?: GroupTransform
): TextBox | null {
  const textBoxEl = findChild(shape, 'v', 'textbox');
  if (!textBoxEl) return null;

  const txbxContent = findDeep(textBoxEl, 'w', 'txbxContent');
  if (!txbxContent) return null;

  const content: Paragraph[] = [];
  for (const child of getChildElements(txbxContent)) {
    if (getLocalName(child.name ?? '') === 'p') {
      content.push(parseParagraph(child, null, null, null, null));
    }
  }

  const style = getAttribute(shape, null, 'style') ?? '';
  const decls = parseVmlStyle(style);
  const size = transform ? transformChildSize(decls, transform) : parseVmlShapeSize(shape);
  const position = transform
    ? transformChildPosition(decls, transform)
    : parseVmlShapePosition(shape, decls);
  const id = getAttribute(shape, null, 'id') ?? undefined;

  return {
    type: 'textBox',
    id,
    size,
    position,
    content,
  };
}
