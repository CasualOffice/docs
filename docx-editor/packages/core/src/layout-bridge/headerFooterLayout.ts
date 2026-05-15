/**
 * Header / Footer Layout Utilities
 *
 * The header/footer rendering pipeline lives here so any rendering adapter
 * (React, Vue, etc.) can share the conversion logic and just supply its
 * platform-specific {@link MeasureBlocksFn}. Mirrors the footnote pipeline
 * in `footnoteLayout.ts`.
 *
 * Pipeline:
 *   HF.content → headerFooterToProseDoc → toFlowBlocks
 *     → measureBlocks (caller-supplied, Canvas-aware)
 *     → HeaderFooterContent (blocks, measures, height, visualTop/Bottom)
 *
 * The render side uses the normalized block list so paint and measurement stay
 * in lockstep. Visual-bounds calculation still inspects the original block
 * list because floating images can paint above/below the nominal flow box even
 * when they do not contribute to flow height.
 */

import type { FlowBlock, ImageRun, Measure, PageMargins, TableBlock } from '../layout-engine/types';
import type { HeaderFooter, StyleDefinitions, Theme } from '../types/document';
import type { HeaderFooterContent } from '../layout-painter/renderPage';
import { headerFooterToProseDoc } from '../prosemirror/conversion/toProseDoc';
import { emuToPixels } from '../utils/units';
import { toFlowBlocks } from './toFlowBlocks';
import type { MeasureBlocksFn } from './footnoteLayout';

// ============================================================================
// 1. Page-level metrics passed in by the caller
// ============================================================================

export type HeaderFooterMetrics = {
  section: 'header' | 'footer';
  pageSize: { w: number; h: number };
  margins: PageMargins;
};

// ============================================================================
// 2. Measurement-time block normalization
// ============================================================================
//
// Two transforms are applied to the FlowBlock list before measurement/render:
//
// 1. **Strip style-inherited paragraph spacing** (#380) — Word visibly
//    does NOT honor inherited `spaceBefore` / `spaceAfter` (e.g. Normal's
//    default 8pt-after) inside the HF text frame. Inline `<w:spacing>`
//    set explicitly on the HF paragraph IS honored. The parser flags
//    inline spacing via `spacingExplicit.before` / `.after`; anything
//    not flagged was inherited from the style chain and is zeroed for
//    both measurement and painting.
//
// 2. **Zero trailing empty paragraph after a table** (#381) — OOXML
//    requires a trailing block-level element after the last `<w:tbl>`
//    in any block container, including `<w:hdr>` / `<w:ftr>`. Word
//    renders that empty paragraph as a zero-height anchor (just the
//    paragraph mark glyph) when it has no runs AND no authored visual
//    content (no paragraph borders, no explicit spacing). We mark its
//    measure with `suppressEmptyParagraphHeight` so the BLOCK survives
//    (click-to-position into the empty space below the table places
//    the cursor in the trailing paragraph, matching Word) but the
//    measure returns zero height. Empty paragraphs with authored
//    `pBdr` (e.g. a horizontal rule under the header) or
//    `spacingExplicit` are NOT suppressed — they exist for their
//    visual side effect, not just as a structural anchor.

function hasAuthoredVisualContent(block: FlowBlock): boolean {
  if (block.kind !== 'paragraph') return false;
  const attrs = block.attrs;
  if (!attrs) return false;
  if (attrs.borders?.top || attrs.borders?.bottom) return true;
  if (attrs.spacingExplicit?.before || attrs.spacingExplicit?.after) return true;
  return false;
}

export function normalizeHeaderFooterMeasureBlocks(blocks: FlowBlock[]): FlowBlock[] {
  return normalizeFlowBlockArray(blocks);
}

