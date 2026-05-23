/**
 * Document Content Model
 *
 * All content-bearing types: runs, hyperlinks, bookmarks, fields,
 * images, shapes, tables, lists, paragraphs, headers/footers,
 * footnotes/endnotes, and sections.
 *
 * These types form a deeply interrelated tree (Paragraph ↔ Table ↔ ShapeTextBody)
 * and are kept together to avoid circular import issues.
 */

import type { ColorValue, ThemeColorSlot, BorderSpec } from './colors';
import type { WrapType } from '../docx/wrapTypes';
import type {
  TextFormatting,
  ParagraphFormatting,
  TableFormatting,
  TableRowFormatting,
  TableCellFormatting,
} from './formatting';
import type { NumberFormat, ListRendering } from './lists';

// ============================================================================
// RUN CONTENT TYPES
// ============================================================================

/**
 * Plain text content
 */
export interface TextContent {
  type: 'text';
  /** The text string */
  text: string;
  /** Preserve whitespace (xml:space="preserve") */
  preserveSpace?: boolean;
}

/**
 * Tab character
 */
export interface TabContent {
  type: 'tab';
}

/**
 * Line break
 */
export interface BreakContent {
  type: 'break';
  /** Break type */
  breakType?: 'page' | 'column' | 'textWrapping';
  /** Clear type for text wrapping break */
  clear?: 'none' | 'left' | 'right' | 'all';
}

/**
 * Symbol character (special font character)
 */
export interface SymbolContent {
  type: 'symbol';
  /** Font name */
  font: string;
  /** Character code */
  char: string;
}

/**
 * Footnote or endnote reference
 */
export interface NoteReferenceContent {
  type: 'footnoteRef' | 'endnoteRef';
  /** Note ID */
  id: number;
}

/**
 * Field character (begin/separate/end)
 */
export interface FieldCharContent {
  type: 'fieldChar';
  /** Field character type */
  charType: 'begin' | 'separate' | 'end';
  /** Field is locked */
  fldLock?: boolean;
  /** Field is dirty (needs update) */
  dirty?: boolean;
}

/**
 * Field instruction text
 */
export interface InstrTextContent {
  type: 'instrText';
  /** Field instruction */
  text: string;
}

/**
 * Soft hyphen
 */
export interface SoftHyphenContent {
  type: 'softHyphen';
}

/**
 * Non-breaking hyphen
 */
export interface NoBreakHyphenContent {
  type: 'noBreakHyphen';
}

/**
 * Drawing/image reference
 */
export interface DrawingContent {
  type: 'drawing';
  /** Image data */
  image: Image;
}

/**
 * Shape reference
 */
export interface ShapeContent {
  type: 'shape';
  /** Shape data */
  shape: Shape;
}

/**
 * All possible run content types
 */
export type RunContent =
  | TextContent
  | TabContent
  | BreakContent
  | SymbolContent
  | NoteReferenceContent
  | FieldCharContent
  | InstrTextContent
  | SoftHyphenContent
  | NoBreakHyphenContent
  | DrawingContent
  | ShapeContent;

// ============================================================================
// RUN (w:r)
// ============================================================================

/**
 * A run is a contiguous region of text with the same formatting
 */
export interface Run {
  type: 'run';
  /** Text formatting properties */
  formatting?: TextFormatting;
  /** Run-level tracked property changes (w:rPrChange) */
  propertyChanges?: RunPropertyChange[];
  /** Run content (text, tabs, breaks, etc.) */
  content: RunContent[];
}

// ============================================================================
// HYPERLINKS & BOOKMARKS
// ============================================================================

/**
 * Hyperlink (w:hyperlink)
 */
export interface Hyperlink {
  type: 'hyperlink';
  /** Relationship ID for external link */
  rId?: string;
  /** Resolved URL (from relationships) */
  href?: string;
  /** Internal bookmark anchor */
  anchor?: string;
  /** Tooltip text */
  tooltip?: string;
  /** Target frame */
  target?: string;
  /** Link history tracking */
  history?: boolean;
  /** Document location */
  docLocation?: string;
  /** Child runs */
  children: (Run | BookmarkStart | BookmarkEnd)[];
}

/**
 * Bookmark start marker (w:bookmarkStart)
 */
export interface BookmarkStart {
  type: 'bookmarkStart';
  /** Bookmark ID */
  id: number;
  /** Bookmark name */
  name: string;
  /** Column index for table bookmarks */
  colFirst?: number;
  colLast?: number;
}

/**
 * Bookmark end marker (w:bookmarkEnd)
 */
export interface BookmarkEnd {
  type: 'bookmarkEnd';
  /** Bookmark ID */
  id: number;
}

// ============================================================================
// FIELDS
// ============================================================================

/**
 * Known field types
 */
