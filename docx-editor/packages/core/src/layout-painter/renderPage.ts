/**
 * Page Renderer
 *
 * Renders a single page from Layout data to DOM elements.
 * Each page contains positioned fragments within a content area.
 */

import type {
  Page,
  Fragment,
  FlowBlock,
  Measure,
  ParagraphBlock,
  ParagraphMeasure,
  ParagraphFragment,
  ParagraphBorders,
  TableBlock,
  TableMeasure,
  TableFragment,
  ImageBlock,
  ImageMeasure,
  ImageFragment,
  ImageRun,
  TextBoxBlock,
  TextBoxMeasure,
  TextBoxFragment,
} from '../layout-engine/types';
import { renderFragment } from './renderFragment';
import { renderParagraphFragment } from './renderParagraph';
import { renderTableFragment } from './renderTable';
import { renderImageFragment, applyImageVisualAttrs, hasImageVisualAttrs } from './renderImage';
import { renderTextBoxFragment } from './renderTextBox';
import type { BlockLookup } from './index';
import type { BorderSpec } from '../types/document';
import { borderToStyle } from '../utils/formatToStyle';
import type { Theme } from '../types/document';
import { measureParagraph, type FloatingImageZone } from '../layout-bridge/measuring';
import { resolveFontFamily } from '../utils/fontResolver';
import { isFloatingWrapType, isWrapNone, wrapsAroundText } from '../docx/wrapTypes';
import { pointsToPixels } from '../utils/units';

/**
 * Page-level floating image that has been extracted from paragraphs.
 * These are positioned absolutely within the page's content area.
 */
interface PageFloatingImage {
  src: string;
  width: number;
  height: number;
  alt?: string;
  transform?: string;
  /** Which side: 'left' for left margin, 'right' for right margin */
  side: 'left' | 'right';
  /** X position relative to content area (0 = left edge of content) */
  x: number;
  /** Y position relative to content area (0 = top of content) */
  y: number;
  /** Wrap distances */
  distTop: number;
  distBottom: number;
  distLeft: number;
  distRight: number;
  /** ProseMirror start position for click-to-select */
  pmStart?: number;
  /** ProseMirror end position */
  pmEnd?: number;
  /** OOXML wrapText: which side(s) TEXT flows on */
  wrapText?: 'bothSides' | 'left' | 'right' | 'largest';
  /** Wrap type (square, tight, through, topAndBottom) */
  wrapType?: string;
  /** wp:srcRect crop fractions [0..1]. */
  cropTop?: number;
  cropRight?: number;
  cropBottom?: number;
  cropLeft?: number;
  /** a:alphaModFix → opacity. */
  opacity?: number;
}

/**
 * Whether a floating image record reserves space in the text-wrap calculation.
 * Operates on any record that carries `wrapType`; centralises the predicate so
 * page-level and cell-level layers agree. Records reaching this predicate have
 * already passed `isFloatingImageRun`, so `wrapType=undefined` implies a `cssFloat`-driven float
 * — those wrap text by default.
 *
 * @internal
 */
export function floatingImageWrapsText(img: { wrapType?: string }): boolean {
  return !isWrapNone(img.wrapType) && img.wrapType !== 'topAndBottom';
}

/** @internal */
export function floatingImageIsBehindDoc(img: { wrapType?: string }): boolean {
  return img.wrapType === 'behind';
}

/**
 * Floating object exclusion rectangle used for text wrapping.
 */
interface FloatingExclusionRect {
  /** Which side the IMAGE is on (for rendering): 'left' or 'right' */
  side: 'left' | 'right';
  /** X position relative to content area (0 = left edge of content) */
  x: number;
  /** Y position relative to content area (0 = top of content) */
  y: number;
  /** Object dimensions */
  width: number;
  height: number;
  /** Wrap distances */
  distTop: number;
  distBottom: number;
  distLeft: number;
  distRight: number;
  /** OOXML wrapText: which side(s) TEXT flows on */
  wrapText?: 'bothSides' | 'left' | 'right' | 'largest';
  /** Wrap type from DOCX (square, tight, through, topAndBottom) */
  wrapType?: string;
}

/**
 * CSS class names for page elements
 */
export const PAGE_CLASS_NAMES = {
  page: 'layout-page',
  content: 'layout-page-content',
  header: 'layout-page-header',
  footer: 'layout-page-footer',
};

/**
 * Context passed to fragment renderers
 */
export interface RenderContext {
  /** Current page number (1-indexed) */
  pageNumber: number;
  /** Total number of pages */
  totalPages: number;
  /** Which section is being rendered */
  section: 'body' | 'header' | 'footer';
  /** Content width in pixels (page width minus margins) - used for justify */
  contentWidth?: number;
  /** When true, floating images render in-flow instead of being skipped (for table cells) */
  insideTableCell?: boolean;
  /** Comment IDs that are resolved — skip highlight for these */
  resolvedCommentIds?: Set<number>;
  /**
   * How the renderer should position its outer element. The body lays
   * fragments at absolute (x, y) on the page (`'absolute'`, the default),
   * while headers/footers and text boxes flow blocks vertically and let
   * normal document flow handle placement (`'flow'`). The caller passes
   * 'flow' instead of overwriting the renderer's inline styles after the
   * fact (#379).
   */
  positioning?: 'absolute' | 'flow';
}

/**
 * Header/footer content for rendering
 */
export interface HeaderFooterContent {
  /** Flow blocks for the header/footer content. */
  blocks: FlowBlock[];
  /** Measurements for the blocks. */
  measures: Measure[];
  /** Total height of the content. */
  height: number;
  /** Top-most visual extent relative to the nominal flow origin. */
  visualTop?: number;
  /** Bottom-most visual extent relative to the nominal flow origin. */
  visualBottom?: number;
}

/**
 * A single footnote item ready for rendering at page bottom.
 */
export interface FootnoteRenderItem {
  /** Display number (e.g. "1", "2") */
  displayNumber: string;
  /** Plain text content */
  text: string;
}

/**
 * Options for rendering a page
 */
export interface RenderPageOptions {
  /** Document to create elements in (default: window.document) */
  document?: Document;
  /** Custom page class name */
  pageClassName?: string;
  /** Show page borders (for debugging) */
  showBorders?: boolean;
  /** Background color for pages */
  backgroundColor?: string;
  /** Drop shadow on pages */
  showShadow?: boolean;
  /** Header content to render (used for all pages, or pages 2+ when titlePg is set). */
  headerContent?: HeaderFooterContent;
  /** Footer content to render (used for all pages, or pages 2+ when titlePg is set). */
  footerContent?: HeaderFooterContent;
  /** Header content for the first page only (when titlePg is set). */
  firstPageHeaderContent?: HeaderFooterContent;
  /** Footer content for the first page only (when titlePg is set). */
  firstPageFooterContent?: HeaderFooterContent;
  /** Whether different first page headers/footers are enabled (w:titlePg). */
  titlePg?: boolean;
  /** Distance from page top to header content. */
  headerDistance?: number;
  /** Distance from page bottom to footer content. */
  footerDistance?: number;
  /** Block lookup for rendering actual content. */
  blockLookup?: BlockLookup;
  /** OOXML page borders from section properties. */
  pageBorders?: {
    top?: BorderSpec;
    bottom?: BorderSpec;
    left?: BorderSpec;
    right?: BorderSpec;
    display?: 'allPages' | 'firstPage' | 'notFirstPage';
    offsetFrom?: 'page' | 'text';
    zOrder?: 'front' | 'back';
  };
  /** Theme for resolving border colors. */
  theme?: Theme | null;
  /** Footnotes to render at the bottom of this page. */
  footnoteArea?: FootnoteRenderItem[];
  /** Comment IDs that are resolved — skip highlight for these */
  resolvedCommentIds?: Set<number>;
}

