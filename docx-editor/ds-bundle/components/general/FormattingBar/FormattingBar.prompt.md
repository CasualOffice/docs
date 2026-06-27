FormattingBar from @casualoffice/docs. Use via `window.CasualOfficeDocs.FormattingBar` (bundle loaded from the root `_ds_bundle.js`).

Icon-based formatting toolbar — undo/redo, zoom, styles, fonts,
bold/italic/underline, colors, alignment, lists, table/image context, clear formatting.

## Props

```ts
interface FormattingBarProps {
  /** Custom toolbar items to render at the end */
  children?: React.ReactNode;
  /** When true, renders with display:contents so children flow in parent flex container */
  inline?: boolean;
  /** Current formatting of the selection */
  currentFormatting?: SelectionFormatting;
  /** Callback when a formatting action is triggered */
  onFormat?: unknown;
  /** Callback for undo action */
  onUndo?: () => void;
  /** Callback for redo action */
  onRedo?: () => void;
  /** Whether undo is available */
  canUndo?: boolean;
  /** Whether redo is available */
  canRedo?: boolean;
  /** Callback to open Find dialog (Ctrl+F) */
  onOpenFind?: () => void;
  /** Callback to open Find & Replace dialog (Ctrl+H) */
  onOpenFindReplace?: () => void;
  /** Callback to open Word Count dialog (Ctrl+Shift+C in Google Docs). */
  onOpenWordCount?: () => void;
  /** Toggle voice typing (Web Speech API). Optional — hidden from the menu when the host doesn't pass it (e.g. unsupported br */
  onToggleVoiceTyping?: () => void;
  /** Whether voice typing is currently active — drives the menu entry's ✓ prefix. */
  voiceTypingActive?: boolean;
  /** Callback to toggle browser spellcheck on the editor */
  onToggleSpellCheck?: () => void;
  /** Whether spellcheck is currently enabled */
  spellCheckEnabled?: boolean;
  /** Whether the toolbar is disabled */
  disabled?: boolean;
  /** Additional CSS class name */
  className?: string;
  /** Additional inline styles */
  style?: React$1.CSSProperties;
  /** Whether to enable keyboard shortcuts (default: true) */
  enableShortcuts?: boolean;
  /** Ref to the editor container for keyboard events */
  editorRef?: React$1.RefObject<HTMLElement>;
  /** Whether to show font family picker (default: true) */
  showFontPicker?: boolean;
  /** Custom list of fonts in the toolbar dropdown. When omitted, the built-in 12-font default is used. Strings render in the  */
  fontFamilies?: readonly (string | F)[];
  /** Whether to show font size picker (default: true) */
  showFontSizePicker?: boolean;
  /** Whether to show text color picker (default: true) */
  showTextColorPicker?: boolean;
  /** Whether to show highlight color picker (default: true) */
  showHighlightColorPicker?: boolean;
  /** Whether to show alignment buttons (default: true) */
  showAlignmentButtons?: boolean;
  /** Whether to show list buttons (default: true) */
  showListButtons?: boolean;
  /** Whether to show line spacing picker (default: true) */
  showLineSpacingPicker?: boolean;
  /** Whether to show style picker (default: true) */
  showStylePicker?: boolean;
  /** Document styles for the style picker */
  documentStyles?: a3[];
  /** Theme for the style picker */
  theme?: af;
  /** Callback for print action */
  onPrint?: () => void;
  /** Whether to show print button (default: true) */
  showPrintButton?: boolean;
  /** Callback to open/import a DOCX file (File → Open) */
  onOpen?: () => void;
  /** Callback to save/download the current DOCX (File → Save) */
  onSave?: () => void;
  /** File → Make a copy — download the doc as "Copy of <name>.docx". */
  onMakeCopy?: () => void;
  /** Callback to start a fresh blank document (File → New) */
  onNew?: () => void;
  /** Whether to show zoom control (default: true) */
  showZoomControl?: boolean;
  /** Current zoom level (1.0 = 100%) */
  zoom?: number;
  /** Callback when zoom changes */
  onZoomChange?: (zoom: number) => void;
  /** Callback to refocus the editor after toolbar interactions */
  onRefocusEditor?: () => void;
  /** Callback when a table should be inserted */
  onInsertTable?: (rows: number, columns: number) => void;
  /** Whether to show table insert button (default: true) */
  showTableInsert?: boolean;
  /** Callback when user wants to insert an image */
  onInsertImage?: () => void;
  /** Callback when user wants to insert a page break */
  onInsertPageBreak?: () => void;
  /** Callback to insert a section break. `breakType` mirrors the OOXML `w:type` values: `nextPage` (default, starts new page) */
  onInsertSectionBreak?: (breakType: "nextPage" | "continuous" | "oddPage" | "evenPage") => void;
  /** Callback to insert an inline OOXML field node — PAGE / NUMPAGES / DATE / TIME / CREATEDATE / SAVEDATE / AUTHOR / FILENAM */
  onInsertField?: (fieldType: "PAGE" | "NUMPAGES" | "DATE" | "TIME" | "CREATEDATE" | "SAVEDATE" | "AUTHOR" | "FILENAME") => void;
  /** Callback when user wants to insert a table of contents */
  onInsertTOC?: () => void;
  /** Open the Bookmarks dialog (list of named anchors). */
  onOpenBookmarks?: () => void;
  /** Open the Character Spacing dialog (Word: Format > Font > Advanced). */
  onOpenCharacterSpacing?: () => void;
  /** Open the Paragraph dialog (Word: Format > Paragraph). */
  onOpenParagraphDialog?: () => void;
  /** Open the Borders and Shading dialog (Word: Format > Borders and Shading). */
  onOpenBordersShading?: () => void;
  /** Add a comment on the current selection (Docs: speech-bubble toolbar button). */
  onAddComment?: () => void;
  /** Toggle the paint-format (format painter) armed state. */
  onPaintFormat?: () => void;
  /** True while paint-format is armed (button shows pressed state). */
  paintFormatArmed?: boolean;
  /** Insert a horizontal-rule node at the cursor (Docs: Insert > Horizontal line). */
  onInsertHorizontalRule?: () => void;
  /** Open the Insert Special characters dialog (Docs: Insert > Special characters). */
  onOpenInsertSymbol?: () => void;
  /** Insert a footnote reference at the cursor (Docs: Insert > Footnote). */
  onInsertFootnote?: () => void;
  /** Toggle the document ruler visibility (Docs: View > Show ruler). */
  onToggleShowRuler?: () => void;
  /** Whether the ruler is currently visible (checkmark in View menu). */
  rulerVisible?: boolean;
  /** Open the Paste Special dialog (Docs: Edit > Paste special). */
  onOpenPasteSpecial?: () => void;
  /** Image context when an image is selected */
  imageContext?: { wrapType: string; displayMode: string; cssFloat: string | null; };
  /** Callback when image wrap type changes */
  onImageWrapType?: (wrapType: string) => void;
  /** Callback for image transform (rotate/flip) */
  onImageTransform?: (action: "rotateCW" | "rotateCCW" | "flipH" | "flipV") => void;
  /** Callback to open image properties dialog (alt text + border) */
  onOpenImageProperties?: () => void;
  /** Callback to open page setup dialog */
  onPageSetup?: () => void;
  /** Callback to open File → Properties dialog (`docProps/core.xml`) */
  onFileProperties?: () => void;
  /** Callback for Export as PDF — opens the print pipeline so the user can pick "Save as PDF" as the destination. */
  onExportPdf?: () => void;
  /** Callback for Export as .odt — routes the serialized DOCX bytes through the */
  onExportOdt?: () => void;
  /** Callback for Export as .md — routes the serialized DOCX bytes through the */
  onExportMd?: () => void;
  /** Callback for Export as .txt — routes the serialized DOCX bytes through the */
  onExportTxt?: () => void;
  /** Help → Report a bug — opens the GitHub issue template prefilled with env info. */
  onReportBug?: () => void;
  /** Help → About — opens the About dialog. */
  onShowAbout?: () => void;
  /** Help → Search the menus — opens the command palette. */
  onOpenCommandPalette?: () => void;
  /** Help → Keyboard shortcuts — opens the shortcuts dialog. */
  onOpenKeyboardShortcuts?: () => void;
  /** Tools → Preferences — opens the smart-quotes / autocorrect preferences dialog. */
  onOpenPreferences?: () => void;
  /** Insert → Watermark — opens the text-watermark dialog. */
  onOpenWatermark?: () => void;
  /** Tools → Accessibility — opens the accessibility-check dialog. */
  onOpenAccessibility?: () => void;
  /** Insert → Building blocks — opens the saved-snippets dialog (Quick Parts). */
  onOpenBuildingBlocks?: () => void;
  /** Insert → Convert selection to table — auto-detects delimiter (B8). */
  onConvertSelectionToTable?: () => void;
  /** Insert → Convert table to text — only available when the cursor is in a table (B8). */
  onConvertTableToText?: () => void;
  /** Tools → Dictionary — opens the lookup dialog seeded with the selection (A4). */
  onOpenDictionary?: () => void;
  /** Tools → Translate — opens the translate-selection dialog (A5). */
  onOpenTranslate?: () => void;
  /** Tools → Translate document — translate-and-download whole doc as .docx. */
  onTranslateDocument?: () => void;
  /** Tools → Spell check — toggles inline spell-check decorations. */
  onToggleSpellcheck?: () => void;
  /** Current spell-check enabled state — drives the menu checkmark. */
  spellcheckEnabled?: boolean;
  /** Tools → Writing Assistant — opens the on-device assistant sheet. */
  onOpenWritingAssistant?: () => void;
  /** Tools → Explore — opens the Wikipedia lookup dialog (A3). */
  onOpenExplore?: () => void;
  /** Tools → Citations — opens the local citations manager (A6 v0). */
  onOpenCitations?: () => void;
  /** Insert → Shape — inserts a default SVG of the chosen primitive (C2 v0). */
  onInsertShape?: (type: "rectangle" | "ellipse" | "line" | "arrow") => void;
  /** Insert → Text box / Callout — inserts an editable text box at the cursor. */
  onInsertTextBox?: (variant: "plain" | "callout") => void;
  /** File → "Email as attachment" — download + open mailto (F2). */
  onEmailAsAttachment?: () => void;
  /** View → Show formatting marks — toggles ¶ / → / ↵ overlay (F6). */
  onToggleShowFormattingMarks?: () => void;
  /** Current state of the formatting-marks toggle — drives the checkmark. */
  showFormattingMarks?: boolean;
  /** View → Show document outline — toggles the outline panel (Ctrl+Shift+H). */
  onToggleOutline?: () => void;
  /** Current state of the outline panel — drives the View-menu checkmark. */
  outlineVisible?: boolean;
  /** Theme picker — host sets colorTheme. `'auto'` follows OS preference. */
  onSetColorTheme?: (theme: "light" | "dark" | "auto") => void;
  /** Current colorTheme setting; drives the title-bar toggle's icon. */
  colorTheme?: "auto" | "light" | "dark";
  /** True when the document has unsaved edits — title bar shows a dot. */
  isDirty?: boolean;
  /** True while save is in flight — title bar shows "Saving…". */
  isSaving?: boolean;
  /** Table context when cursor is in a table */
  tableContext?: { isInTable: boolean; rowCount?: number; columnCount?: number; canSplitCell?: boolean; hasMultiCellSelection?: boolean; cellBorderColor?: C; cellBackgroundColor?: string; };
  /** Callback when a table action is triggered */
  onTableAction?: (action: T) => void;
}
```