export type FieldType =
  | 'PAGE'
  | 'NUMPAGES'
  | 'NUMWORDS'
  | 'NUMCHARS'
  | 'DATE'
  | 'TIME'
  | 'CREATEDATE'
  | 'SAVEDATE'
  | 'PRINTDATE'
  | 'AUTHOR'
  | 'TITLE'
  | 'SUBJECT'
  | 'KEYWORDS'
  | 'COMMENTS'
  | 'FILENAME'
  | 'FILESIZE'
  | 'TEMPLATE'
  | 'DOCPROPERTY'
  | 'DOCVARIABLE'
  | 'REF'
  | 'PAGEREF'
  | 'NOTEREF'
  | 'HYPERLINK'
  | 'TOC'
  | 'TOA'
  | 'INDEX'
  | 'SEQ'
  | 'STYLEREF'
  | 'AUTONUM'
  | 'AUTONUMLGL'
  | 'AUTONUMOUT'
  | 'IF'
  | 'MERGEFIELD'
  | 'NEXT'
  | 'NEXTIF'
  | 'ASK'
  | 'SET'
  | 'QUOTE'
  | 'INCLUDETEXT'
  | 'INCLUDEPICTURE'
  | 'SYMBOL'
  | 'ADVANCE'
  | 'EDITTIME'
  | 'REVNUM'
  | 'SECTION'
  | 'SECTIONPAGES'
  | 'USERADDRESS'
  | 'USERNAME'
  | 'USERINITIALS'
  | 'UNKNOWN';

/**
 * Simple field (w:fldSimple)
 */
export interface SimpleField {
  type: 'simpleField';
  /** Field instruction (e.g., "PAGE \\* MERGEFORMAT") */
  instruction: string;
  /** Parsed field type */
  fieldType: FieldType;
  /** Current display value */
  content: (Run | Hyperlink)[];
  /** Field is locked */
  fldLock?: boolean;
  /** Field is dirty */
  dirty?: boolean;
}

/**
 * Complex field (w:fldChar begin/separate/end with w:instrText)
 */
export interface ComplexField {
  type: 'complexField';
  /** Field instruction */
  instruction: string;
  /** Parsed field type */
  fieldType: FieldType;
  /** Field code runs */
  fieldCode: Run[];
  /** Display result runs */
  fieldResult: Run[];
  /** Field is locked */
  fldLock?: boolean;
  /** Field is dirty */
  dirty?: boolean;
}

export type Field = SimpleField | ComplexField;

// ============================================================================
// IMAGES
// ============================================================================

/**
 * Image size specification
 */
export interface ImageSize {
  /** Width in EMUs (English Metric Units) */
  width: number;
  /** Height in EMUs */
  height: number;
}

/**
 * Image wrap type for floating images
 */
export interface ImageWrap {
  type: WrapType;
  /** Wrap text direction */
  wrapText?: 'bothSides' | 'left' | 'right' | 'largest';
  /** Distance from text */
  distT?: number;
  distB?: number;
  distL?: number;
  distR?: number;
}

/**
 * Position for floating images
 */
export interface ImagePosition {
  /** Horizontal positioning */
  horizontal: {
    relativeTo:
      | 'character'
      | 'column'
      | 'insideMargin'
      | 'leftMargin'
      | 'margin'
      | 'outsideMargin'
      | 'page'
      | 'rightMargin';
    alignment?: 'left' | 'right' | 'center' | 'inside' | 'outside';
    posOffset?: number;
  };
  /** Vertical positioning */
  vertical: {
    relativeTo:
      | 'insideMargin'
      | 'line'
      | 'margin'
      | 'outsideMargin'
      | 'page'
      | 'paragraph'
      | 'topMargin'
      | 'bottomMargin';
    alignment?: 'top' | 'bottom' | 'center' | 'inside' | 'outside';
    posOffset?: number;
  };
}

/**
 * Image transformation
 */
export interface ImageTransform {
  /** Rotation in degrees */
  rotation?: number;
  /** Flip horizontal */
  flipH?: boolean;
  /** Flip vertical */
  flipV?: boolean;
}

/**
 * Image padding/margins
 */