export interface HeaderFooterLayoutInfo {
  flowTop: number;
  flowLeft: number;
  contentWidth: number;
  pageWidth: number;
  pageHeight: number;
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

/**
 * Apply page styles to an element
 */
function applyPageStyles(
  element: HTMLElement,
  width: number,
  height: number,
  options: RenderPageOptions
): void {
  element.style.position = 'relative';
  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  element.style.backgroundColor = options.backgroundColor ?? '#ffffff';
  element.style.overflow = 'hidden';

  // Page-level default (11pt Calibri). Must use the same chain as canvas
  // measurement in measureContainer.ts, otherwise unbreakable runs that lack
  // an explicit fontFamily can overflow the page margin (#334).
  element.style.fontFamily = resolveFontFamily('Calibri').cssFallback;
  // Use pixels to match Canvas-based measurements (11pt = 11 * 96/72 ≈ 14.67px)
  element.style.fontSize = `${(11 * 96) / 72}px`;
  element.style.color = '#000000';

  if (options.showBorders) {
    element.style.border = '1px solid #ccc';
  }

  if (options.showShadow) {
    element.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
  }
}

function pageBorderShouldRender(
  pageNumber: number,
  display?: 'allPages' | 'firstPage' | 'notFirstPage'
): boolean {
  switch (display ?? 'allPages') {
    case 'firstPage':
      return pageNumber === 1;
    case 'notFirstPage':
      return pageNumber !== 1;
    case 'allPages':
    default:
      return true;
  }
}

function pageBorderSpacePx(border: BorderSpec | undefined): number {
  return border?.space !== undefined ? pointsToPixels(border.space) : 0;
}

function applyPageBorderSide(
  element: HTMLElement,
  border: BorderSpec | undefined,
  side: 'Top' | 'Bottom' | 'Left' | 'Right',
  theme?: Theme | null
): void {
  if (!border || border.style === 'none' || border.style === 'nil') return;

  const styles = borderToStyle(border, side, theme);
  for (const [key, value] of Object.entries(styles)) {
    (element.style as unknown as Record<string, string>)[key] = String(value);
  }

  const styleKey = `border${side}Style`;
  const widthKey = `border${side}Width`;
  const styleValue = (element.style as unknown as Record<string, string>)[styleKey];
  if (styleValue === 'double') {
    const widthValue = parseFloat((element.style as unknown as Record<string, string>)[widthKey]);
    if (!Number.isFinite(widthValue) || widthValue < 3) {
      (element.style as unknown as Record<string, string>)[widthKey] = '3px';
    }
  }
}

function renderPageBorderOverlay(
  page: Page,
  options: RenderPageOptions,
  doc: Document
): HTMLElement | null {
  const pb = options.pageBorders;
  if (!pb || !pageBorderShouldRender(page.number, pb.display)) return null;

  const hasBorder = [pb.top, pb.bottom, pb.left, pb.right].some(
    (border) => border && border.style !== 'none' && border.style !== 'nil'
  );
  if (!hasBorder) return null;

  const offsetFrom = pb.offsetFrom ?? 'text';
  const topOffset = pageBorderSpacePx(pb.top);
  const rightOffset = pageBorderSpacePx(pb.right);
  const bottomOffset = pageBorderSpacePx(pb.bottom);
  const leftOffset = pageBorderSpacePx(pb.left);

  const overlay = doc.createElement('div');
  overlay.className = 'layout-page-border';
  overlay.style.position = 'absolute';
  overlay.style.pointerEvents = 'none';
  overlay.style.boxSizing = 'border-box';
  overlay.style.zIndex = pb.zOrder === 'back' ? '0' : '20';

  if (offsetFrom === 'page') {
    overlay.style.top = `${topOffset}px`;
    overlay.style.right = `${rightOffset}px`;
    overlay.style.bottom = `${bottomOffset}px`;
    overlay.style.left = `${leftOffset}px`;
  } else {
    overlay.style.top = `${Math.max(0, page.margins.top - topOffset)}px`;
    overlay.style.right = `${Math.max(0, page.margins.right - rightOffset)}px`;
    overlay.style.bottom = `${Math.max(0, page.margins.bottom - bottomOffset)}px`;
    overlay.style.left = `${Math.max(0, page.margins.left - leftOffset)}px`;
  }

  applyPageBorderSide(overlay, pb.top, 'Top', options.theme);
  applyPageBorderSide(overlay, pb.bottom, 'Bottom', options.theme);
  applyPageBorderSide(overlay, pb.left, 'Left', options.theme);
  applyPageBorderSide(overlay, pb.right, 'Right', options.theme);

  return overlay;
}

/**
 * Apply content area styles to an element
 */
function applyContentAreaStyles(element: HTMLElement, page: Page): void {
  const margins = page.margins;

  element.style.position = 'absolute';
  element.style.top = `${margins.top}px`;
  element.style.left = `${margins.left}px`;
  element.style.right = `${margins.right}px`;
  element.style.bottom = `${margins.bottom}px`;
  element.style.overflow = 'visible';
}

function getPositionAlignment(
  position: { align?: string; alignment?: string } | undefined
): string | undefined {
  return position?.align ?? position?.alignment;
}

function resolveHeaderFooterFloatTop(
  floatImg: {
    height: number;
    paragraphY: number;
    position: {
      vertical?: { relativeTo?: string; posOffset?: number; align?: string; alignment?: string };
    };
  },
  layout: HeaderFooterLayoutInfo
): number {
  const v = floatImg.position.vertical;
  if (!v) {
    return floatImg.paragraphY;
  }

  const align = getPositionAlignment(v);
  const offsetPx = v.posOffset !== undefined ? emuToPixels(v.posOffset) : undefined;

  if (v.relativeTo === 'page') {
    if (offsetPx !== undefined) {
      return offsetPx - layout.flowTop;
    }
    if (align === 'top') {
      return -layout.flowTop;
    }
    if (align === 'bottom') {
      return layout.pageHeight - floatImg.height - layout.flowTop;
    }
    if (align === 'center') {
      return (layout.pageHeight - floatImg.height) / 2 - layout.flowTop;
    }
  }

  if (v.relativeTo === 'margin') {
    const marginTop = layout.margins.top;
    const marginHeight = layout.pageHeight - layout.margins.top - layout.margins.bottom;
    if (offsetPx !== undefined) {
      return marginTop + offsetPx - layout.flowTop;
    }
    if (align === 'top') {
      return marginTop - layout.flowTop;
    }
    if (align === 'bottom') {
      return marginTop + marginHeight - floatImg.height - layout.flowTop;
    }
    if (align === 'center') {
      return marginTop + (marginHeight - floatImg.height) / 2 - layout.flowTop;
    }
  }

  if (offsetPx !== undefined) {
    return floatImg.paragraphY + offsetPx;
  }

  return floatImg.paragraphY;
}

function applyHeaderFooterFloatHorizontalPosition(
  img: HTMLImageElement,
  floatImg: {
    width: number;
    position: {
      horizontal?: { relativeTo?: string; posOffset?: number; align?: string; alignment?: string };
    };
  },
  layout: HeaderFooterLayoutInfo
): void {
  const h = floatImg.position.horizontal;
  if (!h) {
    img.style.left = '0';
    return;
  }

  const align = getPositionAlignment(h);

  if (h.relativeTo === 'page') {
    if (h.posOffset !== undefined) {
      img.style.left = `${emuToPixels(h.posOffset) - layout.flowLeft}px`;
      return;
    }
    if (align === 'right') {
      img.style.left = `${layout.pageWidth - floatImg.width - layout.flowLeft}px`;
      return;
    }
    if (align === 'center') {
      img.style.left = `${(layout.pageWidth - floatImg.width) / 2 - layout.flowLeft}px`;
      return;
    }
    if (align === 'left') {
      img.style.left = `${-layout.flowLeft}px`;
      return;
    }
  }

  if (h.posOffset !== undefined) {
    img.style.left = `${emuToPixels(h.posOffset)}px`;
    return;
  }

  if (align === 'right') {
    img.style.left = `${layout.contentWidth - floatImg.width}px`;
    return;
  }
  if (align === 'center') {
    img.style.left = `${(layout.contentWidth - floatImg.width) / 2}px`;
    return;
  }

  img.style.left = '0';
}

/**
 * Resolve the (left, top) position for a floating table inside a header/
 * footer container, per ECMA-376 §17.4.57. The table's `floating.tblpX/tblpY`
 * are already in pixels (parser converted from twips); `horzAnchor`/
 * `vertAnchor` decide whether the offset is relative to the page, the
 * margins, or the surrounding text/column. Coordinates returned are
 * relative to the HF container's flow origin (`layout.flowTop` /
 * `layout.flowLeft`) so the caller can drop them straight into
 * `style.top` / `style.left`.
 */
export function resolveHeaderFooterFloatingTablePosition(
  floating: NonNullable<TableBlock['floating']>,
  layout: HeaderFooterLayoutInfo
): { left: number; top: number } {
  // Vertical: tblpY relative to vertAnchor.
  let top = floating.tblpY ?? 0;
  if (floating.vertAnchor === 'page') {
    top -= layout.flowTop;
  } else if (floating.vertAnchor === 'margin') {
    top += layout.margins.top - layout.flowTop;
  }
  // 'text' anchor (or unspecified) means offset from the surrounding
  // paragraph — for HF that's the flow cursor, but tblpY for floating
  // tables is typically authored relative to the page or margin. Treat
  // an unspecified anchor as 'text' but with zero offset → leaves top
  // at tblpY relative to container origin, which matches Word's
  // observed behavior for HF floating tables.

  // Horizontal: tblpX relative to horzAnchor.
  let left = floating.tblpX ?? 0;
  if (floating.horzAnchor === 'page') {
    left -= layout.flowLeft;
  } else if (floating.horzAnchor === 'margin') {
    left += layout.margins.left - layout.flowLeft;
  }

  return { left, top };
}

/**
 * Apply fragment positioning styles
 * Note: Fragment x/y include page margins, but fragments are positioned
 * inside the content area which already has margin offsets applied.
 * So we subtract the margins to get content-area-relative positions.
 */
function applyFragmentStyles(
  element: HTMLElement,
  fragment: Fragment,
  margins: { left: number; top: number }
): void {
  element.style.position = 'absolute';
  element.style.left = `${fragment.x - margins.left}px`;
  element.style.top = `${fragment.y - margins.top}px`;
  element.style.width = `${fragment.width}px`;

  // Height handling varies by fragment type
  if ('height' in fragment) {
    element.style.height = `${fragment.height}px`;
  }
}

/**
 * EMU to pixels conversion for floating image positioning
 */
export function emuToPixels(emu: number | undefined): number {
  if (emu === undefined) return 0;
  return Math.round((emu * 96) / 914400);
}

/**
 * Check if an image run is a floating image (should be positioned at page level)
 */
export function isFloatingImageRun(run: ImageRun): boolean {
  if (isFloatingWrapType(run.wrapType)) return true;
  // Or explicit float display mode (but not topAndBottom — those are block images)
  return run.displayMode === 'float';
}

/**
 * Check if a floating image should create text wrapping exclusion zones.
 * wrapNone images (`behind` / `inFront`) are positioned floats but do not
 * shrink line widths; text paints over or under them.
 */
export function isTextWrappingFloatingImageRun(run: ImageRun): boolean {
  if (isWrapNone(run.wrapType) || run.wrapType === 'topAndBottom') return false;
  if (wrapsAroundText(run.wrapType)) return true;
  return run.displayMode === 'float' && run.cssFloat !== 'none';
}

/**
 * Page geometry needed to translate OOXML `relativeFrom` anchors into
 * painter coordinates. All values are in CSS pixels.
 */
interface PageGeometry {
  pageWidth: number;
  pageHeight: number;
  marginLeft: number;
  marginTop: number;
  contentWidth: number;
  contentHeight: number;
}

/**
 * Extract floating images from a paragraph block and determine their page-level positions.
 * Returns extracted images and info for the paragraph about space reserved.
 */
function extractFloatingImagesFromParagraph(
  block: ParagraphBlock,
  fragmentY: number, // Y position of the paragraph fragment on the page (relative to content area)
  contentWidth: number, // Width of the content area
  geometry?: PageGeometry
): PageFloatingImage[] {
  const floatingImages: PageFloatingImage[] = [];

  for (const run of block.runs) {
    if (run.kind !== 'image') continue;
    const imgRun = run as ImageRun;

    if (!isFloatingImageRun(imgRun)) continue;

    // Determine position based on image attributes
    const position = imgRun.position;
    const distTop = imgRun.distTop ?? 0;
    const distBottom = imgRun.distBottom ?? 0;
    const distLeft = imgRun.distLeft ?? 12;
    const distRight = imgRun.distRight ?? 12;

    // Determine horizontal position (left or right side). Mirror of the
    // vertical logic — `relativeFrom` decides the anchor frame, then
    // `align` (left/center/right) or `posOffset` chooses within it. Body
    // images don't have margin pages or character frames, so for the
    // `*Margin` and `character` / `line` variants we fall back to the
    // content-area frame, which matches Word's render for single-column
    // body documents.
    let side: 'left' | 'right' = 'left';
    let x = 0;

    if (position?.horizontal) {
      const h = position.horizontal;
      // ECMA-376 §20.4.3.2 (ST_RelFromH). Same translation pattern as the
      // vertical axis: pick a band origin (`baseX`) and a band width. For
      // body text the painter's content origin is `marginLeft` from the page
      // edge, so `relativeFrom="page"` is just `-marginLeft`.
      const pageWidth = geometry?.pageWidth ?? 0;
      const marginLeft = geometry?.marginLeft ?? 0;
      const baseX = (() => {
        switch (h.relativeTo) {
          case 'page':
          case 'leftMargin':
            return -marginLeft;
          case 'rightMargin':
            return contentWidth;
          case 'character':
          case 'column':
          case 'margin':
          case 'insideMargin':
          case 'outsideMargin':
          default:
            return 0;
        }
      })();
      const bandWidth = (() => {
        switch (h.relativeTo) {
          case 'page':
            return pageWidth;
          case 'leftMargin':
          case 'rightMargin':
            return marginLeft;
          case 'character':
            return 0;
          case 'column':
          case 'margin':
          case 'insideMargin':
          case 'outsideMargin':
          default:
            return contentWidth;
        }
      })();
      if (h.align === 'right') {
        side = 'right';
        x = bandWidth ? baseX + bandWidth - imgRun.width : 0;
      } else if (h.align === 'left') {
        side = 'left';
        x = baseX;
      } else if (h.align === 'center') {
        side = 'left';
        x = bandWidth ? baseX + (bandWidth - imgRun.width) / 2 : 0;
      } else if (h.posOffset !== undefined) {
        x = baseX + emuToPixels(h.posOffset);
        side = x > contentWidth / 2 ? 'right' : 'left';
      } else {
        // Bare positionH (no align, no offset) — anchor at band origin.
        x = baseX;
      }
    } else if (imgRun.cssFloat === 'right') {
      side = 'right';
      x = contentWidth - imgRun.width;
    }

    // Determine vertical position. The OOXML attribute can be either an
    // explicit `posOffset` (EMUs from the relativeFrom origin) or a symbolic
    // `align` (top / center / bottom). When neither is present, fall back
    // to the paragraph anchor — that's Word's default for `wp:anchor` with
    // a bare `<wp:positionV>`.
    //
    // `relativeFrom` decides which anchor coordinate offset/align is
    // computed against. We translate every variant into the painter's
    // coordinate space (content-area top = 0).
    let y = 0;

    if (position?.vertical) {
      const v = position.vertical;
      const pageHeight = geometry?.pageHeight ?? 0;
      const marginTop = geometry?.marginTop ?? 0;
      const contentHeight = geometry?.contentHeight ?? 0;
      // ECMA-376 §20.4.3.1 (ST_RelFromV) — translate the OOXML anchor band
      // into the painter's coordinate space (content-area top = 0). `topMargin`
      // is the strip ABOVE the content area (negative offset); `bottomMargin`
      // is BELOW (`contentHeight`). `margin` is the content area itself.
      // `insideMargin`/`outsideMargin` are mirror-margins for facing pages —
      // we approximate as `margin`, which matches single-sided layouts.
      const baseY = (() => {
        switch (v.relativeTo) {
          case 'paragraph':
          case 'line':
            return fragmentY;
          case 'page':
            return -marginTop;
          case 'topMargin':
            return -marginTop;
          case 'bottomMargin':
            return contentHeight;
          case 'margin':
          case 'insideMargin':
          case 'outsideMargin':
          default:
            return 0;
        }
      })();
      // The "band height" within which align="center"/"bottom" is computed.
      // page → page height; topMargin → marginTop; bottomMargin → bottom margin
      // (which we don't track separately, fall back to marginTop ≈ symmetric
      // pages); paragraph/line → no band (fall back to paragraph anchor).
      const bandHeight = (() => {
        switch (v.relativeTo) {
          case 'page':
            return pageHeight;
          case 'topMargin':
          case 'bottomMargin':
            return marginTop;
          case 'paragraph':
          case 'line':
            return 0;
          case 'margin':
          case 'insideMargin':
          case 'outsideMargin':
          default:
            return contentHeight;
        }
      })();
      if (v.align === 'top') {
        y = baseY;
      } else if (v.align === 'center') {
        y = bandHeight ? baseY + (bandHeight - imgRun.height) / 2 : fragmentY;
      } else if (v.align === 'bottom') {
        y = bandHeight ? baseY + bandHeight - imgRun.height : fragmentY;
      } else if (v.posOffset !== undefined) {
        y = baseY + emuToPixels(v.posOffset);
      } else {
        // Bare positionV (no align, no offset). For paragraph/line bands the
        // image stays in flow; for any other band, the spec means "anchor at
        // the band origin", which is `baseY`.
        y = v.relativeTo === 'paragraph' || v.relativeTo === 'line' ? fragmentY : baseY;
      }
    } else {
      // No positionV at all — default to paragraph anchor.
      y = fragmentY;
    }

    // Derive wrapText from cssFloat:
    // cssFloat='left' → image floats left → text on right → wrapText='right'
    // cssFloat='right' → image floats right → text on left → wrapText='left'
    // cssFloat='none' or undefined → wrapText='bothSides' (default)
    let wrapText: 'bothSides' | 'left' | 'right' | 'largest' = 'bothSides';
    if (imgRun.cssFloat === 'left') {
      wrapText = 'right';
    } else if (imgRun.cssFloat === 'right') {
      wrapText = 'left';
    }

    floatingImages.push({
      src: imgRun.src,
      width: imgRun.width,
      height: imgRun.height,
      alt: imgRun.alt,
      transform: imgRun.transform,
      side,
      x,
      y,
      distTop,
      distBottom,
      distLeft,
      distRight,
      pmStart: imgRun.pmStart,
      pmEnd: imgRun.pmEnd,
      wrapText,
      wrapType: imgRun.wrapType,
      cropTop: imgRun.cropTop,
      cropRight: imgRun.cropRight,
      cropBottom: imgRun.cropBottom,
      cropLeft: imgRun.cropLeft,
      opacity: imgRun.opacity,
    });
  }

  return floatingImages;
}

/**
 * Convert floating exclusion rectangles to per-image FloatingImageZone[]
 * for the measurement system. Each rect becomes its own zone so
 * lines at different Y positions get independently correct widths.
 *
 * wrapText controls which side(s) TEXT flows on:
 *   'right'    → text only on right → image blocks left side (leftMargin)
 *   'left'     → text only on left  → image blocks right side (rightMargin)
 *   'bothSides'→ text on right of left-side images, left of right-side images
 *   'largest'  → same as bothSides (simplified)
 *
 * topAndBottom → full-width exclusion (leftMargin = contentWidth → forces line skip)
 */
function rectsToFloatingZones(
  rects: FloatingExclusionRect[],
  contentWidth: number
): FloatingImageZone[] {
  return rects.map((rect) => {
    const rectRight = rect.x + rect.width + rect.distRight;
    const rectTop = rect.y - rect.distTop;
    const rectBottom = rect.y + rect.height + rect.distBottom;

    let leftMargin = 0;
    let rightMargin = 0;

    const wt = rect.wrapText ?? 'bothSides';

    if (wt === 'right') {
      // Text flows on RIGHT only → image blocks the left side
      leftMargin = rectRight;
    } else if (wt === 'left') {
      // Text flows on LEFT only → image blocks the right side
      rightMargin = contentWidth - (rect.x - rect.distLeft);
    } else {
      // bothSides / largest: use image position to determine which side it blocks
      if (rect.side === 'left') {
        leftMargin = rectRight;
      } else {
        rightMargin = contentWidth - (rect.x - rect.distLeft);
      }
    }

    return { leftMargin, rightMargin, topY: rectTop, bottomY: rectBottom };
  });
}

/**
 * Minimum fields the floating-image painter needs. Page-level and cell-level
 * float records both satisfy this shape.
 *
 * @internal
 */
export interface FloatingImagePaintRecord {
  src: string;
  width: number;
  height: number;
  alt?: string;
  transform?: string;
  x: number;
  y: number;
  pmStart?: number;
  pmEnd?: number;
  /** wp:srcRect crop fractions in [0, 1]. */
  cropTop?: number;
  cropRight?: number;
  cropBottom?: number;
  cropLeft?: number;
  /** a:alphaModFix → CSS opacity. */
  opacity?: number;
}

/** @internal */
export interface FloatingImagesLayerOptions {
  layerClass: string;
  itemClass: string;
  /**
   * `inset0` sizes the layer with `top/right/bottom/left = 0` (used at page level).
   * `fullSize` uses `width/height = 100%` and adds `overflow: hidden` (used inside table cells).
   */
  sizing: 'inset0' | 'fullSize';
  /** `behind` skips z-index so DOM order keeps the layer below body fragments. */
  layerMode: 'front' | 'behind';
}

/**
 * Render a layer of positioned floating images. Used at both page level and
 * inside table cells; the variant differs only in class names and sizing.
 *
 * @internal
 */
export function renderFloatingImagesLayer(
  floatingImages: FloatingImagePaintRecord[],
  doc: Document,
  options: FloatingImagesLayerOptions
): HTMLElement {
  const layer = doc.createElement('div');
  layer.className = options.layerClass;
  layer.style.position = 'absolute';
  layer.style.top = '0';
  layer.style.left = '0';
  if (options.sizing === 'inset0') {
    layer.style.right = '0';
    layer.style.bottom = '0';
  } else {
    layer.style.width = '100%';
    layer.style.height = '100%';
    layer.style.overflow = 'hidden';
  }
  layer.style.pointerEvents = 'none';
  if (options.layerMode === 'front') {
    layer.style.zIndex = '10';
  }

  for (const floatImg of floatingImages) {
    const container = doc.createElement('div');
    container.className = options.itemClass;
    container.style.position = 'absolute';
    container.style.pointerEvents = 'auto';
    container.style.top = `${floatImg.y}px`;
    container.style.left = `${floatImg.x}px`;
    if (floatImg.pmStart !== undefined) container.dataset.pmStart = String(floatImg.pmStart);
    if (floatImg.pmEnd !== undefined) container.dataset.pmEnd = String(floatImg.pmEnd);

    const img = doc.createElement('img');
    img.src = floatImg.src;
    img.style.width = `${floatImg.width}px`;
    img.style.height = `${floatImg.height}px`;
    img.style.display = 'block';
    if (floatImg.alt) img.alt = floatImg.alt;
    if (floatImg.transform) {
      img.style.transform = floatImg.transform;
      img.style.transformOrigin = 'center center';
    }
    if (hasImageVisualAttrs(floatImg)) applyImageVisualAttrs(img, floatImg);

    container.appendChild(img);
    layer.appendChild(container);
  }

  return layer;
}

/**
 * Render header or footer content
 */
function renderHeaderFooterContent(
  content: HeaderFooterContent,
  context: RenderContext,
  options: RenderPageOptions,
  layout: HeaderFooterLayoutInfo
): HTMLElement {
  const doc = options.document ?? document;
  const containerEl = doc.createElement('div');
  containerEl.style.position = 'relative';

  // Use content width from context if available, otherwise default to reasonable width
  const contentWidth = context.contentWidth ?? 600;

  // Collect floating images to render separately, with their paragraph's Y position
  const floatingImages: Array<{
    src: string;
    width: number;
    height: number;
    alt?: string;
    paragraphY: number; // Y position of the containing paragraph
    position: {
      horizontal?: {
        relativeTo?: string;
        posOffset?: number;
        align?: string;
        alignment?: string;
      };
      vertical?: {
        relativeTo?: string;
        posOffset?: number;
        align?: string;
        alignment?: string;
      };
    };
  }> = [];

  let cursorY = 0;

  for (let i = 0; i < content.blocks.length; i++) {
    const block = content.blocks[i];
    const measure = content.measures[i];
    if (!block || !measure) continue;

    if (block.kind === 'paragraph' && measure.kind === 'paragraph') {
      const paragraphBlock = block as ParagraphBlock;
      const paragraphMeasure = measure as ParagraphMeasure;
      const paragraphSpacingBefore = paragraphBlock.attrs?.spacing?.before ?? 0;

      // Track the Y position where this paragraph starts
      const paragraphStartY = cursorY;

      // Extract floating images and filter them from runs
      const inlineRuns: typeof paragraphBlock.runs = [];
      for (const run of paragraphBlock.runs) {
        if (run.kind === 'image' && 'position' in run && run.position) {
          const imgRun = run as {
            kind: 'image';
            src: string;
            width: number;
            height: number;
            alt?: string;
            position: {
              horizontal?: {
                relativeTo?: string;
                posOffset?: number;
                align?: string;
                alignment?: string;
              };
              vertical?: {
                relativeTo?: string;
                posOffset?: number;
                align?: string;
                alignment?: string;
              };
            };
          };
          floatingImages.push({
            src: imgRun.src,
            width: imgRun.width,
            height: imgRun.height,
            alt: imgRun.alt,
            paragraphY: paragraphStartY, // Store where this paragraph starts
            position: imgRun.position,
          });
        } else {
          // Keep non-floating runs for inline rendering
          inlineRuns.push(run);
        }
      }

      // Create a modified paragraph block without floating images
      const inlineBlock: ParagraphBlock = {
        ...paragraphBlock,
        runs: inlineRuns,
      };

      // Create a synthetic fragment for the paragraph
      const syntheticFragment: ParagraphFragment = {
        kind: 'paragraph',
        blockId: paragraphBlock.id,
        x: 0,
        y: cursorY + paragraphSpacingBefore,
        width: contentWidth,
        height: paragraphMeasure.totalHeight,
        fromLine: 0,
        toLine: paragraphMeasure.lines.length,
      };

      // Render paragraph fragment (with floating images filtered out). The
      // HF context positions blocks absolutely within its own container,
      // stacking vertically via `cursorY` — `paragraphMeasure.totalHeight`
      // already includes `spaceBefore` / `spaceAfter`. Pass `positioning:
      // 'absolute'` so the renderer applies that mode itself instead of the
      // caller having to flip its inline style after the fact (#379).
      const fragEl = renderParagraphFragment(
        syntheticFragment,
        inlineBlock,
        paragraphMeasure,
        { ...context, positioning: 'absolute' },
        { document: doc }
      );

      fragEl.style.top = `${cursorY + paragraphSpacingBefore}px`;
      fragEl.style.left = '0';
      fragEl.style.width = `${contentWidth}px`;

      containerEl.appendChild(fragEl);
      cursorY += paragraphMeasure.totalHeight;
    } else if (block.kind === 'table' && measure.kind === 'table') {
      // HF tables don't paginate, so the synthetic fragment covers all rows.
      const syntheticFragment: TableFragment = {
        kind: 'table',
        blockId: block.id,
        x: 0,
        y: cursorY,
        width: measure.totalWidth,
        height: measure.totalHeight,
        fromRow: 0,
        toRow: measure.rows.length,
        pmStart: block.pmStart,
        pmEnd: block.pmEnd,
      };
      const fragEl = renderTableFragment(
        syntheticFragment,
        block,
        measure,
        { ...context, positioning: 'absolute' },
        { document: doc }
      );

      // Floating tables (`<w:tblpPr>`) opt out of the cursorY flow. They
      // anchor at (tblpX, tblpY) relative to the page/margin/column per
      // ECMA-376 §17.4.57 and don't advance cursorY (#382). Inline tables
      // keep their cursorY-based stacking.
      if (block.floating) {
        const { left, top } = resolveHeaderFooterFloatingTablePosition(block.floating, layout);
        fragEl.style.top = `${top}px`;
        fragEl.style.left = `${left}px`;
        containerEl.appendChild(fragEl);
        // Floating tables do NOT advance cursorY — surrounding HF blocks
        // flow as if the table weren't there. Word renders text behind
        // floating tables when no wrap behavior is requested; we match.
      } else {
        // Inline placement: top/left stack within the HF container at cursorY.
        fragEl.style.top = `${cursorY}px`;
        fragEl.style.left = '0';
        containerEl.appendChild(fragEl);
        cursorY += measure.totalHeight;
      }
    }
  }

  // Render floating images with absolute positioning
  for (const floatImg of floatingImages) {
    const img = doc.createElement('img');
    img.src = floatImg.src;
    img.width = floatImg.width;
    img.height = floatImg.height;
    if (floatImg.alt) img.alt = floatImg.alt;

    img.style.position = 'absolute';
    img.style.display = 'block';
    // Header/footer images can intentionally extend beyond the text area.
    // Override global img resets (for example max-width: 100%) so the DOCX
    // anchor extent is honored instead of shrinking to the header/footer box.
    img.style.width = `${floatImg.width}px`;
    img.style.height = `${floatImg.height}px`;
    img.style.maxWidth = 'none';
    img.style.maxHeight = 'none';

    applyHeaderFooterFloatHorizontalPosition(img, floatImg, layout);
    img.style.top = `${resolveHeaderFooterFloatTop(floatImg, layout)}px`;

    containerEl.appendChild(img);
  }

  return containerEl;
}

/**
 * Render the footnote area at the bottom of a page.
 * Includes a separator line (33% width) and footnote entries.
 */
function renderFootnoteArea(
  footnotes: FootnoteRenderItem[],
  contentWidth: number,
  doc: Document
): HTMLElement {
  const container = doc.createElement('div');
  container.className = 'layout-footnote-area';
  container.style.width = `${contentWidth}px`;

  // Separator line (33% width, Google Docs style)
  const separator = doc.createElement('div');
  separator.style.width = '33%';
  separator.style.height = '0.5px';
  separator.style.backgroundColor = '#000';
  separator.style.marginBottom = '6px';
  separator.style.marginTop = '6px';
  container.appendChild(separator);

  // Render each footnote
  for (const fn of footnotes) {
    const fnEl = doc.createElement('div');
    fnEl.style.fontSize = '10px';
    fnEl.style.lineHeight = '1.3';
    fnEl.style.marginBottom = '4px';
    fnEl.style.color = '#000';

    const sup = doc.createElement('sup');
    sup.textContent = fn.displayNumber;
    sup.style.fontSize = '7px';
    sup.style.marginRight = '2px';
    fnEl.appendChild(sup);

    const textNode = doc.createTextNode(' ' + fn.text);
    fnEl.appendChild(textNode);

    container.appendChild(fnEl);
  }

  return container;
}

/**
 * Render a single page to DOM
 *
 * @param page - The page to render
 * @param context - Rendering context
 * @param options - Rendering options
 * @returns The page DOM element
 */
export function renderPage(
  page: Page,
  context: RenderContext,
  options: RenderPageOptions = {}
): HTMLElement {
  const doc = options.document ?? document;

  // Create page container
  const pageEl = doc.createElement('div');
  pageEl.className = options.pageClassName ?? PAGE_CLASS_NAMES.page;
  pageEl.dataset.pageNumber = String(page.number);

  applyPageStyles(pageEl, page.size.w, page.size.h, options);
  const pageBorderEl = renderPageBorderOverlay(page, options, doc);
  if (pageBorderEl && options.pageBorders?.zOrder === 'back') {
    pageEl.appendChild(pageBorderEl);
  }

  // Create content area
  const contentEl = doc.createElement('div');
  contentEl.className = PAGE_CLASS_NAMES.content;
  applyContentAreaStyles(contentEl, page);

  // Calculate content width for justify alignment
  const contentWidth = page.size.w - page.margins.left - page.margins.right;

  // PHASE 1: Extract all floating images from paragraphs on this page
  const allFloatingImages: PageFloatingImage[] = [];
  const floatingRects: FloatingExclusionRect[] = [];

  for (const fragment of page.fragments) {
    if (fragment.kind === 'paragraph' && options.blockLookup) {
      const blockData = options.blockLookup.get(String(fragment.blockId));
      if (blockData?.block.kind === 'paragraph') {
        const paragraphBlock = blockData.block as ParagraphBlock;
        // Fragment Y is relative to page top, we need it relative to content area
        const contentRelativeY = fragment.y - page.margins.top;
        const extracted = extractFloatingImagesFromParagraph(
          paragraphBlock,
          contentRelativeY,
          contentWidth,
          {
            pageWidth: page.size.w,
            pageHeight: page.size.h,
            marginLeft: page.margins.left,
            marginTop: page.margins.top,
            contentWidth,
            contentHeight: page.size.h - page.margins.top - page.margins.bottom,
          }
        );
        allFloatingImages.push(...extracted);

        // Note: topAndBottom images are handled by measureParagraph as block images
        // (they get their own line). No exclusion zones needed for them.
      }
    }
  }

  // Collect floating image exclusion rectangles
  for (const img of allFloatingImages) {
    if (!floatingImageWrapsText(img)) continue;

    floatingRects.push({
      side: img.side,
      x: img.x,
      y: img.y,
      width: img.width,
      height: img.height,
      distTop: img.distTop,
      distBottom: img.distBottom,
      distLeft: img.distLeft,
      distRight: img.distRight,
      wrapText: img.wrapText,
      wrapType: img.wrapType,
    });
  }

  // Collect floating table exclusion rectangles
  if (options.blockLookup) {
    for (const fragment of page.fragments) {
      if (fragment.kind !== 'table') continue;
      const blockData = options.blockLookup.get(String(fragment.blockId));
      if (blockData?.block.kind !== 'table') continue;
      const tableBlock = blockData.block as TableBlock;
      const floating = tableBlock.floating;
      if (!floating) continue;

      const contentX = fragment.x - page.margins.left;
      const contentY = fragment.y - page.margins.top;

      const distTop = floating.topFromText ?? 0;
      const distBottom = floating.bottomFromText ?? 0;
      const distLeft = floating.leftFromText ?? 12;
      const distRight = floating.rightFromText ?? 12;

      const side = contentX < contentWidth / 2 ? 'left' : 'right';

      floatingRects.push({
        side,
        x: contentX,
        y: contentY,
        width: fragment.width,
        height: fragment.height,
        distTop,
        distBottom,
        distLeft,
        distRight,
      });
    }
  }

  // PHASE 2: Convert floating rects to per-image measurement zones
  const floatingZones: FloatingImageZone[] =
    floatingRects.length > 0 ? rectsToFloatingZones(floatingRects, contentWidth) : [];

  // PHASE 3: Render behind-text floating images before text fragments.
  const behindFloatingImages = allFloatingImages.filter(floatingImageIsBehindDoc);
  const frontFloatingImages = allFloatingImages.filter((img) => !floatingImageIsBehindDoc(img));
  if (behindFloatingImages.length > 0) {
    const floatingLayer = renderFloatingImagesLayer(behindFloatingImages, doc, {
      layerClass: 'layout-floating-images-layer',
      itemClass: 'layout-page-floating-image',
      sizing: 'inset0',
      layerMode: 'behind',
    });
    contentEl.appendChild(floatingLayer);
  }

  // PHASE 4: Render each fragment with floating image awareness
  // Helper to peek at a fragment's paragraph borders (for border grouping)
  const getParaBorders = (frag: Fragment): ParagraphBorders | undefined => {
    if (frag.kind !== 'paragraph' || !options.blockLookup || !frag.blockId) return undefined;
    const blockData = options.blockLookup.get(String(frag.blockId));
    if (blockData?.block.kind === 'paragraph')
      return (blockData.block as ParagraphBlock).attrs?.borders;
    return undefined;
  };

  let prevParagraphBorders: ParagraphBorders | undefined;
  const renderedInlineImageKeysByBlock = new Map<string, Set<string>>();

  for (let i = 0; i < page.fragments.length; i++) {
    const fragment = page.fragments[i];
    let fragmentEl: HTMLElement;
    const fragmentContext = { ...context, section: 'body' as const, contentWidth };

    // Calculate fragment's Y position relative to content area (for per-line margin calculation)
    const fragmentContentY = fragment.y - page.margins.top;

    // If we have block lookup, try to render full content based on fragment type
    if (options.blockLookup && fragment.blockId) {
      const blockData = options.blockLookup.get(String(fragment.blockId));

      if (
        fragment.kind === 'paragraph' &&
        blockData?.block.kind === 'paragraph' &&
        blockData?.measure.kind === 'paragraph'
      ) {
        const paragraphBlock = blockData.block as ParagraphBlock;
        const nextBorders =
          i + 1 < page.fragments.length ? getParaBorders(page.fragments[i + 1]) : undefined;
        const blockKey = String(fragment.blockId);
        let renderedInlineImageKeys = renderedInlineImageKeysByBlock.get(blockKey);
        if (!renderedInlineImageKeys) {
          renderedInlineImageKeys = new Set<string>();
          renderedInlineImageKeysByBlock.set(blockKey, renderedInlineImageKeys);
        }

        // Re-measure paragraph with floating zones for text wrapping
        let paragraphMeasure = blockData.measure as ParagraphMeasure;
        if (floatingZones.length > 0) {
          paragraphMeasure = measureParagraph(paragraphBlock, contentWidth, {
            floatingZones,
            paragraphYOffset: fragmentContentY,
          });
        }

        fragmentEl = renderParagraphFragment(
          fragment as ParagraphFragment,
          paragraphBlock,
          paragraphMeasure,
          fragmentContext,
          {
            document: doc,
            fragmentContentY: fragmentContentY,
            prevBorders: prevParagraphBorders,
            nextBorders,
            renderedInlineImageKeys,
          }
        );
        prevParagraphBorders = paragraphBlock.attrs?.borders;
      } else if (
        fragment.kind === 'table' &&
        blockData?.block.kind === 'table' &&
        blockData?.measure.kind === 'table'
      ) {
        fragmentEl = renderTableFragment(
          fragment as TableFragment,
          blockData.block as TableBlock,
          blockData.measure as TableMeasure,
          fragmentContext,
          { document: doc }
        );
        prevParagraphBorders = undefined;
      } else if (
        fragment.kind === 'image' &&
        blockData?.block.kind === 'image' &&
        blockData?.measure.kind === 'image'
      ) {
        fragmentEl = renderImageFragment(
          fragment as ImageFragment,
          blockData.block as ImageBlock,
          blockData.measure as ImageMeasure,
          fragmentContext,
          { document: doc }
        );
        prevParagraphBorders = undefined;
      } else if (
        fragment.kind === 'textBox' &&
        blockData?.block.kind === 'textBox' &&
        blockData?.measure.kind === 'textBox'
      ) {
        fragmentEl = renderTextBoxFragment(
          fragment as TextBoxFragment,
          blockData.block as TextBoxBlock,
          blockData.measure as TextBoxMeasure,
          fragmentContext,
          { document: doc }
        );
        prevParagraphBorders = undefined;
      } else {
        // Fallback to placeholder
        fragmentEl = renderFragment(fragment, fragmentContext, { document: doc });
        prevParagraphBorders = undefined;
      }
    } else {
      // Use placeholder when no blockLookup
      fragmentEl = renderFragment(fragment, fragmentContext, { document: doc });
      prevParagraphBorders = undefined;
    }

    applyFragmentStyles(fragmentEl, fragment, { left: page.margins.left, top: page.margins.top });
    contentEl.appendChild(fragmentEl);
  }

  // Render in-front floating images after text fragments so wrapNone and
  // wrapping images paint above body text without participating in flow.
  if (frontFloatingImages.length > 0) {
    const floatingLayer = renderFloatingImagesLayer(frontFloatingImages, doc, {
      layerClass: 'layout-floating-images-layer',
      itemClass: 'layout-page-floating-image',
      sizing: 'inset0',
      layerMode: 'front',
    });
    contentEl.appendChild(floatingLayer);
  }

  // Render column separator lines between columns (when w:sep is set)
  if (page.columns && page.columns.separator && page.columns.count > 1) {
    const colCount = page.columns.count;
    const colGap = page.columns.gap;
    const colWidth = (contentWidth - (colCount - 1) * colGap) / colCount;
    const contentHeight = page.size.h - page.margins.top - page.margins.bottom;

    for (let col = 0; col < colCount - 1; col++) {
      const lineX = (col + 1) * colWidth + col * colGap + colGap / 2;
      const line = doc.createElement('div');
      line.style.position = 'absolute';
      line.style.left = `${lineX}px`;
      line.style.top = '0';
      line.style.height = `${contentHeight}px`;
      line.style.width = '0.5px';
      line.style.backgroundColor = '#000';
      line.style.pointerEvents = 'none';
      contentEl.appendChild(line);
    }
  }

  // Render footnote area at the bottom of the content area (above footer)
  if (options.footnoteArea && options.footnoteArea.length > 0) {
    const fnAreaEl = renderFootnoteArea(options.footnoteArea, contentWidth, doc);
    fnAreaEl.style.position = 'absolute';
    // Position at page bottom minus bottom margin (bottom of content area)
    // The reserved height includes separator + all footnotes
    const reservedHeight = page.footnoteReservedHeight ?? 0;
    const contentAreaBottom = page.size.h - page.margins.bottom - page.margins.top;
    fnAreaEl.style.top = `${contentAreaBottom - reservedHeight}px`;
    fnAreaEl.style.left = '0';
    fnAreaEl.style.right = '0';
    contentEl.appendChild(fnAreaEl);
  }

  pageEl.appendChild(contentEl);

  // Render header area (always rendered for hover hint / double-click target)
  {
    const defaultHeaderDistance = 48;
    const headerDistance = options.headerDistance ?? page.margins.header ?? defaultHeaderDistance;
    const headerContentWidth = page.size.w - page.margins.left - page.margins.right;
    const availableHeaderHeight = Math.max(page.margins.top - headerDistance, 48);
    const headerVisualTop = options.headerContent?.visualTop ?? 0;
    const headerVisualBottom =
      options.headerContent?.visualBottom ?? options.headerContent?.height ?? 0;
    const actualHeaderHeight = Math.max(headerVisualBottom - headerVisualTop, 24);
    // If header content fits in the original space, clip overflow; otherwise
    // margins.top was already expanded so let content show fully.
    const headerOverflows = headerVisualBottom > availableHeaderHeight;

    const headerEl = doc.createElement('div');
    headerEl.className = PAGE_CLASS_NAMES.header;
    headerEl.style.position = 'absolute';
    headerEl.style.top = `${headerDistance + headerVisualTop}px`;
    headerEl.style.left = `${page.margins.left}px`;
    headerEl.style.right = `${page.margins.right}px`;
    headerEl.style.width = `${headerContentWidth}px`;
    headerEl.style.height = `${actualHeaderHeight}px`;
    headerEl.style.minHeight = `${actualHeaderHeight}px`;

    let shouldClipHeader = !headerOverflows;
    if (options.headerContent && options.headerContent.blocks.length > 0) {
      const headerContentEl = renderHeaderFooterContent(
        options.headerContent,
        { ...context, section: 'header', contentWidth: headerContentWidth },
        options,
        {
          flowTop: headerDistance,
          flowLeft: page.margins.left,
          contentWidth: headerContentWidth,
          pageWidth: page.size.w,
          pageHeight: page.size.h,
          margins: page.margins,
        }
      );
      headerContentEl.style.top = `${-headerVisualTop}px`;
      // Do not clip header containers that include media. Their measured content
      // height can exclude absolutely positioned runs, which causes visible cut-off.
      if (headerContentEl.querySelector('img')) {
        shouldClipHeader = false;
      }
      headerEl.appendChild(headerContentEl);
    }
    if (shouldClipHeader) {
      headerEl.style.maxHeight = `${availableHeaderHeight}px`;
      headerEl.style.overflow = 'hidden';
    }
    pageEl.appendChild(headerEl);
  }

  // Render footer area (always rendered for hover hint / double-click target)
  {
    const defaultFooterDistance = 48;
    const footerDistance = options.footerDistance ?? page.margins.footer ?? defaultFooterDistance;
    const footerContentWidth = page.size.w - page.margins.left - page.margins.right;
    const availableFooterHeight = Math.max(page.margins.bottom - footerDistance, 48);
    const footerVisualTop = options.footerContent?.visualTop ?? 0;
    const footerVisualBottom =
      options.footerContent?.visualBottom ?? options.footerContent?.height ?? 0;
    const actualFooterHeight = Math.max(footerVisualBottom - footerVisualTop, 24);
    const footerOverflows = actualFooterHeight > availableFooterHeight;

    const footerEl = doc.createElement('div');
    footerEl.className = PAGE_CLASS_NAMES.footer;
    footerEl.style.position = 'absolute';
    footerEl.style.top = `${page.size.h - footerDistance - actualFooterHeight}px`;
    footerEl.style.left = `${page.margins.left}px`;
    footerEl.style.right = `${page.margins.right}px`;
    footerEl.style.width = `${footerContentWidth}px`;
    footerEl.style.height = `${actualFooterHeight}px`;
    footerEl.style.minHeight = `${actualFooterHeight}px`;

    let shouldClipFooter = !footerOverflows;
    if (options.footerContent && options.footerContent.blocks.length > 0) {
      const footerContentEl = renderHeaderFooterContent(
        options.footerContent,
        { ...context, section: 'footer', contentWidth: footerContentWidth },
        options,
        {
          flowTop: page.size.h - footerDistance - (options.footerContent?.height ?? 0),
          flowLeft: page.margins.left,
          contentWidth: footerContentWidth,
          pageWidth: page.size.w,
          pageHeight: page.size.h,
          margins: page.margins,
        }
      );
      footerContentEl.style.top = `${-footerVisualTop}px`;
      if (footerContentEl.querySelector('img')) {
        shouldClipFooter = false;
      }
      footerEl.appendChild(footerContentEl);
    }
    if (shouldClipFooter) {
      footerEl.style.maxHeight = `${availableFooterHeight}px`;
      footerEl.style.overflow = 'hidden';
    }
    pageEl.appendChild(footerEl);
  }

  if (pageBorderEl && options.pageBorders?.zOrder !== 'back') {
    pageEl.appendChild(pageBorderEl);
  }

  return pageEl;
}

/**
 * Full options type used by page rendering helpers.
 */
type FullPageOptions = RenderPageOptions & { footnotesByPage?: Map<number, FootnoteRenderItem[]> };

/**
 * Build a RenderContext and resolved page options (with footnotes) for a page.
 * Centralises logic shared by populatePageShell, repopulatePageContent, and the eager render path.
 */
function buildPageRenderArgs(
  page: Page,
  totalPages: number,
  options: FullPageOptions
): { context: RenderContext; pageOptions: RenderPageOptions } {
  const context: RenderContext = {
    pageNumber: page.number,
    totalPages,
    section: 'body',
    resolvedCommentIds: options.resolvedCommentIds,
  };
  const pageOptions: RenderPageOptions = { ...options };
  // Per-page header/footer selection when titlePg is enabled
  if (options.titlePg && page.number === 1) {
    pageOptions.headerContent = options.firstPageHeaderContent;
    pageOptions.footerContent = options.firstPageFooterContent;
  }
  if (options.footnotesByPage) {
    const fns = options.footnotesByPage.get(page.number);
    if (fns && fns.length > 0) {
      (pageOptions as RenderPageOptions & { footnoteArea?: FootnoteRenderItem[] }).footnoteArea =
        fns;
    }
  }
  return { context, pageOptions };
}

/**
 * State for a single page shell used in incremental rendering.
 */
interface PageShellState {
  element: HTMLElement;
  fingerprint: string;
}

/**
 * Stored state for the page container to enable incremental updates.
 */
interface PageContainerState {
  pageStates: PageShellState[];
  totalPages: number;
  optionsHash: string;
  pageDataMap: Map<HTMLElement, { page: Page; index: number; rendered: boolean }>;
  /** Current render options — kept up-to-date so the observer closure always reads fresh values. */
  currentOptions: FullPageOptions;
}

/**
 * Extended container type with observer and render state references.
 */
interface PageContainer extends HTMLElement {
  __pageObserver?: IntersectionObserver;
  __pageRenderState?: PageContainerState;
}

/**
 * Compute a fingerprint string for a page that changes when its content changes.
 * Used to detect which pages need re-rendering on incremental updates.
 */
function computePageFingerprint(page: Page): string {
  const parts: string[] = [];

  // Page-level properties
  parts.push(`s:${page.size.w},${page.size.h}`);
  parts.push(
    `m:${page.margins.top},${page.margins.right},${page.margins.bottom},${page.margins.left}`
  );
  parts.push(`n:${page.number}`);
  if (page.footnoteReservedHeight) parts.push(`fn:${page.footnoteReservedHeight}`);

  // Each fragment's stable properties
  for (const frag of page.fragments) {
    let fp = `${frag.kind}:${frag.blockId},${frag.x},${frag.y},${frag.width},${frag.height}`;
    if (frag.pmStart !== undefined) fp += `,ps:${frag.pmStart}`;
    if (frag.pmEnd !== undefined) fp += `,pe:${frag.pmEnd}`;

    if (frag.kind === 'paragraph') {
      fp += `,fl:${frag.fromLine},tl:${frag.toLine}`;
    } else if (frag.kind === 'table') {
      fp += `,fr:${frag.fromRow},tr:${frag.toRow}`;
    }

    parts.push(fp);
  }

  return parts.join('|');
}

/**
 * Compute a hash for render options that affect all pages globally.
 * When this changes, all pages need a full re-render.
 */
function computeOptionsHash(options: RenderPageOptions): string {
  const parts: string[] = [];

  // Header/footer content changes affect all pages
  if (options.headerContent) {
    parts.push(
      `hdr:${options.headerContent.blocks.length},${options.headerContent.height},${
        options.headerContent.visualTop ?? 0
      },${options.headerContent.visualBottom ?? options.headerContent.height}`
    );
  }
  if (options.footerContent) {
    parts.push(
      `ftr:${options.footerContent.blocks.length},${options.footerContent.height},${
        options.footerContent.visualTop ?? 0
      },${options.footerContent.visualBottom ?? options.footerContent.height}`
    );
  }
  if (options.firstPageHeaderContent) {
    parts.push(
      `fp-hdr:${options.firstPageHeaderContent.blocks.length},${options.firstPageHeaderContent.height}`
    );
  }
  if (options.firstPageFooterContent) {
    parts.push(
      `fp-ftr:${options.firstPageFooterContent.blocks.length},${options.firstPageFooterContent.height}`
    );
  }
  if (options.titlePg) parts.push('titlePg');

  // Theme changes
  if (options.theme) {
    parts.push(`thm:${options.theme.name ?? 'default'}`);
  }

  // Page border changes
  if (options.pageBorders) {
    parts.push(`pb:${JSON.stringify(options.pageBorders)}`);
  }

  // Header/footer distances
  if (options.headerDistance !== undefined) parts.push(`hd:${options.headerDistance}`);
  if (options.footerDistance !== undefined) parts.push(`fd:${options.footerDistance}`);

  return parts.join('|');
}

/**
 * Apply standard container styles for the pages wrapper.
 */
function applyContainerStyles(container: HTMLElement, pageGap: number): void {
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.alignItems = 'center';
  container.style.gap = `${pageGap}px`;
  container.style.padding = `${pageGap}px`;
  container.style.backgroundColor = 'var(--doc-bg, #f8f9fa)';
}

/**
 * Number of pages to render above and below the visible area.
 * Keeps nearby pages ready for smooth scrolling.
 */
const VIRTUALIZATION_BUFFER = 2;

/**
 * Minimum page count before virtualization kicks in.
 * Small documents render all pages eagerly for simplicity.
 */
const VIRTUALIZATION_THRESHOLD = 8;

/**
 * Render multiple pages to a container with virtualization for large documents.
 *
 * For documents with fewer than VIRTUALIZATION_THRESHOLD pages, all pages
 * are rendered eagerly. For larger documents, only pages near the visible
 * viewport are fully rendered — off-screen pages are lightweight shells
 * with correct dimensions to preserve scroll position.
 *
 * An IntersectionObserver watches page elements and populates/clears
 * content as pages scroll into and out of view.
 */
export type RenderPagesUpdateKind = 'incremental' | 'full';

export function renderPages(
  pages: Page[],
  container: HTMLElement,
  options: RenderPageOptions & {
    pageGap?: number;
    footnotesByPage?: Map<number, FootnoteRenderItem[]>;
  } = {}
): RenderPagesUpdateKind {
  const totalPages = pages.length;
  const pageGap = options.pageGap ?? 24;
  const pc = container as PageContainer;
  const prevState = pc.__pageRenderState;
  const currentOptionsHash = computeOptionsHash(options);
  const useVirtualization = totalPages >= VIRTUALIZATION_THRESHOLD;

  // Determine if we can do an incremental update
  const canIncremental =
    prevState && prevState.optionsHash === currentOptionsHash && useVirtualization;

  if (canIncremental) {
    // --- INCREMENTAL UPDATE PATH ---
    const prevShells = prevState.pageStates;
    const prevDataMap = prevState.pageDataMap;
    const observer = pc.__pageObserver;

    // Compute new fingerprints
    const newFingerprints: string[] = [];
    for (const page of pages) {
      newFingerprints.push(computePageFingerprint(page));
    }

    // If total page count changed, NUMPAGES fields in headers/footers are stale.
    // Force re-render of all currently-rendered pages.
    const totalPagesChanged = prevState.totalPages !== totalPages;

    // Update existing pages
    const commonCount = Math.min(prevShells.length, pages.length);
    for (let i = 0; i < commonCount; i++) {
      const prev = prevShells[i];
      const newFp = newFingerprints[i];

      if (prev.fingerprint === newFp && !totalPagesChanged) {
        // Page unchanged — update data map with new page data (references may differ)
        const data = prevDataMap.get(prev.element);
        if (data) {
          data.page = pages[i];
        }
        continue;
      }

      // Page changed — update the shell
      const shell = prev.element;
      const data = prevDataMap.get(shell);

      // Update data map entry
      if (data) {
        data.page = pages[i];

        if (data.rendered) {
          // Surgically replace only the content area, preserving header/footer
          repopulatePageContent(shell, prevDataMap, totalPages, options);
        }
        // If not rendered, it will be populated when it scrolls into view
      }

      // Update fingerprint
      prev.fingerprint = newFp;

      // Update page styles in case size changed
      applyPageStyles(shell, pages[i].size.w, pages[i].size.h, options);
      shell.dataset.pageNumber = String(pages[i].number);
    }

    // Handle new pages (document grew)
    if (pages.length > prevShells.length) {
      const doc = options.document ?? document;
      for (let i = prevShells.length; i < pages.length; i++) {
        const page = pages[i];
        const pageEl = doc.createElement('div');
        pageEl.className = options.pageClassName ?? PAGE_CLASS_NAMES.page;
        pageEl.dataset.pageNumber = String(page.number);
        pageEl.dataset.pageIndex = String(i);
        applyPageStyles(pageEl, page.size.w, page.size.h, options);
        container.appendChild(pageEl);

        prevShells.push({ element: pageEl, fingerprint: newFingerprints[i] });
        prevDataMap.set(pageEl, { page, index: i, rendered: false });

        if (observer) {
          observer.observe(pageEl);
        }
      }
    }

    // Handle removed pages (document shrank)
    if (pages.length < prevShells.length) {
      for (let i = prevShells.length - 1; i >= pages.length; i--) {
        const shell = prevShells[i].element;
        if (observer) {
          observer.unobserve(shell);
        }
        prevDataMap.delete(shell);
        container.removeChild(shell);
      }
      prevShells.length = pages.length;
    }

    // Update indices in data map (they may have shifted)
    for (let i = 0; i < prevShells.length; i++) {
      const data = prevDataMap.get(prevShells[i].element);
      if (data) {
        data.index = i;
      }
    }

    // Update stored state with fresh options (blockLookup, footnotes, etc.)
    prevState.totalPages = totalPages;
    prevState.currentOptions = options;

    return 'incremental';
  }

  // --- FULL REBUILD PATH ---

  // Disconnect any previous observer
  const prevObserver = pc.__pageObserver;
  if (prevObserver) {
    prevObserver.disconnect();
    pc.__pageObserver = undefined;
  }

  // Clear existing content
  container.innerHTML = '';
  pc.__pageRenderState = undefined;

  applyContainerStyles(container, pageGap);

  // Build all page shells
  const pageShells: HTMLElement[] = [];
  const fingerprints: string[] = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    fingerprints.push(computePageFingerprint(page));

    if (!useVirtualization) {
      // Small document: render all pages eagerly
      const { context, pageOptions } = buildPageRenderArgs(page, totalPages, options);
      const pageEl = renderPage(page, context, pageOptions);
      container.appendChild(pageEl);
      pageShells.push(pageEl);
    } else {
      // Large document: create lightweight shell with correct dimensions
      const doc = options.document ?? document;
      const pageEl = doc.createElement('div');
      pageEl.className = options.pageClassName ?? PAGE_CLASS_NAMES.page;
      pageEl.dataset.pageNumber = String(page.number);
      pageEl.dataset.pageIndex = String(i);
      applyPageStyles(pageEl, page.size.w, page.size.h, options);
      container.appendChild(pageEl);
      pageShells.push(pageEl);
    }
  }

