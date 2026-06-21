/**
 * ProseMirror Node Type Interfaces
 *
 * Type definitions for node attributes used by conversion modules,
 * extensions, and other consumers. NodeSpec definitions have moved
 * to the extension system (extensions/core/ and extensions/nodes/).
 */

import type {
  ParagraphAlignment,
  ParagraphFormatting,
  LineSpacingRule,
  BorderSpec,
  ShadingProperties,
  TabStop,
  TextFormatting,
  NumberFormat,
  TableFormatting,
  TableRowFormatting,
  TableCellFormatting,
  SectionProperties,
} from '../../types/document';
import type { FloatingTableProperties, TableLook } from '../../types';
import type { WrapType } from '../../docx/wrapTypes';

/**
 * Paragraph node attributes - maps to ParagraphFormatting
 */
export interface ParagraphAttrs {
  // Identity
  paraId?: string;
  textId?: string;

  // Alignment
  alignment?: ParagraphAlignment;

  // Spacing (in twips)
  spaceBefore?: number;
  spaceAfter?: number;
  lineSpacing?: number;
  lineSpacingRule?: LineSpacingRule;
  /** See ParagraphFormatting.spacingExplicit. */
  spacingExplicit?: import('../../types/formatting').SpacingExplicit;

  // Indentation (in twips)
  indentLeft?: number;
  indentRight?: number;
  indentFirstLine?: number;
  hangingIndent?: boolean;

  // List properties
  numPr?: {
    numId?: number;
    ilvl?: number;
  };
  /** List number format (decimal, lowerRoman, upperRoman, etc.) for CSS counter styling */
  listNumFmt?: NumberFormat;
  /** Whether this is a bullet list */
  listIsBullet?: boolean;
  /** Computed list marker text (e.g., "1.", "1.1.", "•") */
  listMarker?: string;
  /** Whether the list marker is hidden (w:vanish on numbering level rPr) */
  listMarkerHidden?: boolean;
  /** Marker font family from numbering level rPr */
  listMarkerFontFamily?: string;
  /** Marker font size from numbering level rPr, in points */
  listMarkerFontSize?: number;
  /**
   * NumberFormat for each level 0..ilvl (inclusive).
   * Lets toFlowBlocks resolve multi-level templates like "%1.%2." with
   * the correct format per token.
   */
  listLevelNumFmts?: NumberFormat[];
  /** See ListRendering.abstractNumId. */
  listAbstractNumId?: number;
  /** See ListRendering.startOverride. */
  listStartOverride?: number;

  // Style reference
  styleId?: string;

  // Borders
  borders?: {
    top?: BorderSpec;
    bottom?: BorderSpec;
    left?: BorderSpec;
    right?: BorderSpec;
    between?: BorderSpec;
    bar?: BorderSpec;
  };

  // Background/Shading
  shading?: ShadingProperties;

  // Tab stops
  tabs?: TabStop[];

  // Page break control
  pageBreakBefore?: boolean;
  /**
   * Word's cached layout marker (`<w:lastRenderedPageBreak/>`). Treated like
   * `pageBreakBefore` for layout, kept as a separate attr so save+reload
   * preserves the marker at the same position Word recorded.
   */
  renderedPageBreakBefore?: boolean;
  keepNext?: boolean;
  keepLines?: boolean;
  /** Contextual spacing — suppress space between same-style paragraphs */
  contextualSpacing?: boolean;

  // Default text formatting for empty paragraphs (persists when navigating away)
  // Maps to OOXML pPr/rPr (paragraph's default run properties)
  defaultTextFormatting?: TextFormatting;

  // Section break type — marks end of a section
  sectionBreakType?: 'nextPage' | 'continuous' | 'oddPage' | 'evenPage';

  // Text direction
  bidi?: boolean;

  // Outline level for TOC (0-9)
  outlineLevel?: number;

  // Bookmarks on this paragraph (for TOC anchors, cross-references)
  bookmarks?: Array<{ id: number; name: string }>;

  /** Original inline paragraph formatting from DOCX (pre-style-resolution).
   *  Used by fromProseDoc for lossless round-trip serialization. */
  _originalFormatting?: ParagraphFormatting;

  /** Full section properties for paragraphs that end a section.
   *  Used by layout engine for per-section column/page config and round-trip. */
  _sectionProperties?: SectionProperties;
}

/**
 * Image position for floating images (horizontal and vertical positioning)
 */
export interface ImagePositionAttrs {
  horizontal?: {
    relativeTo?: string;
    posOffset?: number; // In EMU
    align?: string;
  };
  vertical?: {
    relativeTo?: string;
    posOffset?: number; // In EMU
    align?: string;
  };
}

/**
 * Image node attributes
 */
