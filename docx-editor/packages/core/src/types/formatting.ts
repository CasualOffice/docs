/**
 * Text, Paragraph, and Table Formatting Types
 *
 * Properties that control how text, paragraphs, and table structures
 * are formatted in OOXML (w:rPr, w:pPr, w:tblPr, etc.).
 */

import type { ColorValue, BorderSpec, ShadingProperties } from './colors';

// ============================================================================
// TEXT FORMATTING (Run Properties - rPr)
// ============================================================================

/**
 * Underline style options
 */
export type UnderlineStyle =
  | 'none'
  | 'single'
  | 'words'
  | 'double'
  | 'thick'
  | 'dotted'
  | 'dottedHeavy'
  | 'dash'
  | 'dashedHeavy'
  | 'dashLong'
  | 'dashLongHeavy'
  | 'dotDash'
  | 'dashDotHeavy'
  | 'dotDotDash'
  | 'dashDotDotHeavy'
  | 'wave'
  | 'wavyHeavy'
  | 'wavyDouble';

/**
 * Text effect animations
 */
export type TextEffect =
  | 'none'
  | 'blinkBackground'
  | 'lights'
  | 'antsBlack'
  | 'antsRed'
  | 'shimmer'
  | 'sparkle';

/**
 * Emphasis mark type
 */
export type EmphasisMark = 'none' | 'dot' | 'comma' | 'circle' | 'underDot';

/**
 * Complete text formatting properties (w:rPr)
 */
export interface TextFormatting {
  // Basic formatting
  /** Bold (w:b) */
  bold?: boolean;
  /** Bold complex script (w:bCs) */
  boldCs?: boolean;
  /** Italic (w:i) */
  italic?: boolean;
  /** Italic complex script (w:iCs) */
  italicCs?: boolean;

  // Underline & strikethrough
  /** Underline style and color (w:u) */
  underline?: {
    style: UnderlineStyle;
    color?: ColorValue;
  };
  /** Strikethrough (w:strike) */
  strike?: boolean;
  /** Double strikethrough (w:dstrike) */
  doubleStrike?: boolean;

  // Vertical alignment
  /** Superscript/subscript (w:vertAlign) */
  vertAlign?: 'baseline' | 'superscript' | 'subscript';

  // Capitalization
  /** Small caps (w:smallCaps) */
  smallCaps?: boolean;
  /** All caps (w:caps) */
  allCaps?: boolean;

  // Visibility
  /** Hidden text (w:vanish) */
  hidden?: boolean;

  // Colors and highlighting
  /** Text color (w:color) */
  color?: ColorValue;
  /**
   * Highlight/background color.
   *
   * Two forms:
   *  - One of the OOXML named highlight colors (`<w:highlight w:val="..."/>`,
   *    ECMA-376 §17.18.40). Serializes verbatim.
   *  - A 6-digit hex string (e.g. `"FFEB3B"`). Custom hex colors are NOT
   *    valid for `<w:highlight>` — the serializer emits
   *    `<w:shd w:val="clear" w:color="auto" w:fill="HEX"/>` instead, and
   *    the parser rehydrates the highlight semantic from that on read
   *    (openspec `ooxml-roundtrip-fidelity` #1).
   */
  highlight?:
    | 'black'
    | 'blue'
    | 'cyan'
    | 'darkBlue'
    | 'darkCyan'
    | 'darkGray'
    | 'darkGreen'
    | 'darkMagenta'
    | 'darkRed'
    | 'darkYellow'
    | 'green'
    | 'lightGray'
    | 'magenta'
    | 'none'
    | 'red'
    | 'white'
    | 'yellow'
    // Custom hex colors (e.g. picked from the color picker). The string
    // contract is `[0-9a-fA-F]{6}`; the serializer falls back to <w:shd>.
    | (string & {});
  /** Character shading (w:shd) */
  shading?: ShadingProperties;