export interface ImagePadding {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

/**
 * Image crop, expressed as fractions of the source image to trim from each
 * edge. OOXML's `<a:srcRect l="10000" t="0" r="5000" b="0"/>` uses units of
 * 1/100000 (so 10000 → 0.1 → 10% trimmed from the left). We store the
 * normalised fraction so both the renderer and the saver can read it
 * directly without re-parsing units.
 */
export interface ImageCrop {
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
}

/**
 * Embedded image (w:drawing)
 */
export interface Image {
  type: 'image';
  /** Unique ID */
  id?: string;
  /** Relationship ID for the image data */
  rId: string;
  /** Resolved image data (base64 or blob URL) */
  src?: string;
  /** Image MIME type */
  mimeType?: string;
  /** Original filename */
  filename?: string;
  /** Alt text for accessibility */
  alt?: string;
  /** Title/description */
  title?: string;
  /** Image size */
  size: ImageSize;
  /** Original size before any transforms */
  originalSize?: ImageSize;
  /** Wrap settings */
  wrap: ImageWrap;
  /** Position for floating images */
  position?: ImagePosition;
  /** Image transformations */
  transform?: ImageTransform;
  /** Padding around image */
  padding?: ImagePadding;
  /** Source-image crop (fractional, OOXML `a:srcRect`). */
  crop?: ImageCrop;
  /** Opacity in [0, 1] (OOXML `a:alphaModFix amt`). Undefined = fully opaque. */
  opacity?: number;
  /** Whether this is a decorative image */
  decorative?: boolean;
  /**
   * `wp:anchor layoutInCell` — when true (default), an anchored image inside
   * a table cell is constrained to the cell. When false, the image escapes
   * the cell into the page area. Round-tripped on save.
   */
  layoutInCell?: boolean;
  /**
   * `wp:anchor allowOverlap` — when true (default), anchored objects may
   * overlap; when false, Word repositions them to avoid collisions. We
   * don't currently reposition; we round-trip the flag so saving preserves
   * the author's intent.
   */
  allowOverlap?: boolean;
  /** Hyperlink URL for clickable image */
  hlinkHref?: string;
  /**
   * Source `r:id` of the `<a:hlinkClick>` on the image's `<wp:docPr>`.
   * Preserved so we can re-emit the same relationship reference rather
   * than allocating a fresh one (which would orphan the existing rels
   * entry on round-trip).
   */
  hlinkRId?: string;
  /** Image outline/border */
  outline?: ShapeOutline;
  /** Image effects */
  effects?: {
    brightness?: number;
    contrast?: number;
    saturation?: number;
  };
  /**
   * Raw `<w:drawing>` (or `<mc:AlternateContent>` envelope) XML captured at
   * parse time. When the serializer sees this on an Image that hasn't been
   * touched by the editor, it emits the raw XML verbatim instead of
   * rebuilding `<w:drawing>` from the model — preserving every attribute
   * we don't model (deep DrawingML descriptors, mc:Fallback branches,
   * vendor namespaces, etc.). Cleared by `fromProseDoc` when the editor
   * has modified the image.
   *
   * Serialize-time invariant: when `rawXml` is set, the serializer skips
   * model-based emission entirely and writes `rawXml` as raw XML.
   */
  rawXml?: string;
  /**
   * Opaque identifier shared by every Shape/Image extracted from the same
   * source envelope (a `<w:drawing>` containing a `<wpg:wgp>` group, or an
   * `<mc:AlternateContent>` whose Choice contains a group). The serializer
   * emits `rawXml` from only the first item carrying a given envelopeKey
   * and skips the others — they're render-only siblings of the same XML
   * blob. Single-shape envelopes leave this unset.
   */
  envelopeKey?: string;
}

// ============================================================================
// SHAPES & TEXT BOXES
// ============================================================================

/**
 * Shape types
 */
export type ShapeType =
  // Basic shapes
  | 'rect'
  | 'roundRect'
  | 'ellipse'
  | 'triangle'
  | 'rtTriangle'
  | 'parallelogram'
  | 'trapezoid'
  | 'pentagon'
  | 'hexagon'
  | 'heptagon'
  | 'octagon'
  | 'decagon'
  | 'dodecagon'
  | 'star4'
  | 'star5'
  | 'star6'
  | 'star7'
  | 'star8'
  | 'star10'
  | 'star12'
  | 'star16'
  | 'star24'
  | 'star32'
  // Lines and connectors
  | 'line'
  | 'straightConnector1'
  | 'bentConnector2'
  | 'bentConnector3'
  | 'bentConnector4'
  | 'bentConnector5'
  | 'curvedConnector2'
  | 'curvedConnector3'
  | 'curvedConnector4'
  | 'curvedConnector5'
  // Arrows
  | 'rightArrow'
  | 'leftArrow'
  | 'upArrow'
  | 'downArrow'
  | 'leftRightArrow'
  | 'upDownArrow'
  | 'quadArrow'
  | 'leftRightUpArrow'
  | 'bentArrow'
  | 'uturnArrow'
  | 'leftUpArrow'
  | 'bentUpArrow'
  | 'curvedRightArrow'
  | 'curvedLeftArrow'
  | 'curvedUpArrow'
  | 'curvedDownArrow'
  | 'stripedRightArrow'
  | 'notchedRightArrow'
  | 'homePlate'
  | 'chevron'
  | 'rightArrowCallout'
  | 'downArrowCallout'
  | 'leftArrowCallout'
  | 'upArrowCallout'
  | 'leftRightArrowCallout'
  | 'quadArrowCallout'
  | 'circularArrow'
  // Flowchart
  | 'flowChartProcess'
  | 'flowChartAlternateProcess'
  | 'flowChartDecision'
  | 'flowChartInputOutput'
  | 'flowChartPredefinedProcess'
  | 'flowChartInternalStorage'
  | 'flowChartDocument'
  | 'flowChartMultidocument'
  | 'flowChartTerminator'
  | 'flowChartPreparation'
  | 'flowChartManualInput'
  | 'flowChartManualOperation'
  | 'flowChartConnector'
  | 'flowChartOffpageConnector'
  | 'flowChartPunchedCard'
  | 'flowChartPunchedTape'
  | 'flowChartSummingJunction'
  | 'flowChartOr'
  | 'flowChartCollate'
  | 'flowChartSort'
  | 'flowChartExtract'
  | 'flowChartMerge'
  | 'flowChartOnlineStorage'
  | 'flowChartDelay'
  | 'flowChartMagneticTape'
  | 'flowChartMagneticDisk'
  | 'flowChartMagneticDrum'
  | 'flowChartDisplay'
  // Callouts
  | 'wedgeRectCallout'
  | 'wedgeRoundRectCallout'
  | 'wedgeEllipseCallout'
  | 'cloudCallout'
  | 'borderCallout1'
  | 'borderCallout2'
  | 'borderCallout3'
  | 'accentCallout1'
  | 'accentCallout2'
  | 'accentCallout3'
  | 'callout1'
  | 'callout2'
  | 'callout3'
  | 'accentBorderCallout1'
  | 'accentBorderCallout2'
  | 'accentBorderCallout3'
  // Other
  | 'actionButtonBlank'
  | 'actionButtonHome'
  | 'actionButtonHelp'
  | 'actionButtonInformation'
  | 'actionButtonBackPrevious'
  | 'actionButtonForwardNext'
  | 'actionButtonBeginning'
  | 'actionButtonEnd'
  | 'actionButtonReturn'
  | 'actionButtonDocument'
  | 'actionButtonSound'
  | 'actionButtonMovie'
  | 'irregularSeal1'
  | 'irregularSeal2'
  | 'frame'
  | 'halfFrame'
  | 'corner'
  | 'diagStripe'
  | 'chord'
  | 'arc'
  | 'bracketPair'
  | 'bracePair'
  | 'leftBracket'
  | 'rightBracket'
  | 'leftBrace'
  | 'rightBrace'
  | 'can'
  | 'cube'
  | 'bevel'
  | 'donut'
  | 'noSmoking'
  | 'blockArc'
  | 'foldedCorner'
  | 'smileyFace'
  | 'heart'
  | 'lightningBolt'
  | 'sun'
  | 'moon'
  | 'cloud'
  | 'snip1Rect'
  | 'snip2SameRect'
  | 'snip2DiagRect'
  | 'snipRoundRect'
  | 'round1Rect'
  | 'round2SameRect'
  | 'round2DiagRect'
  | 'plaque'
  | 'teardrop'
  | 'mathPlus'
  | 'mathMinus'
  | 'mathMultiply'
  | 'mathDivide'
  | 'mathEqual'
  | 'mathNotEqual'
  | 'gear6'
  | 'gear9'
  | 'funnel'
  | 'pieWedge'
  | 'pie'
  | 'leftCircularArrow'
  | 'leftRightCircularArrow'
  | 'swooshArrow'
  | 'textBox';

/**
 * Shape fill type
 */
export interface ShapeFill {
  type: 'none' | 'solid' | 'gradient' | 'pattern' | 'picture';
  /** Solid fill color */
  color?: ColorValue;
  /** Gradient stops for gradient fill */
  gradient?: {
    type: 'linear' | 'radial' | 'rectangular' | 'path';
    angle?: number;
    stops: Array<{
      position: number; // 0-100000
      color: ColorValue;
    }>;
  };
}

/**
 * Shape outline/stroke
 */
export interface ShapeOutline {
  /** Line width in EMUs */
  width?: number;
  /** Line color */
  color?: ColorValue;
  /** Line style */
  style?:
    | 'solid'
    | 'dot'
    | 'dash'
    | 'lgDash'
    | 'dashDot'
    | 'lgDashDot'
    | 'lgDashDotDot'
    | 'sysDot'
    | 'sysDash'
    | 'sysDashDot'
    | 'sysDashDotDot';
  /** Line cap */
  cap?: 'flat' | 'round' | 'square';
  /** Line join */
  join?: 'bevel' | 'miter' | 'round';
  /** Head arrow */
  headEnd?: {
    type: 'none' | 'triangle' | 'stealth' | 'diamond' | 'oval' | 'arrow';
    width?: 'sm' | 'med' | 'lg';
    length?: 'sm' | 'med' | 'lg';
  };
  /** Tail arrow */
  tailEnd?: {
    type: 'none' | 'triangle' | 'stealth' | 'diamond' | 'oval' | 'arrow';
    width?: 'sm' | 'med' | 'lg';
    length?: 'sm' | 'med' | 'lg';
  };
}

/**
 * Text body inside a shape
 */
export interface ShapeTextBody {
  /** Text direction */
  vertical?: boolean;
  /** Rotation */
  rotation?: number;
  /** Anchor/vertical alignment */
  anchor?: 'top' | 'middle' | 'bottom' | 'distributed' | 'justified';
  /** Anchor center */
  anchorCenter?: boolean;
  /** Auto fit */
  autoFit?: 'none' | 'normal' | 'shape';
  /** Text margins */
  margins?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  /** Paragraphs inside the shape */
  content: Paragraph[];
}

/**
 * Shape/drawing object (wps:wsp)
 */
export interface Shape {
  type: 'shape';
  /** Shape type preset */
  shapeType: ShapeType;
  /** Unique ID */
  id?: string;
  /** Name */
  name?: string;
  /** Size in EMUs */
  size: ImageSize;
  /** Position for floating shapes */
  position?: ImagePosition;
  /** Wrap settings */
  wrap?: ImageWrap;
  /** Fill */
  fill?: ShapeFill;
  /** Outline/stroke */
  outline?: ShapeOutline;
  /** Transform */
  transform?: ImageTransform;
  /** Text content inside the shape */
  textBody?: ShapeTextBody;
  /** Custom geometry points */
  customGeometry?: string;
  /**
   * Raw `<w:drawing>` / `<w:pict>` / `<mc:AlternateContent>` XML captured
   * at parse time. When the serializer sees this on a Shape that hasn't
   * been touched by the editor, it emits the raw XML verbatim — which is
   * how we preserve every VML attribute, mc:Fallback branch, and DrawingML
   * descriptor we don't explicitly model. Cleared by `fromProseDoc` when
   * the editor has modified the shape so the next save serializes from
   * the (now-divergent) model rather than emitting stale XML.
   *
   * Serialize-time invariant: when `rawXml` is set, the serializer skips
   * model-based emission entirely and writes `rawXml` as raw XML.
   */
  rawXml?: string;
  /**
   * Opaque identifier shared by every Shape/Image extracted from the same
   * source envelope. See `Image.envelopeKey` for the full contract.
   */
  envelopeKey?: string;
}

/**
 * Text box (floating text container)
 */
export interface TextBox {
  type: 'textBox';
  /** Unique ID */
  id?: string;
  /** Size */
  size: ImageSize;
  /** Position */
  position?: ImagePosition;
  /** Wrap settings */
  wrap?: ImageWrap;
  /** Fill */
  fill?: ShapeFill;
  /** Outline */
  outline?: ShapeOutline;
  /** Text content */
  content: Paragraph[];
  /** Internal margins */
  margins?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  /**
   * Text-fit mode from wps:bodyPr (a:spAutoFit / a:noAutofit / a:normAutofit).
   *
   * - `spAutoFit` — textbox height auto-grows to fit content. Word keeps the
   *   saved `ext.cy` in sync at edit time, but cross-platform font metrics
   *   often disagree, so the saved height is best treated as a *minimum*
   *   when rendering; otherwise text clips.
   * - `noAutofit` — fixed size, content may overflow (Word clips).
   * - `normAutofit` — shrink text to fit (rare; renderer treats as fixed).
   */
  autoFit?: 'spAutoFit' | 'noAutofit' | 'normAutofit';
}

// ============================================================================
// TABLES
// ============================================================================

/**
 * Table cell
 */
export interface TableCell {
  type: 'tableCell';
  /** Cell formatting */
  formatting?: TableCellFormatting;
  /** Cell-level tracked property changes (w:tcPrChange) */
  propertyChanges?: TableCellPropertyChange[];
  /** Tracked structural changes (cell insert/delete/merge) */
  structuralChange?: TableStructuralChangeInfo;
  /** Cell content (paragraphs, tables, etc.) */
  content: (Paragraph | Table)[];
}

/**
 * Table row
 */
export interface TableRow {
  type: 'tableRow';
  /** Row formatting */
  formatting?: TableRowFormatting;
  /** Row-level tracked property changes (w:trPrChange) */
  propertyChanges?: TableRowPropertyChange[];
  /** Tracked structural changes (row insert/delete) */
  structuralChange?: TableStructuralChangeInfo;
  /** Cells in this row */
  cells: TableCell[];
}

/**
 * Table (w:tbl)
 */
export interface Table {
  type: 'table';
  /** Table formatting */
  formatting?: TableFormatting;
  /** Table-level tracked property changes (w:tblPrChange) */
  propertyChanges?: TablePropertyChange[];
  /** Column widths in twips */
  columnWidths?: number[];
  /** Table rows */
  rows: TableRow[];
}

// ============================================================================
// COMMENTS
// ============================================================================

/**
 * A comment (w:comment) from comments.xml
 */
export interface Comment {
  /** Comment ID (matches commentRangeStart/End) */
  id: number;
  /** Author name */
  author: string;
  /** Author initials */
  initials?: string;
  /** Date */
  date?: string;
  /** Comment content (paragraphs) */
  content: Paragraph[];
  /** Parent comment ID (for replies) */
  parentId?: number;
  /** Whether the comment is resolved/done */
  done?: boolean;
}

/**
 * Comment range start marker in paragraph content
 */
export interface CommentRangeStart {
  type: 'commentRangeStart';
  id: number;
}

/**
 * Comment range end marker in paragraph content
 */
export interface CommentRangeEnd {
  type: 'commentRangeEnd';
  id: number;
}

// ============================================================================
// MATH EQUATIONS
// ============================================================================

/**
 * Math equation content (m:oMath or m:oMathPara)
 */
export interface MathEquation {
  type: 'mathEquation';
  /** Whether this is a block (oMathPara) or inline (oMath) equation */
  display: 'inline' | 'block';
  /** Raw OMML XML for round-trip preservation */
  ommlXml: string;
  /** Plain text representation for accessibility/fallback */
  plainText?: string;
}

// ============================================================================
// TRACKED CHANGES
// ============================================================================

/**
 * Tracked change metadata (w:ins, w:del attributes)
 */
export interface TrackedChangeInfo {
  /** Revision ID */
  id: number;
  /** Author who made the change */
  author: string;
  /** Date of the change */
  date?: string;
}

/**
 * Generic tracked property-change wrapper metadata (w:*PrChange)
 */
export interface PropertyChangeInfo extends TrackedChangeInfo {
  /** Optional revision session ID */
  rsid?: string;
}

/**
 * Insertion wrapper (w:ins) — runs inserted by tracked changes
 */
export interface Insertion {
  type: 'insertion';
  /** Tracked change metadata */
  info: TrackedChangeInfo;
  /** Inserted content */
  content: (Run | Hyperlink)[];
}

/**
 * Deletion wrapper (w:del) — runs deleted by tracked changes
 */
export interface Deletion {
  type: 'deletion';
  /** Tracked change metadata */
  info: TrackedChangeInfo;
  /** Deleted content */
  content: (Run | Hyperlink)[];
}

/**
 * Move-from wrapper (w:moveFrom) â€” content moved away from this position
 */
export interface MoveFrom {
  type: 'moveFrom';
  /** Tracked change metadata */
  info: TrackedChangeInfo;
  /** Moved content */
  content: (Run | Hyperlink)[];
}

/**
 * Move-to wrapper (w:moveTo) â€” content moved into this position
 */
export interface MoveTo {
  type: 'moveTo';
  /** Tracked change metadata */
  info: TrackedChangeInfo;
  /** Moved content */
  content: (Run | Hyperlink)[];
}

/**
 * Move-from range start marker (w:moveFromRangeStart) — ECMA-376 §17.13.5.22
 * Pairs with moveFromRangeEnd to delimit the source of a move in the document.
 */
export interface MoveFromRangeStart {
  type: 'moveFromRangeStart';
  id: number;
  name: string;
}

/**
 * Move-from range end marker (w:moveFromRangeEnd)
 */
export interface MoveFromRangeEnd {
  type: 'moveFromRangeEnd';
  id: number;
}

/**
 * Move-to range start marker (w:moveToRangeStart) — ECMA-376 §17.13.5.24
 * Pairs with moveToRangeEnd to delimit the destination of a move.
 */
export interface MoveToRangeStart {
  type: 'moveToRangeStart';
  id: number;
  name: string;
}

/**
 * Move-to range end marker (w:moveToRangeEnd)
 */
export interface MoveToRangeEnd {
  type: 'moveToRangeEnd';
  id: number;
}

/**
 * Run-level tracked wrappers represented in WordprocessingML.
 */
export type TrackedRunChange = Insertion | Deletion | MoveFrom | MoveTo;

/**
 * Run property change (w:rPrChange)
 */
export interface RunPropertyChange {
  type: 'runPropertyChange';
  /** Tracked change metadata */
  info: PropertyChangeInfo;
  /** Run properties before the tracked change */
  previousFormatting?: TextFormatting;
  /** Run properties after the tracked change (editor model convenience) */
  currentFormatting?: TextFormatting;
}

/**
 * Paragraph property change (w:pPrChange)
 */
export interface ParagraphPropertyChange {
  type: 'paragraphPropertyChange';
  /** Tracked change metadata */
  info: PropertyChangeInfo;
  /** Paragraph properties before the tracked change */
  previousFormatting?: ParagraphFormatting;
  /** Paragraph properties after the tracked change (editor model convenience) */
  currentFormatting?: ParagraphFormatting;
}

/**
 * Table property change (w:tblPrChange)
 */
export interface TablePropertyChange {
  type: 'tablePropertyChange';
  /** Tracked change metadata */
  info: PropertyChangeInfo;
  /** Table properties before the tracked change */
  previousFormatting?: TableFormatting;
  /** Table properties after the tracked change (editor model convenience) */
  currentFormatting?: TableFormatting;
}

/**
 * Table row property change (w:trPrChange)
 */
export interface TableRowPropertyChange {
  type: 'tableRowPropertyChange';
  /** Tracked change metadata */
  info: PropertyChangeInfo;
  /** Row properties before the tracked change */
  previousFormatting?: TableRowFormatting;
  /** Row properties after the tracked change (editor model convenience) */
  currentFormatting?: TableRowFormatting;
}

/**
 * Table cell property change (w:tcPrChange)
 */
export interface TableCellPropertyChange {
  type: 'tableCellPropertyChange';
  /** Tracked change metadata */
  info: PropertyChangeInfo;
  /** Cell properties before the tracked change */
  previousFormatting?: TableCellFormatting;
  /** Cell properties after the tracked change (editor model convenience) */
  currentFormatting?: TableCellFormatting;
}

/**
 * Table structural tracked change metadata (row/cell insert/delete/merge)
 */
export interface TableStructuralChangeInfo {
  type:
    | 'tableRowInsertion'
    | 'tableRowDeletion'
    | 'tableCellInsertion'
    | 'tableCellDeletion'
    | 'tableCellMerge';
  /** Tracked change metadata */
  info: TrackedChangeInfo;
}

// ============================================================================
// STRUCTURED DOCUMENT TAGS (SDT / Content Controls)
// ============================================================================

/**
 * SDT type (content control type)
 */
export type SdtType =
  | 'richText'
  | 'plainText'
  | 'date'
  | 'dropdown'
  | 'comboBox'
  | 'checkbox'
  | 'picture'
  | 'buildingBlockGallery'
  | 'group'
  | 'unknown';

/**
 * SDT properties (w:sdtPr)
 */
export interface SdtProperties {
  /** SDT type */
  sdtType: SdtType;
  /** Alias (friendly name) */
  alias?: string;
  /** Tag (developer identifier) */
  tag?: string;
  /** Lock content editing */
  lock?: 'sdtLocked' | 'contentLocked' | 'sdtContentLocked' | 'unlocked';
  /** Placeholder text */
  placeholder?: string;
  /** Whether showing placeholder */
  showingPlaceholder?: boolean;
  /** Date format for date controls */
  dateFormat?: string;
  /** Dropdown/combobox list items */
  listItems?: { displayText: string; value: string }[];
  /** Checkbox checked state */
  checked?: boolean;
  /**
   * SDT instance ID (`<w:id w:val="..."/>`). Word writes a stable
   * integer ID per content control; preserved verbatim so external
   * tools that key off it (Power Automate flows, custom form bindings)
   * keep working after round-trip.
   */
  sdtId?: number;
  /**
   * Review-author color hint for the SDT (`<w15:color w:val="33CCCC"/>`).
   * Word uses this to tint tracked-changes UI inside the control.
   */
  reviewColor?: string;
  /**
   * Glyph rendered when a form checkbox is checked (Office 2010
   * extension — `<w14:checkedState w14:val="0052" w14:font="Wingdings 2"/>`).
   * Both attributes are part of the saved doc; if the checkbox is
   * round-tripped without them, Word falls back to a default glyph
   * pair that may not match the surrounding visual style.
   */
  checkedState?: { val: string; font: string };
  /** Mirror of `checkedState` for the unchecked glyph. */
  uncheckedState?: { val: string; font: string };
}

/**
 * Inline SDT (content control within a paragraph)
 */
export interface InlineSdt {
  type: 'inlineSdt';
  /** SDT properties */
  properties: SdtProperties;
  /** Content runs inside the control */
  content: (Run | Hyperlink)[];
}

/**
 * Block-level SDT (content control wrapping paragraphs/tables)
 */
export interface BlockSdt {
  type: 'blockSdt';
  /** SDT properties */
  properties: SdtProperties;
  /** Block content inside the control */
  content: (Paragraph | Table)[];
}

// ============================================================================
// PARAGRAPH
// ============================================================================

/**
 * Paragraph content types
 */
export type ParagraphContent =
  | Run
  | Hyperlink
  | BookmarkStart
  | BookmarkEnd
  | SimpleField
  | ComplexField
  | InlineSdt
  | CommentRangeStart
  | CommentRangeEnd
  | Insertion
  | Deletion
  | MoveFrom
  | MoveTo
  | MoveFromRangeStart
  | MoveFromRangeEnd
  | MoveToRangeStart
  | MoveToRangeEnd
  | MathEquation
  | ProofErr;

/**
 * Word's editor-internal proofing markers (`<w:proofErr w:type="..."/>`).
 *
 * Word writes these to delimit spans where its spell- or grammar-check
 * flagged something at save time. We don't act on them (the renderer
 * ignores proofErr entirely) but losing them on save makes the audit
 * surface 500+ dropped tags and re-introduces re-checking work on the
 * next open. Round-tripped verbatim.
 */
export interface ProofErr {
  type: 'proofErr';
  errorType: 'spellStart' | 'spellEnd' | 'gramStart' | 'gramEnd';
}

/**
 * Paragraph (w:p)
 */
export interface Paragraph {
  type: 'paragraph';
  /** Unique paragraph ID */
  paraId?: string;
  /** Text ID */
  textId?: string;
  /** Paragraph formatting */
  formatting?: ParagraphFormatting;
  /** Paragraph-level tracked property changes (w:pPrChange) */
  propertyChanges?: ParagraphPropertyChange[];
  /** Paragraph content */
  content: ParagraphContent[];
  /** Computed list rendering (if this is a list item) */
  listRendering?: ListRendering;
  /** Word's cached layout says this paragraph started on a new rendered page. */
  renderedPageBreakBefore?: boolean;
  /** Section properties (if this paragraph ends a section) */
  sectionProperties?: SectionProperties;
}

// ============================================================================
// HEADERS & FOOTERS
// ============================================================================

/**
 * Header/footer type
 */
export type HeaderFooterType = 'default' | 'first' | 'even';

/**
 * Header or footer reference
 */
export interface HeaderReference {
  type: HeaderFooterType;
  rId: string;
}

export interface FooterReference {
  type: HeaderFooterType;
  rId: string;
}

/**
 * Header or footer content
 */
export interface HeaderFooter {
  type: 'header' | 'footer';
  /** Header/footer type */
  hdrFtrType: HeaderFooterType;
  /** Content (paragraphs, tables, etc.) */
  content: (Paragraph | Table)[];
}

// ============================================================================
// FOOTNOTES & ENDNOTES
// ============================================================================

/**
 * Footnote position
 */
export type FootnotePosition = 'pageBottom' | 'beneathText' | 'sectEnd' | 'docEnd';

/**
 * Endnote position
 */
export type EndnotePosition = 'sectEnd' | 'docEnd';

/**
 * Number restart type
 */
export type NoteNumberRestart = 'continuous' | 'eachSect' | 'eachPage';

/**
 * Footnote properties
 */
export interface FootnoteProperties {
  position?: FootnotePosition;
  numFmt?: NumberFormat;
  numStart?: number;
  numRestart?: NoteNumberRestart;
}

/**
 * Endnote properties
 */
export interface EndnoteProperties {
  position?: EndnotePosition;
  numFmt?: NumberFormat;
  numStart?: number;
  numRestart?: NoteNumberRestart;
}

/**
 * Footnote (w:footnote)
 */
export interface Footnote {
  type: 'footnote';
  /** Footnote ID */
  id: number;
  /** Special footnote type */
  noteType?: 'normal' | 'separator' | 'continuationSeparator' | 'continuationNotice';
  /**
   * Content. Per ECMA-376 §17.11.10 footnotes can hold the same blocks as
   * the body — paragraphs and tables. The parser previously only collected
   * <w:p> children which silently dropped any <w:tbl> inside a footnote;
   * widened to match HeaderFooter / TableCell shape so the body pipeline
   * (toProseDoc → toFlowBlocks) can render them uniformly.
   */
  content: (Paragraph | Table)[];
}

/**
 * Endnote (w:endnote)
 */
export interface Endnote {
  type: 'endnote';
  /** Endnote ID */
  id: number;
  /** Special endnote type */
  noteType?: 'normal' | 'separator' | 'continuationSeparator' | 'continuationNotice';
  /**
   * Content. Per ECMA-376 §17.11.4 endnotes can hold the same blocks as
   * the body — paragraphs and tables. See note on `Footnote.content`.
   */
  content: (Paragraph | Table)[];
}

// ============================================================================
// SECTION PROPERTIES
// ============================================================================

/**
 * Page orientation
 */
export type PageOrientation = 'portrait' | 'landscape';

/**
 * Section start type
 */
export type SectionStart = 'continuous' | 'nextPage' | 'oddPage' | 'evenPage' | 'nextColumn';

/**
 * Vertical alignment
 */
export type VerticalAlign = 'top' | 'center' | 'both' | 'bottom';

/**
 * Line number restart type
 */
export type LineNumberRestart = 'continuous' | 'newPage' | 'newSection';

/**
 * Column definition
 */
export interface Column {
  /** Column width in twips */
  width?: number;
  /** Space after column in twips */
  space?: number;
}

/**
 * Section properties (w:sectPr)
 */
export interface SectionProperties {
  // Page size
  /** Page width in twips */
  pageWidth?: number;
  /** Page height in twips */
  pageHeight?: number;
  /** Page orientation */
  orientation?: PageOrientation;

