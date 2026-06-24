/**
 * Footnote Layout Utilities
 *
 * Footnote/endnote rendering pipeline plus page-mapping helpers:
 * - scanning FlowBlocks for footnote references and their PM positions
 * - mapping references to the page that ends up containing them
 * - converting a Footnote → FootnoteContent via the body pipeline
 *   (footnoteToProseDoc → toFlowBlocks → caller-supplied measureBlocks)
 * - reserving per-page footnote area heights for layout
 *
 * Everything that's pure OOXML / FlowBlock semantics lives here so the
 * React, Vue, and any future adapters can share the conversion logic
 * and just supply their own measurement function (which depends on
 * platform-specific Canvas/font metrics).
 */

import type {
  FlowBlock,
  ParagraphBlock,
  Measure,
  Page,
  FootnoteContent,
} from '../layout-engine/types';
import type { Footnote, StyleDefinitions, Theme } from '../types/document';
import { footnoteToProseDoc } from '../prosemirror/conversion/toProseDoc';
import { createStyleResolver } from '../prosemirror/styles/styleResolver';
import { toFlowBlocks } from './toFlowBlocks';

/** Separator line height + padding in pixels */
const SEPARATOR_HEIGHT = 12;

/**
 * Default footnote font size in points. Word's built-in "Footnote Text"
 * style sets 8pt; we apply this only when the footnote's runs don't
 * already specify a fontSize (avoids overriding authored sizes).
 *
 * Used as a last-resort fallback when the document doesn't define a
 * `FootnoteText` / `footnote text` style — `resolveFootnoteFontSizePt`
 * below prefers the style cascade.
 */
const DEFAULT_FOOTNOTE_FONT_SIZE_PT = 8;

/**
 * OOXML candidate style IDs for the footnote-body style, in resolution
 * order. Word writes `FootnoteText`; Pages / older Office writes
 * `footnote text` (lowercase + space). We try each in turn and fall
 * through to the 8pt baked-in default.
 */
const FOOTNOTE_STYLE_CANDIDATES = ['FootnoteText', 'footnote text'] as const;

/**
 * Resolve the effective footnote body font size in points by consulting
 * the document's style cascade. Returns the 8pt default if no styles
 * are provided or no `FootnoteText`-like style declares a fontSize.
 *
 * Note: `TextFormatting.fontSize` is in OOXML half-points; FlowBlock
 * runs carry points, so we divide by 2 at the boundary.
 */
function resolveFootnoteFontSizePt(styles: StyleDefinitions | null | undefined): number {
  if (!styles) return DEFAULT_FOOTNOTE_FONT_SIZE_PT;
  const resolver = createStyleResolver(styles);
  for (const candidate of FOOTNOTE_STYLE_CANDIDATES) {
    const resolved = resolver.resolveParagraphStyle(candidate);
    const halfPoints = resolved.runFormatting?.fontSize;
    if (halfPoints != null && halfPoints > 0) {
      return halfPoints / 2;
    }
  }
  return DEFAULT_FOOTNOTE_FONT_SIZE_PT;
}

// ============================================================================
// 1. Scan FlowBlocks for footnote references
// ============================================================================

/**
 * Scan FlowBlocks for runs with footnoteRefId set.
 * Returns a list of { footnoteId, pmPos } in document order.
 */
export function collectFootnoteRefs(
  blocks: FlowBlock[]
): Array<{ footnoteId: number; pmPos: number }> {
  const refs: Array<{ footnoteId: number; pmPos: number }> = [];

  for (const block of blocks) {
    if (block.kind !== 'paragraph') continue;
    for (const run of block.runs) {
      if (run.kind === 'text' && run.footnoteRefId != null) {
        refs.push({
          footnoteId: run.footnoteRefId,
          pmPos: run.pmStart ?? 0,
        });
      }
    }
  }

  return refs;
}

// ============================================================================
// 2. Map footnote references to pages
// ============================================================================

