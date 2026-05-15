/**
 * Layout Bridge — measure, hit-test, and map between PM positions and pixels.
 *
 * @experimental Internal layer between the layout engine and rendering.
 * The named exports below are the public contract for adapter authors,
 * but the API is still evolving and may change in minor releases until
 * a third-party adapter validates it.
 */

// PM doc → flow blocks
export {
  toFlowBlocks,
  resolveListTemplate,
  resetBlockIdCounter,
  convertBorderSpecToLayout,
} from './toFlowBlocks';
export type { ToFlowBlocksOptions } from './toFlowBlocks';

// Table-width helpers used by both the React paged editor and the layout bridge.
export {
  resolveTableWidthPx,
  countTableColumns,
  normalizeTableColumnWidths,
} from './tableWidthUtils';

// Measurement (text + paragraph + caches)
export * from './measuring';

// Hit testing — pure-geometry, on a `Layout` value
export {
  hitTest,
  hitTestPage,
  hitTestFragment,
  hitTestImageFragment,
  hitTestTableCell,
  getPageTop,
  getPageIndexAtY,
  getTotalDocumentHeight,
  getScrollYForPage,
  getPageBounds,
} from './hitTest';
export type { Point, PageHit, FragmentHit, TableCellHit, HitTestResult } from './hitTest';

// Click → PM position
//
// Two variants: the geometric `clickToPosition` works on layout state alone
// (good for tests / offline analysis); the DOM-based `mouseToPosition` walks
// the rendered DOM (the production path used by editors).
export {
  clickToPosition,
  clickToPositionInParagraph,
  clickToPositionInTableCell,
  positionToX,
  getPositionRect,
} from './clickToPosition';
export type { PositionResult } from './clickToPosition';
export {
  clickToPositionDom as mouseToPosition,
  clickToPositionDom,
  getSelectionRectsFromDom,
  getCaretPositionFromDom,
} from './clickToPositionDom';
export type { DomSelectionRect, DomCaretPosition } from './clickToPositionDom';

// Selection rectangles
export {
  selectionToRects,
  getCaretPosition,
  isMultiPageSelection,
  groupRectsByPage,
} from './selectionRects';
export type { SelectionRect, CaretPosition } from './selectionRects';

// Footnote layout helpers — full pipeline (page-mapping + content
// conversion via body pipeline) lives in core so any rendering adapter
// (React, Vue, etc.) can share the conversion logic and just supply its
// own platform measureBlocks function.
export {
  collectFootnoteRefs,
  mapFootnotesToPages,
  calculateFootnoteReservedHeights,
  applyFootnotePresentation,
  convertFootnoteToContent,
  buildFootnoteContentMap,
} from './footnoteLayout';
export type { MeasureBlocksFn, ConvertFootnoteOptions } from './footnoteLayout';

// Header / footer layout helpers — same pattern as footnote: full pipeline
// (normalization + conversion) lives in core, with adapter-supplied
// `measureBlocks` so the helper stays Canvas-free.
export {
  normalizeHeaderFooterMeasureBlocks,
  resolveHeaderFooterVisualTop,
  calculateHeaderFooterVisualBounds,
  convertHeaderFooterToContent,
} from './headerFooterLayout';
export type { HeaderFooterMetrics, ConvertHeaderFooterOptions } from './headerFooterLayout';

// Table-insert hover hit-test — pure DOM logic shared across adapters.
export {
  detectTableInsertHover,
  TABLE_INSERT_EDGE_PROXIMITY,
  TABLE_INSERT_HIDE_DELAY_MS,
} from './tableInsertHover';
export type { TableInsertHoverHit, TableInsertHoverInput } from './tableInsertHover';

// Body-scoped PM-position DOM lookups. Centralizes the `.layout-page-content`
// prefix so call sites can't accidentally match HF runs whose PM positions
// collide with body positions (HF parses to a separate PM document).
export {
  findBodyPmSpans,
  findBodyEmptyRuns,
  findBodyPmAnchors,
  findBodyPmAnchor,
} from './findBodyPmSpans';