  // Font properties
  /** Font size in half-points (w:sz) - e.g., 24 = 12pt */
  fontSize?: number;
  /** Font size complex script (w:szCs) */
  fontSizeCs?: number;
  /** Font family (w:rFonts) */
  fontFamily?: {
    ascii?: string;
    hAnsi?: string;
    eastAsia?: string;
    cs?: string;
    /** Theme font reference */
    asciiTheme?:
      | 'majorAscii'
      | 'majorHAnsi'
      | 'majorEastAsia'
      | 'majorBidi'
      | 'minorAscii'
      | 'minorHAnsi'
      | 'minorEastAsia'
      | 'minorBidi';
    hAnsiTheme?: string;
    eastAsiaTheme?: string;
    csTheme?: string;
  };

  // Spacing and position
  /** Character spacing in twips (w:spacing) */
  spacing?: number;
  /** Raised/lowered text position in half-points (w:position) */
  position?: number;
  /** Horizontal text scale percentage (w:w) */
  scale?: number;
  /** Kerning threshold in half-points (w:kern) */
  kerning?: number;

  // Effects
  /** Text effect animation (w:effect) */
  effect?: TextEffect;
  /** Emphasis mark (w:em) */
  emphasisMark?: EmphasisMark;
  /** Emboss effect (w:emboss) */
  emboss?: boolean;
  /** Imprint/engrave effect (w:imprint) */
  imprint?: boolean;
  /** Outline effect (w:outline) */
  outline?: boolean;
  /** Shadow effect (w:shadow) */
  shadow?: boolean;

  // Complex script
  /** Right-to-left text (w:rtl) */
  rtl?: boolean;
  /** Complex script formatting (w:cs) */
  cs?: boolean;

  // Style reference
  /** Character style ID (w:rStyle) */
  styleId?: string;

  /**
   * Language identifier (`<w:lang>`, ECMA-376 §17.3.2.20). Drives proofing
   * tools, screen readers, and hyphenation. Round-tripped verbatim — we
   * don't act on the value, but losing it on save degrades accessibility
   * and re-introduces spell-check noise. Each child attribute maps 1:1
   * to its OOXML counterpart.
   */
  lang?: {
    /** Latin script language tag, e.g. `"en-US"` (`w:val`). */
    val?: string;
    /** East-Asian script language (`w:eastAsia`). */
    eastAsia?: string;
    /** Bidi/complex script language (`w:bidi`). */
    bidi?: string;
  };

  /** Skip spelling/grammar checking on this run (`<w:noProof>`). */
  noProof?: boolean;
  /** Hidden when the document is viewed in a web layout (`<w:webHidden>`). */
  webHidden?: boolean;

  /**
   * Run border (`<w:bdr>`, ECMA-376 §17.3.2.4) — a box drawn around the run's
   * text. Round-tripped verbatim so Word's "box around text" character
   * formatting survives a save cycle.
   */
  border?: BorderSpec;
}

// ============================================================================
// PARAGRAPH FORMATTING (Paragraph Properties - pPr)
// ============================================================================

/**
 * Tab stop alignment
 */
export type TabStopAlignment = 'left' | 'center' | 'right' | 'decimal' | 'bar' | 'clear' | 'num';

/**
 * Tab leader character
 */
export type TabLeader = 'none' | 'dot' | 'hyphen' | 'underscore' | 'heavy' | 'middleDot';

/**
 * Tab stop definition
 */
export interface TabStop {
  /** Position in twips from left margin */
  position: number;
  /** Alignment at tab stop */
  alignment: TabStopAlignment;
  /** Leader character */
  leader?: TabLeader;
}

/**
 * Line spacing rule
 */
export type LineSpacingRule = 'auto' | 'exact' | 'atLeast';

/**
 * Paragraph alignment/justification
 */
export type ParagraphAlignment =
  | 'left'
  | 'center'
  | 'right'
  | 'both'
  | 'distribute'
  | 'mediumKashida'
  | 'highKashida'
  | 'lowKashida'
  | 'thaiDistribute';

/**
 * Complete paragraph formatting properties (w:pPr)
 */
/** Per-side flags identifying which `<w:spacing>` attrs were inline (not
 *  inherited from a style chain). Used to suppress style-only spacing on
 *  empty paragraphs per Word's behavior. */
