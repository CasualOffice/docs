/**
 * Editor utilities (curated public surface).
 *
 * The named exports below are the public API contract. Adding a helper
 * to a source module does not automatically make it public — it must
 * be added to this barrel to be reachable from `@eigenpal/docx-core/utils`.
 */

// Unit conversion
export {
  TWIPS_PER_INCH,
  PIXELS_PER_INCH,
  twipsToPixels,
  pixelsToTwips,
  emuToPixels,
  pixelsToEmu,
  emuToTwips,
  twipsToEmu,
  pointsToPixels,
  halfPointsToPixels,
  halfPointsToPoints,
  pointsToHalfPoints,
  eighthsToPixels,
  roundPixels,
  clamp,
  formatPx,
} from './units';

// Color resolution
export {
  resolveColor,
  resolveColorToHex,
  resolveHighlightColor,
  resolveShadingColor,
  isBlack,
  isWhite,
  getContrastingColor,
  parseColorString,
  createThemeColor,
  createRgbColor,
  darkenColor,
  lightenColor,
  blendColors,
  ensureHexPrefix,
  resolveHighlightToCss,
  getThemeTintShadeHex,
  generateThemeTintShadeMatrix,
  colorsEqual,
} from './colorResolver';
export type { ThemeMatrixCell } from './colorResolver';

// Clipboard
export {
  INTERNAL_CLIPBOARD_TYPE,
  CLIPBOARD_TYPES,
  getClipboardImageFiles,
  copyRuns,
  copyParagraphs,
  runsToClipboardContent,
  paragraphsToClipboardContent,
  writeToClipboard,
  readFromClipboard,
  handlePasteEvent,
  parseClipboardHtml,
  isWordHtml,
  isEditorHtml,
  cleanWordHtml,
  htmlToRuns,
  createClipboardHandlers,
} from './clipboard';
export type { ClipboardContent, ParsedClipboardContent, ClipboardOptions } from './clipboard';

// Document creation
export { createEmptyDocument, createDocumentWithText } from './createDocument';
export type { CreateEmptyDocumentOptions } from './createDocument';

// DOCX input handling
export { toArrayBuffer } from './docxInput';
export type { DocxInput } from './docxInput';

// Font loading
export {
  loadFont,
  loadFonts,
  loadFontFromBuffer,
  loadFontWithMapping,
  loadFontsWithMapping,
  preloadCommonFonts,
  loadDocumentFonts,
  isFontLoaded,
  isLoading,
  getLoadedFonts,
  onFontsLoaded,
  canRenderFont,
  FONT_MAPPING,
  getGoogleFontEquivalent,
  extractFontsFromDocument,
} from './fontLoader';

// Formatting → CSS style
export {
  textToStyle,
  paragraphToStyle,
  borderToStyle,
  resolveShadingFill,
  mergeStyles,
  tableCellToStyle,
  sectionToStyle,
} from './formatToStyle';

// Heading collection
export { collectHeadings } from './headingCollector';
export type { HeadingInfo } from './headingCollector';

// Insert operations
export {
  createPageBreak,
  createColumnBreak,
  createLineBreak,
  createPageBreakRun,
  createPageBreakParagraph,
  insertPageBreak,
  createHorizontalRule,
  insertHorizontalRule,
  isPageBreak,
  isColumnBreak,
  isLineBreak,
  isBreakContent,
  hasPageBreakBefore,
  countPageBreaks,
  findPageBreaks,
  removePageBreak,
} from './insertOperations';
export type { InsertPosition } from './insertOperations';

// Keyboard navigation
export {
  isWordCharacter,
  isWhitespace,
  isPunctuation,
  findWordStart,
  findWordEnd,
  findNextWordStart,
  findPreviousWordStart,
  findVisualLineStart,
  findVisualLineEnd,
  getSelectionInfo,
  setSelectionPosition,
  extendSelectionTo,
  moveByWord,
  moveToLineEdge,
  parseNavigationAction,
  handleNavigationKey,
  isNavigationKey,
  expandSelectionToWord,
  getWordAtCursor,
  matchesShortcut,
  describeShortcut,
  getNavigationShortcutDescriptions,
  NAVIGATION_SHORTCUTS,
} from './keyboardNavigation';
export type {
  NavigationDirection,
  NavigationUnit,
  NavigationAction,
  KeyboardShortcut,
} from './keyboardNavigation';

// Template processing
export {
  processTemplate,
  processTemplateDetailed,
  processTemplateAsBlob,
  processTemplateAndDownload,
  getTemplateTags,
  validateTemplate,
  getMissingVariables,
  previewTemplate,
  processTemplateAdvanced,
  createTemplateProcessor,
} from './processTemplate';
export type {
  ProcessTemplateOptions,
  ProcessTemplateResult,
  TemplateError,
} from './processTemplate';

// Selection highlight
export {
  DEFAULT_SELECTION_STYLE,
  HIGH_CONTRAST_SELECTION_STYLE,
  SELECTION_CSS_VARS,
  getSelectionRects,
  mergeAdjacentRects,
  getMergedSelectionRects,
  getHighlightRectStyle,
  generateSelectionCSS,
  hasActiveSelection,
  getSelectedText,
  isSelectionWithin,
  getSelectionBoundingRect,
  highlightTextRange,
  selectRange,
  clearSelection,
  isSelectionBackwards,
  normalizeSelectionDirection,
  injectSelectionStyles,
  removeSelectionStyles,
  areSelectionStylesInjected,
  createSelectionChangeHandler,
} from './selectionHighlight';
export type { HighlightRect, SelectionHighlightConfig, SelectionRange } from './selectionHighlight';

// Table split algorithm
export {
  sumColumnWidths,
  redistributeColumnWidths,
  computeSplitLayout,
  buildAnchorMaps,
  computeSplitDialogDefaults,
} from './tableSplitAlgorithm';
export type { CellAnchor, SplitTarget, SplitLayoutResult } from './tableSplitAlgorithm';

// Text selection helpers
export {
  findWordBoundaries,
  getWordAt,
  findWordAt,
  selectWordAtCursor,
  selectWordInTextNode,
  expandSelectionToWordBoundaries,
  selectParagraphAtCursor,
  handleClickForMultiClick,
  createDoubleClickWordSelector,
  createTripleClickParagraphSelector,
} from './textSelection';
export type { WordSelectionResult } from './textSelection';
