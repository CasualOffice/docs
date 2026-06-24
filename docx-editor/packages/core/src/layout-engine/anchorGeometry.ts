/**
 * Anchor geometry — translate OOXML `relativeFrom` anchors (ST_RelFromH /
 * ST_RelFromV, ECMA-376 §20.4.3.1-2) into painter coordinates.
 *
 * Extracted verbatim from the floating-image path in `renderPage.ts` so the
 * layout engine and the renderer share ONE implementation. All inputs/outputs
 * are CSS pixels; the painter's coordinate origin is the content-area top-left
 * (i.e. inset by the page margins), so `relativeFrom="page"` resolves to a
 * negative margin offset.
 */
import { emuToPixels } from '../utils/units';

/** Page geometry needed to resolve an anchor band, in CSS pixels. */
export interface AnchorGeometry {
  pageWidth: number;
  pageHeight: number;
  marginLeft: number;
  marginTop: number;
  contentWidth: number;
  contentHeight: number;
  /** Column left edge (content-area-relative). Defaults to 0 (single column). */
  columnX?: number;
  /** Column width. Defaults to contentWidth. */
  columnWidth?: number;
}

/** Horizontal anchor (`<wp:positionH>` / VML `mso-position-horizontal*`). */
export interface HorizontalAnchorSpec {
  relativeTo?: string;
  align?: string;
  posOffset?: number;
}

/** Vertical anchor (`<wp:positionV>` / VML `mso-position-vertical*`). */
export interface VerticalAnchorSpec {
  relativeTo?: string;
  align?: string;
  posOffset?: number;
}

/**
 * Resolve the horizontal position of an anchored object within the painter's
 * content-area coordinate space. Returns the x (content-area-relative) and the
 * heuristic `side` the floating-image wrap logic uses.
 */
export function resolveAnchorX(
  h: HorizontalAnchorSpec,
  objectWidth: number,
  geom: AnchorGeometry
): { x: number; side: 'left' | 'right' } {
  const { pageWidth, marginLeft, contentWidth } = geom;
  const columnX = geom.columnX ?? 0;
  const columnWidth = geom.columnWidth ?? contentWidth;

  // ECMA-376 §20.4.3.2 (ST_RelFromH): pick a band origin (`baseX`) and band
  // width, then `align` or `posOffset` chooses within it. The painter's
  // content origin is `marginLeft` from the page edge, so `page`/`leftMargin`
  // is `-marginLeft`.
  const baseX = (() => {
    switch (h.relativeTo) {
      case 'page':
      case 'leftMargin':
        return -marginLeft;
      case 'rightMargin':
        return contentWidth;
      case 'column':
        return columnX;
      case 'character':
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
        return columnWidth;
      case 'margin':
      case 'insideMargin':
      case 'outsideMargin':
      default:
        return contentWidth;
    }
  })();

  let side: 'left' | 'right' = 'left';
  let x = 0;
  if (h.align === 'right') {
    side = 'right';
    x = bandWidth ? baseX + bandWidth - objectWidth : 0;
  } else if (h.align === 'left') {
    side = 'left';
    x = baseX;
  } else if (h.align === 'center') {
    side = 'left';
    x = bandWidth ? baseX + (bandWidth - objectWidth) / 2 : 0;
  } else if (h.posOffset !== undefined) {
    x = baseX + emuToPixels(h.posOffset);
    side = x > contentWidth / 2 ? 'right' : 'left';
  } else {
    // Bare positionH (no align, no offset) — anchor at band origin.
    x = baseX;
  }
  return { x, side };
}

/**
 * Resolve the vertical position of an anchored object within the painter's
 * content-area coordinate space. `fragmentY` is the in-flow Y of the anchoring
 * paragraph (used for paragraph/line-relative anchors and as the fallback).
 */
export function resolveAnchorY(
  v: VerticalAnchorSpec,
  objectHeight: number,
  fragmentY: number,
  geom: AnchorGeometry
): number {
  const { pageHeight, marginTop, contentHeight } = geom;
  // ECMA-376 §20.4.3.1 (ST_RelFromV). `topMargin` is the strip ABOVE the
  // content area (negative offset); `bottomMargin` is BELOW (`contentHeight`).
  // `margin` is the content area itself. `insideMargin`/`outsideMargin` are
  // mirror-margins for facing pages — approximated as `margin`.
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
    return baseY;
  } else if (v.align === 'center') {
    return bandHeight ? baseY + (bandHeight - objectHeight) / 2 : fragmentY;
  } else if (v.align === 'bottom') {
    return bandHeight ? baseY + bandHeight - objectHeight : fragmentY;
  } else if (v.posOffset !== undefined) {
    return baseY + emuToPixels(v.posOffset);
  }
  // Bare positionV (no align, no offset): paragraph/line stays in flow; any
  // other band means "anchor at the band origin".
  return v.relativeTo === 'paragraph' || v.relativeTo === 'line' ? fragmentY : baseY;
}