export type SpacingExplicit = { before?: boolean; after?: boolean };

export interface ParagraphFormatting {
  /**
   * Records which empty self-closing property elements were present on
   * the source paragraph's pPr (e.g. `<w:pBdr/>`, `<w:spacing/>`,
   * `<w:ind/>`, `<w:rPr/>` with no children or attributes). These are
   * semantically meaningful — they explicitly override the inherited
   * style chain — so they must round-trip back to the same self-closing
   * form even though the populated property fields are absent. The
   * parser sets the flag when it encounters an empty element; the
   * serializer emits the self-closing form when the flag is set and
   * the corresponding populated fields are absent.
   */
  presentEmpty?: {
    pBdr?: boolean;
    spacing?: boolean;
    ind?: boolean;
    rPr?: boolean;
  };

  // Alignment
  /** Paragraph alignment (w:jc) */
  alignment?: ParagraphAlignment;
  /** Text direction (w:bidi) */
  bidi?: boolean;

  // Spacing
  /** Spacing before in twips (w:spacing/@w:before) */
  spaceBefore?: number;
  /** Spacing after in twips (w:spacing/@w:after) */
  spaceAfter?: number;
  /** Line spacing value (w:spacing/@w:line) */
  lineSpacing?: number;
  /** Line spacing rule (w:spacing/@w:lineRule) */
  lineSpacingRule?: LineSpacingRule;
  /** Auto space before (w:spacing/@w:beforeAutospacing) */
  beforeAutospacing?: boolean;
  /** Auto space after (w:spacing/@w:afterAutospacing) */
  afterAutospacing?: boolean;
  /**
   * Per-side flags marking which `<w:spacing>` attrs came from this
   * paragraph's own pPr (vs inherited). Word collapses style-inherited
   * spacing on empty paragraphs but honors the explicit values.
   */
  spacingExplicit?: SpacingExplicit;

  // Indentation
  /** Left indent in twips (w:ind/@w:left) */
  indentLeft?: number;
  /** Right indent in twips (w:ind/@w:right) */
  indentRight?: number;
  /** First line indent in twips - positive for indent, negative for hanging (w:ind/@w:firstLine or @w:hanging) */
  indentFirstLine?: number;
  /** Whether first line is hanging indent */
  hangingIndent?: boolean;

  // Borders
  /** Paragraph borders (w:pBdr) */
  borders?: {
    top?: BorderSpec;
    bottom?: BorderSpec;
    left?: BorderSpec;
    right?: BorderSpec;
    between?: BorderSpec;
    bar?: BorderSpec;
  };

  // Background
  /** Paragraph shading (w:shd) */
  shading?: ShadingProperties;

  // Tab stops
  /** Custom tab stops (w:tabs) */
  tabs?: TabStop[];

  // Page break control
  /** Keep with next paragraph (w:keepNext) */
  keepNext?: boolean;
  /** Keep lines together (w:keepLines) */
  keepLines?: boolean;
  /** Widow/orphan control (w:widowControl) */
  widowControl?: boolean;
  /** Page break before (w:pageBreakBefore) */
  pageBreakBefore?: boolean;
  /** Contextual spacing — suppress space between paragraphs of the same style (w:contextualSpacing) */
  contextualSpacing?: boolean;

  // Numbering/List
  /** Numbering properties (w:numPr) */
  numPr?: {
    /** Numbering definition ID (w:numId) */
    numId?: number;
    /** List level (0-8) (w:ilvl) */
    ilvl?: number;
  };

  // Outline level (for TOC)
  /** Outline level 0-9 (w:outlineLvl) */
  outlineLevel?: number;

  // Style reference
  /** Paragraph style ID (w:pStyle) */
  styleId?: string;