  if (!useVirtualization) {
    // Store state for potential future incremental updates (won't be used
    // since small docs skip the incremental path, but keeps data consistent)
    return 'full';
  }

  // --- Virtualization via IntersectionObserver ---

  // Store page data for lazy rendering
  const pageDataMap = new Map<HTMLElement, { page: Page; index: number; rendered: boolean }>();
  for (let i = 0; i < pages.length; i++) {
    pageDataMap.set(pageShells[i], { page: pages[i], index: i, rendered: false });
  }

  // Use the browser viewport as intersection root.
  // The observer reads from pc.__pageRenderState so it always uses
  // the latest options/totalPages (updated by the incremental path).
  const observer = new IntersectionObserver(
    (entries) => {
      const renderState = pc.__pageRenderState;
      if (!renderState) return;
      const {
        currentOptions: liveOptions,
        totalPages: liveTotalPages,
        pageDataMap: liveDataMap,
      } = renderState;

      for (const entry of entries) {
        const shell = entry.target as HTMLElement;
        const data = liveDataMap.get(shell);
        if (!data) continue;

        if (entry.isIntersecting) {
          // Page is near viewport — render it and neighbors
          populatePageShell(shell, liveDataMap, liveTotalPages, liveOptions);

          // Also render buffer pages above and below
          for (let offset = -VIRTUALIZATION_BUFFER; offset <= VIRTUALIZATION_BUFFER; offset++) {
            const neighborIdx = data.index + offset;
            if (
              neighborIdx >= 0 &&
              neighborIdx < renderState.pageStates.length &&
              neighborIdx !== data.index
            ) {
              populatePageShell(
                renderState.pageStates[neighborIdx].element,
                liveDataMap,
                liveTotalPages,
                liveOptions
              );
            }
          }
        }
      }

      // Sweep: depopulate pages far from any currently-visible page.
      const viewportHeight = window.innerHeight;
      const nearThreshold = viewportHeight * 3;
      const nearIndices = new Set<number>();

      for (const [el, data] of liveDataMap) {
        if (!data.rendered) continue;
        const rect = el.getBoundingClientRect();
        if (rect.bottom > -nearThreshold && rect.top < viewportHeight + nearThreshold) {
          nearIndices.add(data.index);
        }
      }

      for (const [el, data] of liveDataMap) {
        if (!data.rendered) continue;
        let keepRendered = false;
        for (const nearIdx of nearIndices) {
          if (Math.abs(data.index - nearIdx) <= VIRTUALIZATION_BUFFER + 1) {
            keepRendered = true;
            break;
          }
        }
        if (!keepRendered && nearIndices.size > 0) {
          depopulatePageShell(el, liveDataMap);
        }
      }
    },
    {
      root: null,
      rootMargin: '1500px 0px 1500px 0px',
    }
  );