export interface ImageAttrs {
  src: string;
  alt?: string;
  title?: string;
  /** Width in pixels (already converted from EMU) */
  width?: number;
  /** Height in pixels (already converted from EMU) */
  height?: number;
  rId?: string;
  /** Wrap type from DOCX: inline, square, tight, through, topAndBottom, behind, inFront */
  wrapType?: WrapType;
  /** Display mode for CSS: inline (flows with text), float (left/right float), block (centered) */
  displayMode?: 'inline' | 'float' | 'block';
  /** CSS float direction for floating images */
  cssFloat?: 'left' | 'right' | 'none';
  /** CSS transform string (rotation, flip) */
  transform?: string;
  /** Distance from text above (pixels) */
  distTop?: number;
  /** Distance from text below (pixels) */
  distBottom?: number;
  /** Distance from text left (pixels) */
  distLeft?: number;
  /** Distance from text right (pixels) */
  distRight?: number;
  /** Position for floating images (horizontal and vertical alignment) */
  position?: ImagePositionAttrs;
  /** Border width in pixels */
  borderWidth?: number;
  /** Border color as CSS color string */
  borderColor?: string;
  /** Border style (CSS border-style value) */
  borderStyle?: string;
  /** Wrap text setting from DOCX (left, right, bothSides, largest) for round-trip */
  wrapText?: string;
  /** Hyperlink URL for clickable image */
  hlinkHref?: string;
  /**
   * `wp:srcRect` crop fractions in [0, 1]. Each side is the fraction of the
   * source image that should be hidden. Renders as CSS `clip-path: inset(...)`.
   */
  cropTop?: number;
  cropRight?: number;
  cropBottom?: number;
  cropLeft?: number;
  /** `a:alphaModFix amt` mapped to CSS `opacity` in [0, 1]. */
  opacity?: number;
  /**
   * `wp:effectExtent` padding (pixels) — extra space reserved around the image
   * for shadows, glows, soft edges, etc. Applied as outer margin so the
   * effect isn't clipped by surrounding content.
   */
  effectExtentTop?: number;
  effectExtentBottom?: number;
  effectExtentLeft?: number;
  effectExtentRight?: number;
  /**
   * `wp:anchor layoutInCell`. Tri-state: true / false / undefined (= Word's
   * default "1"). Floating-only; round-tripped on save.
   */
  layoutInCell?: boolean;
  /** `wp:anchor allowOverlap`. Same tri-state convention as `layoutInCell`. */
  allowOverlap?: boolean;
}

/**
 * Table node attributes
 */
export interface TableAttrs {
  /** Table style ID */
  styleId?: string;
  /** Table width (in twips) */
  width?: number;
  /** Table width type ('auto', 'pct', 'dxa') */
  widthType?: string;
  /** Table justification/alignment */
  justification?: 'left' | 'center' | 'right';
  /** Column widths (in twips) from w:tblGrid */
  columnWidths?: number[];
  /** Floating table properties (w:tblpPr) */
  floating?: FloatingTableProperties;
  /** Default cell margins for the table (w:tblCellMar), in twips */
  cellMargins?: { top?: number; bottom?: number; left?: number; right?: number };
  /**
   * Per-side-resolved cell margins for LAYOUT only (twips). Unlike
   * `cellMargins` — which mirrors the verbatim inline w:tblCellMar for
   * lossless round-trip — this resolves each side independently through the
   * inline → table-style → default-table-style cascade (§17.4.41). A table
   * whose inline tblCellMar sets only top/bottom still inherits left/right
   * here, matching Word/LibreOffice text insets. Never serialized.
   */
  resolvedCellMargins?: { top?: number; bottom?: number; left?: number; right?: number };
  /** Table look flags for conditional formatting (w:tblLook) */
  look?: TableLook;
  /** Original table formatting from DOCX for lossless round-trip serialization */
  _originalFormatting?: TableFormatting;
}

/**
 * Table row attributes
 */
export interface TableRowAttrs {
  /** Row height (in twips) */
  height?: number;
  /** Height rule ('auto', 'exact', 'atLeast') */
  heightRule?: string;
  /** Is header row */
  isHeader?: boolean;
  /** Original row formatting from DOCX for lossless round-trip serialization */
  _originalFormatting?: TableRowFormatting;
}

/**
 * Table cell attributes
 */
export interface TableCellAttrs {
  /** Column span */
  colspan: number;
  /** Row span */
  rowspan: number;
  /** Column widths for prosemirror-tables resizing (array of pixel widths) */
  colwidth?: number[] | null;
  /** Cell width (in twips) */
  width?: number;
  /** Cell width type */
  widthType?: string;
  /** Vertical alignment */
  verticalAlign?: 'top' | 'center' | 'bottom';
  /** Background color (RGB hex) */
  backgroundColor?: string;
  /** OOXML text direction (e.g. 'tbRl', 'btLr') */
  textDirection?: string;
  /** No text wrapping in cell */
  noWrap?: boolean;
  /** Cell borders — full BorderSpec per side (style, color, size) */
  borders?: { top?: BorderSpec; bottom?: BorderSpec; left?: BorderSpec; right?: BorderSpec };
  /** Cell margins/padding in twips per side */
  margins?: { top?: number; bottom?: number; left?: number; right?: number };
  /** Original cell formatting from DOCX for lossless round-trip serialization */
  _originalFormatting?: TableCellFormatting;
  /**
   * The resolved hex of the original `shading.fill` at parse time. Used by
   * fromProseDoc to detect whether the user changed `backgroundColor`: if they
   * didn't, we preserve `_originalFormatting.shading` (keeping themeFill +
   * tint/shade); if they did, we write plain rgb.
   */
  _originalResolvedFill?: string;
}