  // Frame properties
  /** Text frame properties (w:framePr) */
  frame?: {
    width?: number;
    height?: number;
    hAnchor?: 'text' | 'margin' | 'page';
    vAnchor?: 'text' | 'margin' | 'page';
    x?: number;
    y?: number;
    xAlign?: 'left' | 'center' | 'right' | 'inside' | 'outside';
    yAlign?: 'top' | 'center' | 'bottom' | 'inside' | 'outside' | 'inline';
    wrap?: 'around' | 'auto' | 'none' | 'notBeside' | 'through' | 'tight';
  };

  // Suppress
  /** Suppress line numbers (w:suppressLineNumbers) */
  suppressLineNumbers?: boolean;
  /** Suppress auto hyphens (w:suppressAutoHyphens) */
  suppressAutoHyphens?: boolean;

  // Default run properties for this paragraph
  /** Run properties to apply to all runs (w:rPr) */
  runProperties?: TextFormatting;

  // East-Asian + table spacing. Defaults are true; explicit `<… w:val="0"/>`
  // is what shows up in source XML when the author disables them.
  /** Auto-space between East-Asian + Latin text (`<w:autoSpaceDE>`). */
  autoSpaceDE?: boolean;
  /** Auto-space between East-Asian + numerals (`<w:autoSpaceDN>`). */
  autoSpaceDN?: boolean;
  /** Auto-adjust right indent when a table follows (`<w:adjustRightInd>`). */
  adjustRightInd?: boolean;
  /**
   * Vertical alignment of text within each line of the paragraph
   * (`<w:textAlignment w:val="..."/>`, ECMA-376 §17.3.1.40).
   */
  textAlignment?: 'top' | 'center' | 'baseline' | 'bottom' | 'auto';
  /**
   * Allow East-Asian punctuation to overflow the line boundary
   * (`<w:overflowPunct>`). Defaults to true; `w:val="0"` disables.
   */
  overflowPunct?: boolean;
}

// ============================================================================
// TABLE FORMATTING (w:tblPr, w:trPr, w:tcPr)
// ============================================================================

/**
 * Table width type
 */
export type TableWidthType = 'auto' | 'dxa' | 'nil' | 'pct';

/**
 * Table measurement (width or height)
 */
export interface TableMeasurement {
  /** Value in twips (for dxa) or fifths of a percent (for pct) */
  value: number;
  /** Measurement type */
  type: TableWidthType;
}

/**
 * Table borders
 */
export interface TableBorders {
  top?: BorderSpec;
  bottom?: BorderSpec;
  left?: BorderSpec;
  right?: BorderSpec;
  insideH?: BorderSpec;
  insideV?: BorderSpec;
}

/**
 * Cell margins
 */
export interface CellMargins {
  top?: TableMeasurement;
  bottom?: TableMeasurement;
  left?: TableMeasurement;
  right?: TableMeasurement;
  /**
   * Source emitted the logical-side names (w:start / w:end) instead of
   * the older physical-side names (w:left / w:right). The parser stores
   * left/right regardless (the two are semantically identical in
   * LTR documents) and sets this flag so the serializer can re-emit
   * the same form. Default (undefined / false) keeps the physical
   * names, matching Word's default output.
   */
  useLogicalSides?: boolean;
}

/**
 * Table look flags (for table styles)
 */
export interface TableLook {
  firstColumn?: boolean;
  firstRow?: boolean;
  lastColumn?: boolean;
  lastRow?: boolean;
  noHBand?: boolean;
  noVBand?: boolean;
}

/**
 * Floating table properties
 */
export interface FloatingTableProperties {
  /** Horizontal anchor */
  horzAnchor?: 'margin' | 'page' | 'text';
  /** Vertical anchor */
  vertAnchor?: 'margin' | 'page' | 'text';
  /** Horizontal position */
  tblpX?: number;
  tblpXSpec?: 'left' | 'center' | 'right' | 'inside' | 'outside';
  /** Vertical position */
  tblpY?: number;
  tblpYSpec?: 'top' | 'center' | 'bottom' | 'inside' | 'outside' | 'inline';
  /** Distance from surrounding text */
  topFromText?: number;
  bottomFromText?: number;
  leftFromText?: number;
  rightFromText?: number;
}

/**
 * Table formatting properties (w:tblPr)
 */