  // Observe all page shells
  for (const shell of pageShells) {
    observer.observe(shell);
  }

  // Store observer and render state on the container BEFORE eager rendering,
  // so the populatePageShell calls below can find state if needed.
  pc.__pageObserver = observer;
  pc.__pageRenderState = {
    pageStates: pageShells.map((el, i) => ({ element: el, fingerprint: fingerprints[i] })),
    totalPages,
    optionsHash: currentOptionsHash,
    pageDataMap,
    currentOptions: options,
  };

  // Eagerly render the first few pages so the initial view isn't blank
  const initialRenderCount = Math.min(pages.length, VIRTUALIZATION_BUFFER + 3);
  for (let i = 0; i < initialRenderCount; i++) {
    populatePageShell(pageShells[i], pageDataMap, totalPages, options);
  }

  return 'full';
}

/**
 * Populate a page shell with full rendered content.
 */
function populatePageShell(
  shell: HTMLElement,
  pageDataMap: Map<HTMLElement, { page: Page; index: number; rendered: boolean }>,
  totalPages: number,
  options: FullPageOptions
): void {
  const data = pageDataMap.get(shell);
  if (!data || data.rendered) return;

  const { context, pageOptions } = buildPageRenderArgs(data.page, totalPages, options);
  const fullPageEl = renderPage(data.page, context, pageOptions);

  while (fullPageEl.firstChild) {
    shell.appendChild(fullPageEl.firstChild);
  }

  data.rendered = true;
}