  // Margins
  /** Top margin in twips */
  marginTop?: number;
  /** Bottom margin in twips */
  marginBottom?: number;
  /** Left margin in twips */
  marginLeft?: number;
  /** Right margin in twips */
  marginRight?: number;
  /** Header distance from top in twips */
  headerDistance?: number;
  /** Footer distance from bottom in twips */
  footerDistance?: number;
  /** Gutter margin in twips */
  gutter?: number;

  // Columns
  /** Number of columns */
  columnCount?: number;
  /** Space between columns in twips */
  columnSpace?: number;
  /** Equal width columns */
  equalWidth?: boolean;
  /** Separator line between columns */
  separator?: boolean;
  /** Individual column definitions */
  columns?: Column[];

  // Section behavior
  /** Section start type */
  sectionStart?: SectionStart;
  /** Vertical alignment of text */
  verticalAlign?: VerticalAlign;
  /** Right-to-left section */
  bidi?: boolean;

  // Headers and footers
  /** Header references */
  headerReferences?: HeaderReference[];
  /** Footer references */
  footerReferences?: FooterReference[];
  /** Different first page header/footer */
  titlePg?: boolean;
  /** Different odd/even page headers/footers */
  evenAndOddHeaders?: boolean;

  // Line numbers
  /** Line numbering settings */
  lineNumbers?: {
    start?: number;
    countBy?: number;
    distance?: number;
    restart?: LineNumberRestart;
  };