export interface TableFormatting {
  /** Table width */
  width?: TableMeasurement;
  /** Table justification */
  justification?: 'left' | 'center' | 'right';
  /** Cell spacing */
  cellSpacing?: TableMeasurement;
  /** Table indent from left margin */
  indent?: TableMeasurement;
  /** Table borders */
  borders?: TableBorders;
  /** Default cell margins */
  cellMargins?: CellMargins;
  /** Table layout */
  layout?: 'fixed' | 'autofit';
  /** Table style ID */
  styleId?: string;
  /** Table look (conditional formatting flags) */
  look?: TableLook;
  /** Shading/background */
  shading?: ShadingProperties;
  /** Overlap for floating tables */
  overlap?: 'never' | 'overlap';
  /** Floating table properties */
  floating?: FloatingTableProperties;
  /** Right to left table */
  bidi?: boolean;
}

/**
 * Table row formatting properties (w:trPr)
 */
export interface TableRowFormatting {
  /** Row height */
  height?: TableMeasurement;
  /** Height rule */
  heightRule?: 'auto' | 'atLeast' | 'exact';
  /** Header row (repeats on each page) */
  header?: boolean;
  /** Allow row to break across pages */
  cantSplit?: boolean;
  /** Row justification */
  justification?: 'left' | 'center' | 'right';
  /** Hidden row */
  hidden?: boolean;
  /** Conditional format style */
  conditionalFormat?: ConditionalFormatStyle;

  // Irregular-row support — these declare extra cells before / after
  // the row's own <w:tc> entries. Word emits them on rows where the
  // logical grid is wider than the painted cells (e.g. partially-merged
  // forms). Without round-trip the irregular shape is lost on save.
  /** Number of grid columns skipped before the first cell (`<w:gridBefore w:val="N"/>`). */
  gridBefore?: number;
  /** Width of the space reserved by `gridBefore` (`<w:wBefore w:w="..." w:type="..."/>`). */
  wBefore?: TableMeasurement;
  /** Number of grid columns skipped after the last cell (`<w:gridAfter w:val="N"/>`). */
  gridAfter?: number;
  /** Width of the space reserved by `gridAfter` (`<w:wAfter w:w="..." w:type="..."/>`). */
  wAfter?: TableMeasurement;
}

/**
 * Conditional format style
 */
export interface ConditionalFormatStyle {
  /** First row */
  firstRow?: boolean;
  /** Last row */
  lastRow?: boolean;
  /** First column */
  firstColumn?: boolean;
  /** Last column */
  lastColumn?: boolean;
  /** Odd horizontal band */
  oddHBand?: boolean;
  /** Even horizontal band */
  evenHBand?: boolean;
  /** Odd vertical band */
  oddVBand?: boolean;
  /** Even vertical band */
  evenVBand?: boolean;
  /** Northwest corner */
  nwCell?: boolean;
  /** Northeast corner */
  neCell?: boolean;
  /** Southwest corner */
  swCell?: boolean;
  /** Southeast corner */
  seCell?: boolean;
}

/**
 * Table cell formatting properties (w:tcPr)
 */
export interface TableCellFormatting {
  /** Cell width */
  width?: TableMeasurement;
  /** Cell borders */
  borders?: TableBorders;
  /** Cell margins (override table default) */
  margins?: CellMargins;
  /** Cell shading/background */
  shading?: ShadingProperties;
  /** Vertical alignment */
  verticalAlign?: 'top' | 'center' | 'bottom';
  /** Text direction */
  textDirection?: 'lr' | 'lrV' | 'rl' | 'rlV' | 'tb' | 'tbV' | 'tbRl' | 'tbRlV' | 'btLr';
  /** Grid span (horizontal merge) */
  gridSpan?: number;
  /** Vertical merge */
  vMerge?: 'restart' | 'continue';
  /** Fit text to cell width */
  fitText?: boolean;
  /** Wrap text */
  noWrap?: boolean;
  /** Hide cell marker */
  hideMark?: boolean;
  /** Conditional format style */
  conditionalFormat?: ConditionalFormatStyle;
}
