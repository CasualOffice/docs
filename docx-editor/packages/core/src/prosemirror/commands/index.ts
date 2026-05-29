/**
 * ProseMirror Commands
 *
 * Commands for formatting text and paragraphs.
 */

// Text formatting
export {
  toggleBold,
  toggleItalic,
  toggleUnderline,
  toggleStrike,
  toggleSuperscript,
  toggleSubscript,
  toggleSmallCaps,
  toggleAllCaps,
  toggleHidden,
  toggleEmboss,
  toggleImprint,
  toggleTextShadow,
  toggleTextOutline,
  setCharacterSpacing,
  setCharacterAttrs,
  type CharacterAttrs,
  setTextColor,
  clearTextColor,
  setHighlight,
  clearHighlight,
  setFontSize,
  clearFontSize,
  setFontFamily,
  clearFontFamily,
  setUnderlineStyle,
  clearFormatting,
  isMarkActive,
  getMarkAttr,
  createSetMarkCommand,
  createRemoveMarkCommand,
  // Hyperlink commands
  isHyperlinkActive,
  getHyperlinkAttrs,
  getSelectedText,
  setHyperlink,
  removeHyperlink,
  insertHyperlink,
} from './formatting';

// Paragraph formatting
export {
  setParagraphAttrs,
  setAlignment,
  alignLeft,
  alignCenter,
  alignRight,
  alignJustify,
  setLineSpacing,
  singleSpacing,
  oneAndHalfSpacing,
  doubleSpacing,
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
  setSpaceBefore,
  setSpaceAfter,
  getParagraphAlignment,
  getParagraphBidi,
  isInList,
  getListInfo,
  applyStyle,
  clearStyle,
  getStyleId,
  setRtl,
  setLtr,
  insertSectionBreak,
  insertFootnote,
  insertEndnote,
  insertHorizontalRule,
  removeSectionBreak,
} from './paragraph';
export type { ResolvedStyleAttrs } from './paragraph';

// Table operations
export {
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
  distributeRows,
  autoFitContents,
  autoFitWindow,
  sortTable,
  setTableProperties,
  applyTableStyle,
  setCellFillColor,
  setTableBorderColor,
  setTableBorderWidth,
} from './table';
export type { TableContextInfo, BorderPreset } from './table';

// Page break
export { insertPageBreak } from './pageBreak';
export { insertField } from './field';
export type { InsertableFieldType } from './field';
export { restartListNumbering, continueListNumbering } from './listNumbering';

// Image commands
export { setImageWrapType } from './image';
export type { AnchorWrapType, ImageLayoutTarget, SetImageWrapTypeOptions } from './image';

// Table of Contents
export { generateTOC } from './paragraph';

// Comments and Track Changes
export {
  addCommentMark,
  removeCommentMark,
  acceptChange,
  rejectChange,
  acceptAllChanges,
  rejectAllChanges,
  findNextChange,
  findPreviousChange,
} from './comments';

// Table split
export { getSplitCellDialogConfig, splitActiveTableCell } from './tableSplit';
export type { SplitCellDialogConfig } from './tableSplit';