function normalizeFlowBlockArray(blocks: FlowBlock[]): FlowBlock[] {
  const trailingEmptyAfterTable = new Set<number>();
  for (let i = 1; i < blocks.length; i++) {
    const prev = blocks[i - 1];
    const cur = blocks[i];
    if (prev.kind !== 'table') continue;
    if (cur.kind !== 'paragraph') continue;
    if (cur.runs.length > 0) continue;
    if (hasAuthoredVisualContent(cur)) continue;
    trailingEmptyAfterTable.add(i);
  }

  return blocks.map((block, index) => {
    if (block.kind === 'table') {
      return normalizeTableBlock(block);
    }
    if (block.kind !== 'paragraph') return block;

    const isTrailingEmpty = trailingEmptyAfterTable.has(index);

    const explicit = block.attrs?.spacingExplicit;
    const hasResolvedBefore = block.attrs?.spacing?.before != null;
    const hasResolvedAfter = block.attrs?.spacing?.after != null;
    const beforeIsInherited = hasResolvedBefore && !explicit?.before;
    const afterIsInherited = hasResolvedAfter && !explicit?.after;
    const stripsSpacing = beforeIsInherited || afterIsInherited;

    if (!stripsSpacing && !isTrailingEmpty) return block;

    let attrs = block.attrs;
    if (stripsSpacing && attrs?.spacing) {
      attrs = {
        ...attrs,
        spacing: {
          ...attrs.spacing,
          before: explicit?.before ? attrs.spacing.before : undefined,
          after: explicit?.after ? attrs.spacing.after : undefined,
        },
      };
    }

    if (isTrailingEmpty) {
      attrs = { ...(attrs ?? {}), suppressEmptyParagraphHeight: true };
    }

    return { ...block, attrs };
  });
}

function normalizeTableBlock(block: TableBlock): TableBlock {
  let changed = false;
  const rows = block.rows.map((row) => {
    let rowChanged = false;
    const cells = row.cells.map((cell) => {
      const normalizedBlocks = normalizeFlowBlockArray(cell.blocks);
      const cellChanged = normalizedBlocks.some(
        (normalizedBlock, idx) => normalizedBlock !== cell.blocks[idx]
      );
      if (!cellChanged) return cell;
      rowChanged = true;
      return { ...cell, blocks: normalizedBlocks };
    });
    if (!rowChanged) return row;
    changed = true;
    return { ...row, cells };
  });

  return changed ? { ...block, rows } : block;
}

// ============================================================================
// 3. Visual bounds (account for floating images that paint above/below the
//    nominal flow rectangle so HF clipping & shadow regions size correctly)
// ============================================================================

type PositionedAxis = {
  relativeTo?: string;
  posOffset?: number;
  align?: string;
  alignment?: string;
};

function getPositionAlignment(axis: PositionedAxis | undefined): string | undefined {
  return axis?.align ?? axis?.alignment;
}

export function resolveHeaderFooterVisualTop(
  run: ImageRun,
  paragraphY: number,
  flowHeight: number,
  metrics: HeaderFooterMetrics
): number {
  const flowTop =
    metrics.section === 'header'
      ? (metrics.margins.header ?? 48)
      : metrics.pageSize.h - (metrics.margins.footer ?? 48) - flowHeight;
  const vertical = run.position?.vertical;

  if (!vertical) {
    return paragraphY;
  }

  const align = getPositionAlignment(vertical);
  const offsetPx = vertical.posOffset !== undefined ? emuToPixels(vertical.posOffset) : undefined;

  if (vertical.relativeTo === 'page') {
    if (offsetPx !== undefined) return offsetPx - flowTop;
    if (align === 'top') return -flowTop;
    if (align === 'bottom') return metrics.pageSize.h - run.height - flowTop;
    if (align === 'center') return (metrics.pageSize.h - run.height) / 2 - flowTop;
  }

  if (vertical.relativeTo === 'margin') {
    const marginTop = metrics.margins.top;
    const marginHeight = metrics.pageSize.h - metrics.margins.top - metrics.margins.bottom;
    if (offsetPx !== undefined) return marginTop + offsetPx - flowTop;
    if (align === 'top') return marginTop - flowTop;
    if (align === 'bottom') return marginTop + marginHeight - run.height - flowTop;
    if (align === 'center') return marginTop + (marginHeight - run.height) / 2 - flowTop;
  }

  if (offsetPx !== undefined) {
    return paragraphY + offsetPx;
  }

  return paragraphY;
}