  // Page borders
  /** Page borders */
  pageBorders?: {
    top?: BorderSpec;
    bottom?: BorderSpec;
    left?: BorderSpec;
    right?: BorderSpec;
    /** Display setting */
    display?: 'allPages' | 'firstPage' | 'notFirstPage';
    /** Offset from */
    offsetFrom?: 'page' | 'text';
    /** Z-order */
    zOrder?: 'front' | 'back';
  };

  // Background
  /** Page background */
  background?: {
    color?: ColorValue;
    themeColor?: ThemeColorSlot;
    themeTint?: string;
    themeShade?: string;
  };

  // Footnote/Endnote properties
  /** Footnote properties for this section */
  footnotePr?: FootnoteProperties;
  /** Endnote properties for this section */
  endnotePr?: EndnoteProperties;

  // Page numbering
  /** Page numbering settings (w:pgNumType) — ECMA-376 §17.6.12 */
  pageNumberType?: {
    /** Starting page number (w:start) */
    start?: number;
    /**
     * Numbering format (w:fmt). Common: 'decimal', 'lowerLetter',
     * 'upperLetter', 'lowerRoman', 'upperRoman'. Full list is the
     * `ST_NumberFormat` enumeration in ECMA-376.
     */
    fmt?: string;
    /** Chapter heading style reference (w:chapStyle) — integer */
    chapStyle?: number;
    /** Chapter / page-number separator character (w:chapSep) */
    chapSep?: 'hyphen' | 'period' | 'colon' | 'emDash' | 'enDash';
  };

