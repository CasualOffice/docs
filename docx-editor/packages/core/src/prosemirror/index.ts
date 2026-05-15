/**
 * ProseMirror Integration for DOCX Editor
 *
 * This module provides ProseMirror-based editing:
 * - Schema for DOCX document structure
 * - Bidirectional conversion between Document and PM
 * - React wrapper component
 * - Plugins for selection tracking
 * - Commands for formatting
 * - Extension system for schema, plugins, and keymaps
 */

// Schema
//
// `schema` is the public re-export of the singleton ExtensionManager's
// schema instance. The underlying `singletonManager` is intentionally
// NOT re-exported here — extensions should reach their own manager via
// `ExtensionContext.manager` (see prosemirror/extensions/types.ts), not
// through a module-level global. Internal callers can still import the
// singleton via the relative `./schema` path inside the package.
export { schema } from './schema';
export type {
  ParagraphAttrs,
  ImageAttrs,
  TextColorAttrs,
  UnderlineAttrs,
  FontSizeAttrs,
  FontFamilyAttrs,
  HyperlinkAttrs,
} from './schema';

// Conversion
export {
  toProseDoc,
  createEmptyDoc,
  fromProseDoc,
  updateDocumentContent,
  headerFooterToProseDoc,
  footnoteToProseDoc,
} from './conversion';
export type { ToProseDocOptions } from './conversion';

// Styles
export { StyleResolver, createStyleResolver } from './styles';
export type { ResolvedParagraphStyle } from './styles';

// Selection state utilities
export { extractSelectionState } from './selectionState';
export type { SelectionState } from './selectionState';

// Re-export TextSelection for restoring selections after toolbar interactions
export { TextSelection } from 'prosemirror-state';

// Plugins (selection tracker only — keymaps are now in extension system)
export {
  createSelectionTrackerPlugin,
  extractSelectionContext,
  getSelectionContext,
  selectionTrackerKey,
} from './plugins';
export type { SelectionContext, SelectionChangeCallback } from './plugins';

// Commands
export {
  // Text formatting
  toggleBold,
  toggleItalic,
  toggleUnderline,
  toggleStrike,
  toggleSuperscript,
  toggleSubscript,
  setTextColor,
  clearTextColor,
  setHighlight,
  clearHighlight,
  setFontSize,
  clearFontSize,
  setFontFamily,
  clearFontFamily,
  clearFormatting,
  isMarkActive,
  getMarkAttr,
  // Hyperlink commands
  isHyperlinkActive,
  getHyperlinkAttrs,
  getSelectedText,
  setHyperlink,
  removeHyperlink,
  insertHyperlink,
  // Paragraph formatting
  setAlignment,
  alignLeft,
  alignCenter,
  alignRight,
  alignJustify,
  setLineSpacing,
  increaseIndent,
  decreaseIndent,
  setIndentLeft,
  setIndentRight,
  setIndentFirstLine,
  addTabStop,
  removeTabStop,
  toggleBulletList,
  toggleNumberedList,
  increaseListLevel,
  decreaseListLevel,
  removeList,
  getParagraphAlignment,
  getParagraphBidi,
  isInList,
  getListInfo,
  applyStyle,
  clearStyle,
  getStyleId,
  setRtl,
  setLtr,
  // Table operations
  isInTable,
  getTableContext,
  insertTable,
  addRowAbove,
  addRowBelow,
  deleteRow,
  addColumnLeft,
  addColumnRight,
  deleteColumn,
  deleteTable,
  selectTable,
  selectRow,
  selectColumn,
  mergeCells,
  splitCell,
  setTableBorders,
  removeTableBorders,
  setAllTableBorders,
  setOutsideTableBorders,
  setInsideTableBorders,
  setCellBorder,
  setCellVerticalAlign,
  setCellMargins,
  setCellTextDirection,
  toggleNoWrap,
  setRowHeight,
  toggleHeaderRow,
  distributeColumns,
  autoFitContents,
  setTableProperties,
  applyTableStyle,
  setCellFillColor,
  setTableBorderColor,
  setTableBorderWidth,
  // Page break
  insertPageBreak,
  // Table of Contents
  generateTOC,
} from './commands';
export type { TableContextInfo, BorderPreset } from './commands';

/** Word `w14:paraId` → ProseMirror position before matching paragraph. */
export { findStartPosForParaId } from './utils/findStartPosForParaId';
export { findParagraphByParaId } from './utils/findParagraphByParaId';
