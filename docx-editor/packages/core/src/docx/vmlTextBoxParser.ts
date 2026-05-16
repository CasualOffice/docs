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

  const textBoxEl = findChild(shape, 'v', 'textbox');
  if (!textBoxEl) return null;

  const txbxContent = findDeep(textBoxEl, 'w', 'txbxContent');
  if (!txbxContent) return null;

  // Parse inner paragraphs.
  const content: Paragraph[] = [];
  for (const child of getChildElements(txbxContent)) {
    const local = getLocalName(child.name ?? '');
    if (local === 'p') {
      content.push(parseParagraph(child, null, null, null, null));
    }
  }

  const size = parseVmlShapeSize(shape);
  const id = getAttribute(shape, null, 'id') ?? undefined;

  return {
    type: 'textBox',
    id,
    size,
    content,
  };
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

function parseVmlShapePosition(
  _shapeEl: XmlElement,
  decls: Map<string, string>
): ImagePosition | undefined {
  const isAbsolute = decls.get('position') === 'absolute';
  if (!isAbsolute) return undefined;

  const left = lengthDeclToEmu(decls.get('margin-left'));
  const top = lengthDeclToEmu(decls.get('margin-top'));
  if (left === null && top === null) return undefined;

  // The DOCX `mso-position-*-relative` style hints would let us bind
  // the offset to `page`, `margin`, `paragraph`, etc., but the model's
  // `ImagePosition.horizontal.relativeTo` is required and the typed
  // enum doesn't accept the loose VML strings. Default to a margin-
  // relative anchor — for the SDS-style page-divider shapes this puts
  // the rectangle inside the content area, which is close enough.
  return {
    horizontal: { relativeTo: 'margin', posOffset: left ?? 0 },
    vertical: { relativeTo: 'paragraph', posOffset: top ?? 0 },
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

  const size = parseVmlShapeSize(shape);
  const style = getAttribute(shape, null, 'style') ?? '';
  const decls = parseVmlStyle(style);
  const position = parseVmlShapePosition(shape, decls);
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
    // Schema requires (paragraph | table)+ — emit one empty paragraph
    // so the textBox node is valid; the renderer paints fill + outline
    // regardless of inner content.
    content: [buildEmptyParagraph()],
  };
}