/**
 * After layout, determine which footnotes appear on which pages.
 * Checks each page's fragments to see if any footnoteRef PM positions fall within.
 *
 * Returns Map<pageNumber, footnoteId[]> in document order.
 */
export function mapFootnotesToPages(
  pages: Page[],
  footnoteRefs: Array<{ footnoteId: number; pmPos: number }>
): Map<number, number[]> {
  const pageFootnotes = new Map<number, number[]>();

  if (footnoteRefs.length === 0) return pageFootnotes;

  // For each footnote ref, find which page it lands on
  for (const ref of footnoteRefs) {
    for (const page of pages) {
      let found = false;
      for (const fragment of page.fragments) {
        const pmStart = fragment.pmStart ?? -1;
        const pmEnd = fragment.pmEnd ?? -1;
        if (pmStart >= 0 && pmEnd >= 0 && ref.pmPos >= pmStart && ref.pmPos < pmEnd) {
          const existing = pageFootnotes.get(page.number) ?? [];
          // Avoid duplicates (same footnote shouldn't appear twice on same page)
          if (!existing.includes(ref.footnoteId)) {
            existing.push(ref.footnoteId);
          }
          pageFootnotes.set(page.number, existing);
          found = true;
          break;
        }
      }
      if (found) break;
    }
  }

  return pageFootnotes;
}

// ============================================================================
// 3. Convert a footnote to renderable FlowBlocks (body-pipeline)
// ============================================================================

/**
 * Footnote-specific block normalization. Mirrors the spirit of
 * `normalizeHeaderFooterMeasureBlocks`: post-process the body-pipeline
 * output for a single footnote so it carries the correct visual prefix
 * (its display number, rendered as a superscript) and a default 8pt font
 * for any run that didn't specify a size.
 *
 * The displayNumber is prepended onto the FIRST paragraph as a fresh
 * superscript text run — visually matches Word's footnote numbering
 * without disturbing the authored runs.
 *
 * Exported for callers that want to compose their own conversion
 * pipeline; `convertFootnoteToContent` calls it as part of its flow.
 */
export function applyFootnotePresentation(
  blocks: FlowBlock[],
  displayNumber: number,
  defaultFontSizePt: number = DEFAULT_FOOTNOTE_FONT_SIZE_PT
): FlowBlock[] {
  if (blocks.length === 0) {
    return [
      {
        kind: 'paragraph',
        id: `fn-empty-${displayNumber}`,
        runs: [
          {
            kind: 'text',
            text: `${displayNumber}  `,
            fontSize: defaultFontSizePt,
            superscript: true,
          },
        ],
      } as ParagraphBlock,
    ];
  }

  // Apply the resolved default size to every run that didn't specify a
  // fontSize. Mutating a copy keeps the input blocks pure for caching
  // upstream.
  const out = blocks.map((b) => {
    if (b.kind !== 'paragraph') return b;
    const para = b as ParagraphBlock;
    return {
      ...para,
      runs: para.runs.map((r) => {
        if (r.kind === 'text' || r.kind === 'tab') {
          if (r.fontSize == null) {
            return { ...r, fontSize: defaultFontSizePt };
          }
        }
        return r;
      }),
    } as ParagraphBlock;
  });

  // Prepend display number on the first paragraph.
  const first = out[0];
  if (first.kind === 'paragraph') {
    const numberRun = {
      kind: 'text' as const,
      text: `${displayNumber}  `,
      fontSize: defaultFontSizePt,
      superscript: true,
    };
    out[0] = {
      ...(first as ParagraphBlock),
      runs: [numberRun, ...(first as ParagraphBlock).runs],
    } as ParagraphBlock;
  }

  return out;
}

/**
 * Adapter-supplied block measurement function. The caller (React /
 * Vue / etc.) supplies its platform's measure routine — at minimum
 * paragraph + table + image + textBox — so this core helper stays
 * Canvas-free.
 */
export type MeasureBlocksFn = (blocks: FlowBlock[], contentWidth: number) => Measure[];

/**
 * Options for {@link convertFootnoteToContent}.
 */