  // Document grid
  /** Document grid */
  docGrid?: {
    type?: 'default' | 'lines' | 'linesAndChars' | 'snapToChars';
    linePitch?: number;
    charSpace?: number;
  };

  // Paper source
  /** First page paper source */
  paperSrcFirst?: number;
  /** Other pages paper source */
  paperSrcOther?: number;
}

// ============================================================================
// SECTION & DOCUMENT BODY
// ============================================================================

/**
 * Block-level content types
 */
export type BlockContent = Paragraph | Table | BlockSdt;

/**
 * Section (implicit or explicit based on sectPr)
 */
export interface Section {
  /** Section properties */
  properties: SectionProperties;
  /** Content in this section */
  content: BlockContent[];
  /** Headers for this section */
  headers?: Map<HeaderFooterType, HeaderFooter>;
  /** Footers for this section */
  footers?: Map<HeaderFooterType, HeaderFooter>;
}

/**
 * Document body (w:body)
 */
export interface DocumentBody {
  /** All content (paragraphs, tables) */
  content: BlockContent[];
  /** Sections (derived from sectPr in paragraphs and final sectPr) */
  sections?: Section[];
  /** Final section properties (from body's sectPr) */
  finalSectionProperties?: SectionProperties;
  /** Comments from comments.xml */
  comments?: Comment[];
}