export function calculateHeaderFooterVisualBounds(
  blocks: FlowBlock[],
  measures: Measure[],
  flowHeight: number,
  metrics: HeaderFooterMetrics
): { visualTop: number; visualBottom: number } {
  let visualTop = 0;
  let visualBottom = flowHeight;
  let cursorY = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const measure = measures[i];
    if (!block || !measure) continue;

    if (block.kind === 'paragraph' && measure.kind === 'paragraph') {
      const paragraphStartY = cursorY;
      const paragraphBottomY = paragraphStartY + measure.totalHeight;
      visualTop = Math.min(visualTop, paragraphStartY);
      visualBottom = Math.max(visualBottom, paragraphBottomY);

      for (const run of block.runs) {
        if (run.kind !== 'image' || !run.position) continue;
        const runTop = resolveHeaderFooterVisualTop(run, paragraphStartY, flowHeight, metrics);
        visualTop = Math.min(visualTop, runTop);
        visualBottom = Math.max(visualBottom, runTop + run.height);
      }

      cursorY = paragraphBottomY;
    } else if (block.kind === 'table' && measure.kind === 'table') {
      const blockBottomY = cursorY + measure.totalHeight;
      visualTop = Math.min(visualTop, cursorY);
      visualBottom = Math.max(visualBottom, blockBottomY);
      cursorY = blockBottomY;
    } else if (block.kind === 'image' && measure.kind === 'image') {
      const blockBottomY = cursorY + measure.height;
      visualTop = Math.min(visualTop, cursorY);
      visualBottom = Math.max(visualBottom, blockBottomY);
      cursorY = blockBottomY;
    } else if (block.kind === 'textBox' && measure.kind === 'textBox') {
      const blockBottomY = cursorY + measure.height;
      visualTop = Math.min(visualTop, cursorY);
      visualBottom = Math.max(visualBottom, blockBottomY);
      cursorY = blockBottomY;
    }
  }

  return { visualTop, visualBottom };
}

// ============================================================================
// 4. HeaderFooter → HeaderFooterContent (the public entry point)
// ============================================================================

export type ConvertHeaderFooterOptions = {
  styles?: StyleDefinitions | null;
  theme?: Theme | null;
  measureBlocks: MeasureBlocksFn;
};

/**
 * Convert HeaderFooter (document type) to HeaderFooterContent (render type).
 *
 * Routes through the same pipeline as the body: HF.content →
 * headerFooterToProseDoc → toFlowBlocks → measureBlocks. The inline editor
 * uses the same conversion chain, so block support (paragraph, table, image,
 * textBox, fields) and the inline editor's content stay in lockstep.
 */
export function convertHeaderFooterToContent(
  headerFooter: HeaderFooter | null | undefined,
  contentWidth: number,
  metrics: HeaderFooterMetrics,
  options: ConvertHeaderFooterOptions
): HeaderFooterContent | undefined {
  if (!headerFooter || !headerFooter.content || headerFooter.content.length === 0) {
    return undefined;
  }

  const pmDoc = headerFooterToProseDoc(headerFooter.content, {
    styles: options.styles ?? undefined,
    theme: options.theme ?? null,
  });
  const blocks = toFlowBlocks(pmDoc, { theme: options.theme ?? undefined });
  if (blocks.length === 0) return undefined;

  const blocksForMeasure = normalizeHeaderFooterMeasureBlocks(blocks);
  const measures = options.measureBlocks(blocksForMeasure, contentWidth);
  const totalHeight = measures.reduce((h, m) => {
    if (m.kind === 'paragraph') return h + m.totalHeight;
    if (m.kind === 'table') return h + m.totalHeight;
    if (m.kind === 'image') return h + m.height;
    if (m.kind === 'textBox') return h + m.height;
    return h;
  }, 0);
  const { visualTop, visualBottom } = calculateHeaderFooterVisualBounds(
    blocks,
    measures,
    totalHeight,
    metrics
  );

  return {
    blocks: blocksForMeasure,
    measures,
    height: totalHeight,
    visualTop,
    visualBottom,
  };
}