export type ConvertFootnoteOptions = {
  /** The document's parsed style definitions, threaded into the body pipeline. */
  styles?: StyleDefinitions | null;
  /** Theme for resolving themed fills / fonts inside the footnote. */
  theme?: Theme | null;
  /** Measure callback supplied by the rendering adapter. */
  measureBlocks: MeasureBlocksFn;
};

/**
 * Convert a Footnote to renderable FootnoteContent via the body pipeline:
 * `footnoteToProseDoc → toFlowBlocks → applyFootnotePresentation →
 * measureBlocks`. Pre-PR (#378) this lived in a hand-rolled shadow stack
 * that silently dropped non-paragraph content; routing through the body
 * pipeline gives footnotes full block-kind support — paragraph + table
 * + image + textBox + fields.
 */
export function convertFootnoteToContent(
  footnote: Footnote,
  displayNumber: number,
  contentWidth: number,
  options: ConvertFootnoteOptions
): FootnoteContent {
  const pmDoc = footnoteToProseDoc(footnote.content, {
    styles: options.styles ?? undefined,
    theme: options.theme ?? null,
  });
  const rawBlocks = toFlowBlocks(pmDoc, { theme: options.theme ?? undefined });
  const defaultFontSizePt = resolveFootnoteFontSizePt(options.styles);
  const blocks = applyFootnotePresentation(rawBlocks, displayNumber, defaultFontSizePt);

  const measures = options.measureBlocks(blocks, contentWidth);

  const totalHeight = measures.reduce((h, m) => {
    if (m.kind === 'paragraph') return h + m.totalHeight;
    if (m.kind === 'table') return h + m.totalHeight;
    if (m.kind === 'image') return h + m.height;
    if (m.kind === 'textBox') return h + m.height;
    return h;
  }, 0);

  return {
    id: footnote.id,
    displayNumber,
    blocks,
    measures,
    height: totalHeight,
  };
}

/**
 * Build footnote content for all footnotes referenced in the document.
 * Display numbers are assigned by first-appearance order (the same way
 * Word renders them).
 */
export function buildFootnoteContentMap(
  footnotes: Footnote[],
  footnoteRefs: Array<{ footnoteId: number }>,
  contentWidth: number,
  options: ConvertFootnoteOptions
): Map<number, FootnoteContent> {
  const contentMap = new Map<number, FootnoteContent>();
  const footnoteById = new Map<number, Footnote>();

  for (const fn of footnotes) {
    if (fn.noteType === 'normal' || fn.noteType == null) {
      footnoteById.set(fn.id, fn);
    }
  }

  let displayNumber = 1;
  const seen = new Set<number>();

  for (const ref of footnoteRefs) {
    if (seen.has(ref.footnoteId)) continue;
    seen.add(ref.footnoteId);

    const footnote = footnoteById.get(ref.footnoteId);
    if (!footnote) continue;

    contentMap.set(
      ref.footnoteId,
      convertFootnoteToContent(footnote, displayNumber, contentWidth, options)
    );
    displayNumber++;
  }

  return contentMap;
}

// ============================================================================
// 4. Per-page footnote area height reservation
// ============================================================================

/**
 * Calculate per-page footnote reserved heights.
 * Returns Map<pageNumber, reservedHeight>.
 */
export function calculateFootnoteReservedHeights(
  pageFootnoteMap: Map<number, number[]>,
  footnoteContentMap: Map<number, { height: number }>
): Map<number, number> {
  const reserved = new Map<number, number>();

  for (const [pageNumber, footnoteIds] of pageFootnoteMap) {
    let totalHeight = 0;

    for (const fnId of footnoteIds) {
      const content = footnoteContentMap.get(fnId);
      if (content) {
        totalHeight += content.height;
      }
    }

    if (totalHeight > 0) {
      // Add separator height
      totalHeight += SEPARATOR_HEIGHT;
      reserved.set(pageNumber, totalHeight);
    }
  }

  return reserved;
}