/**
 * Surgically replace only the content area of a rendered page shell.
 * Preserves header/footer elements to avoid blinking.
 */
function repopulatePageContent(
  shell: HTMLElement,
  pageDataMap: Map<HTMLElement, { page: Page; index: number; rendered: boolean }>,
  totalPages: number,
  options: FullPageOptions
): void {
  const data = pageDataMap.get(shell);
  if (!data) return;

  const { context, pageOptions } = buildPageRenderArgs(data.page, totalPages, options);

  // Render a full page off-screen
  const fullPageEl = renderPage(data.page, context, pageOptions);

  // Extract the new content area from the rendered page
  const newContentEl = fullPageEl.querySelector(`.${PAGE_CLASS_NAMES.content}`);
  const oldContentEl = shell.querySelector(`.${PAGE_CLASS_NAMES.content}`);

  if (newContentEl && oldContentEl) {
    // Replace only the content area — header/footer stay untouched
    shell.replaceChild(newContentEl, oldContentEl);
  } else {
    // Fallback: full replace if structure doesn't match
    shell.innerHTML = '';
    data.rendered = false;
    populatePageShell(shell, pageDataMap, totalPages, options);
  }
}

/**
 * Clear a page shell's content (keep shell dimensions for scroll).
 */
function depopulatePageShell(
  shell: HTMLElement,
  pageDataMap: Map<HTMLElement, { page: Page; index: number; rendered: boolean }>
): void {
  const data = pageDataMap.get(shell);
  if (!data || !data.rendered) return;

  shell.innerHTML = '';
  data.rendered = false;
}
