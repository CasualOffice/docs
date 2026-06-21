/**
 * @eigenpal/docx-js-editor
 *
 * A complete WYSIWYG DOCX editor with full Microsoft Word fidelity.
 *
 * Features:
 * - Full text and paragraph formatting
 * - Tables, images, shapes, text boxes
 * - Hyperlinks, bookmarks, fields
 * - Footnotes, lists, headers/footers
 * - Page layout with margins and columns
 * - DocumentAgent API for programmatic editing
 * - Template variable substitution
 * - AI-powered context menu
 *
 * CSS Styles:
 * For optimal cursor visibility and selection highlighting, import the editor styles:
 * ```
 * import '@eigenpal/docx-js-editor/styles/editor.css';
 * ```
 */

// ============================================================================
// VERSION
// ============================================================================

export const VERSION = '0.0.2';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export {
  DocxEditor,
  type DocxEditorProps,
  type DocxEditorRef,
  type EditorMode,
} from './components/DocxEditor';

// CasualEditor — composable SDK wrapper bundling DocxEditor +
// FileSource + optional collab + optional autosave for host apps
// (Drive, future sheet) that want the editor with minimum ceremony.
// Advanced consumers can still use the raw DocxEditor.
export {
  CasualEditor,
  type CasualEditorProps,
  type CasualEditorRef,
} from './components/CasualEditor';

// CasualEditorIframe — iframe-mounting variant of CasualEditor.
// Doc 16 in the parent repo. Use this for hosts that need CSS / React
// runtime isolation (most consumers; Drive in particular). The
// consumer copies the SDK's `dist/embed/*` into its public dir
// (default `/embed/docs`). v1.2 will rename this to CasualEditor and
// the existing direct-mount component → CasualEditorDirect.
export {
  CasualEditorIframe,
  type CasualEditorIframeProps,
  type CasualEditorIframeRef,
} from './components/CasualEditorIframe';

// Embed — iframe delivery surface. EmbedTransport bridges
// postMessage to React handlers; the envelope shapes mirror
// docs/internal/13-iframe-protocol.md.
export {
  EmbedTransport,
  isCasualEnvelope,
  type EmbedTransportHandlers,
  type EmbedTransportOptions,
  type CasualApp,
  type CasualEnvelope,
  type EditorHelloData,
  type HostHelloData,
  type LoadRequestData,
  type LoadResponseData,
  type LoadResponseDataOk,
  type LoadResponseDataErr,
  type SaveRequestData,
  type SaveResponseData,
  type SaveResponseDataOk,
  type SaveResponseDataErr,
  type SelectionChangedData,
  type TelemetryEventData,
  type LockLostData,
  type CommandSetReadOnlyData,
  type CommandSetThemeData,
  type CommandSetLocaleData,
  type SignatureRequestData,
  type SignatureRequestAckData,
  type SignatureFieldSignedData,
  type SignatureCompleteData,
  type SignatureCancelData,
} from './embed';

// Signing — document-signature pipeline. Types mirror the iframe
// envelopes (docs/internal/13-iframe-protocol.md) so SDK and
// iframe deliveries are interchangeable. Uniform across docs +
// sheet (anchor discriminator differs only).
export {
  SigningProvider,
  useSigning,
  SigningPane,
  DrawnSignaturePad,
  TypedSignatureField,
  UploadedSignatureField,
  createSigningController,
  type SigningProviderProps,
  type SigningPaneProps,
  type CapturedSignature,
  type DrawnSignaturePadProps,
  type TypedSignatureFieldProps,
  type UploadedSignatureFieldProps,
  type SigningController,
  type SigningSnapshot,
  type CancelReason,
  type DocAnchor,
  type SheetAnchor,
  type SignatureAnchor,
  type SignatureCompletePayload,
  type SignatureField,
  type SignatureMethod,
  type SignatureMode,
  type SignedFieldPayload,
  type SigningSessionConfig,
} from './signing';
export { renderAsync, type RenderAsyncOptions, type DocxEditorHandle } from './renderAsync';
export { type DocxInput, toArrayBuffer } from '@eigenpal/docx-core/utils';
export { AgentPanel, type AgentPanelProps } from './components/AgentPanel';
// Collab presence cluster (avatars + room status + Share) for the title bar's
// `renderTitleBarRight` slot. Built from the shared design-system UI-kit.
export {
  PresenceCluster,
  type PresenceClusterProps,
  type PresencePeer,
} from './components/PresenceCluster';

// Collab — Yjs/y-websocket wiring exposed so SDK consumers (host
// apps embedding the editor) can opt into co-edit by passing the
// returned plugins into DocxEditor's `externalPlugins`. `yjs`,
// `y-websocket`, `y-prosemirror` are optional peerDependencies —
// non-collab deploys don't pay the bundle cost.
export {
  useCollab,
  type CollabPeer,
  type CollabState,
  type CollabStatus,
  type UseCollabOptions,
} from './collab/useCollab';

// Recent files (host-facing — call `recordRecentFile` on doc open,
// surface `listRecentFiles` on a "Home" / "Open" screen).
export {
  recordRecentFile,
  listRecentFiles,
  deleteRecentFile,
  formatSize,
  type RecentFile,
} from './utils/recent-files';

// File source — pluggable storage abstraction (Browser / WOPI /
// Personal). See docs/internal/11-storage-modes.md. Host apps call
// `chooseFileSource()` at boot and wrap the editor tree in
// `<FileSourceProvider>`; everything inside reads via `useFileSource()`.
export {
  BrowserFileSource,
  PersonalFileSource,
  PersonalFileSourceError,
  WopiFileSource,
  WopiNotSupportedError,
  AuthClient,
  PersonalAuthGate,
  PersonalAuthGateModal,
  UserMenu,
  ProfileSettingsDialog,
  usePersonalAuth,
  useAuthContext,
  useFileSourceAutoSave,
  AutosaveStatus,
  chooseFileSource,
  extractWopiContext,
  FileSourceProvider,
  useFileSource,
  type FileSource,
  type FileEntry,
  type FileSourceKind,
  type ChooseFileSourceOptions,
  type WopiContext,
  type FileSourceProviderProps,
  type PersonalFileSourceOptions,
  type WopiFileSourceOptions,
  type AuthClientOptions,
  type AuthCredentials,
  type PersonalAuthGateProps,
  type UsePersonalAuthOptions,
  type UsePersonalAuthReturn,
  type AuthState,
  type AuthContextValue,
  type UserMenuProps,
  type ProfileSettingsDialogProps,
  type UseFileSourceAutoSaveOptions,
  type UseFileSourceAutoSaveReturn,
  type AutoSaveEditorRef,
  type FileSourceAutoSaveStatus,
  type AutosaveStatusProps,
  type UserWire,
  type FileSummaryWire,
  type ErrorWire,
  type ProfileWire,
  type ProfilePatchWire,
} from './file-source';

// Spell-check asset config — host must call this with URLs for the
// Hunspell .aff / .dic files before the Tools → Spell check toggle
// runs (lazy-loaded). The dictionary asset files aren't bundled into
// this lib so the consumer's bundler (Vite, webpack, etc.) handles
// asset hashing.
export { setSpellAssetUrls } from './lib/spellcheck/service';

// Writing-assistant worker URL — same pattern as `setSpellAssetUrls`:
// the consumer's bundler produces the worker asset URL and hands it
// to the library, which can't bake the path in (tsup can't resolve
// `new URL('./writer.worker.ts', import.meta.url)`).
export { setWriterWorkerUrl } from './lib/writer/controller';
// AgentChat exports removed: the source file (./components/AgentChat) imported
// from the AGPL @eigenpal/docx-editor-agents package and was dropped in this
// fork's AGPL purge. See docs/agpl-removal.md.

// ============================================================================
// AGENT API
// ============================================================================

export { DocumentAgent } from '@eigenpal/docx-core/agent';
export { executeCommand, executeCommands } from '@eigenpal/docx-core/agent';
export {
  getAgentContext,
  getDocumentSummary,
  type AgentContextOptions,
} from '@eigenpal/docx-core/agent';
export {
  buildSelectionContext,
  buildExtendedSelectionContext,
  type SelectionContextOptions,
  type ExtendedSelectionContext,
} from '@eigenpal/docx-core/agent';

// ============================================================================
// PARSER / SERIALIZER
// ============================================================================

export { parseDocx } from '@eigenpal/docx-core/docx';
export {
  serializeDocument as serializeDocx,
  serializeDocumentBody,
  serializeSectionProperties,
} from '@eigenpal/docx-core/docx/serializer';
export {
  processTemplate,
  processTemplateDetailed,
  processTemplateAsBlob,
  getTemplateTags,
  validateTemplate,
  type ProcessTemplateOptions,
  type ProcessTemplateResult,
} from '@eigenpal/docx-core/utils';

// ============================================================================
// DOCUMENT CREATION
// ============================================================================

export {
  createEmptyDocument,
  createDocumentWithText,
  type CreateEmptyDocumentOptions,
} from '@eigenpal/docx-core/utils';

// ============================================================================
// FONT LOADER
// ============================================================================

export {
  loadFont,
  loadFonts,
  loadFontFromBuffer,
  isFontLoaded,
  isLoading as isFontsLoading,
  getLoadedFonts,
  onFontsLoaded,
  canRenderFont,
  preloadCommonFonts,
} from '@eigenpal/docx-core/utils';

// ============================================================================
// UI COMPONENTS
// ============================================================================

export {
  Toolbar,
  type ToolbarProps,
  ToolbarButton,
  ToolbarGroup,
  ToolbarSeparator,
} from './components/Toolbar';
export {
  EditorToolbar,
  type EditorToolbarProps,
  type TitleBarProps,
  type LogoProps,
  type DocumentNameProps,
  type TitleBarRightProps,
  type FormattingBarProps,
} from './components/EditorToolbar';
export { FormattingBar } from './components/FormattingBar';
export {
  ContextMenu,
  type ContextMenuProps,
  useContextMenu,
  getActionShortcut,
  isActionAvailable,
  getDefaultActions,
  getAllActions,
} from './components/ContextMenu';
export {
  ResponsePreview,
  type ResponsePreviewProps,
  useResponsePreview,
  type ResponsePreviewState,
  createMockResponse,
  createErrorResponse,
} from './components/ResponsePreview';
export {
  TextContextMenu,
  type TextContextMenuProps,
  type TextContextAction,
  type TextContextMenuItem,
  type UseTextContextMenuOptions,
  type UseTextContextMenuReturn,
  useTextContextMenu,
  getTextActionLabel,
  getTextActionShortcut,
  getDefaultTextContextMenuItems,
  isTextActionAvailable,
} from './components/TextContextMenu';

// ============================================================================
// ERROR HANDLING
// ============================================================================

export {
  ErrorBoundary,
  type ErrorBoundaryProps,
  ErrorProvider,
  useErrorNotifications,
  type ErrorContextValue,
  type ErrorNotification,
  type ErrorSeverity,
  ParseErrorDisplay,
  type ParseErrorDisplayProps,
  UnsupportedFeatureWarning,
  type UnsupportedFeatureWarningProps,
  isParseError,
  getUserFriendlyMessage,
} from './components/ErrorBoundary';

// ============================================================================
// UI CONTROLS
// ============================================================================

export { ZoomControl, type ZoomControlProps } from './components/ui/ZoomControl';
export { FontPicker, type FontPickerProps, type FontOption } from './components/ui/FontPicker';
export { FontSizePicker, type FontSizePickerProps } from './components/ui/FontSizePicker';
export {
  LineSpacingPicker,
  type LineSpacingPickerProps,
  type LineSpacingOption,
} from './components/ui/LineSpacingPicker';
export {
  ColorPicker,
  type ColorPickerProps,
  type ColorPickerMode,
} from './components/ui/ColorPicker';
export { StylePicker, type StylePickerProps, type StyleOption } from './components/ui/StylePicker';
export { AlignmentButtons, type AlignmentButtonsProps } from './components/ui/AlignmentButtons';
export {
  ListButtons,
  type ListButtonsProps,
  type ListState,
  createDefaultListState,
} from './components/ui/ListButtons';
export {
  TableToolbar,
  type TableToolbarProps,
  type TableContext,
  type TableSelection,
  type TableAction,
  type TableSplitConfig,
  createTableContext,
  addRow,
  deleteRow,
  addColumn,
  deleteColumn,
  mergeCells,
  getTableSplitCellDialogConfig,
  splitTableCell,
  splitCell,
  getColumnCount,
  getCellAt,
} from './components/ui/TableToolbar';
export {
  HorizontalRuler,
  type HorizontalRulerProps,
  getRulerDimensions,
  getMarginInUnits,
  parseMarginFromUnits,
  positionToMargin,
} from './components/ui/HorizontalRuler';
export {
  PrintButton,
  type PrintButtonProps,
  PrintStyles,
  type PrintOptions,
  triggerPrint,
  openPrintWindow,
  getDefaultPrintOptions,
  parsePageRange,
  formatPageRange as formatPrintPageRange,
  isPrintSupported,
} from './components/ui/PrintPreview';
export { TableBorderPicker, type TableBorderPickerProps } from './components/ui/TableBorderPicker';
export {
  TableBorderColorPicker,
  type TableBorderColorPickerProps,
} from './components/ui/TableBorderColorPicker';
export {
  TableBorderWidthPicker,
  type TableBorderWidthPickerProps,
} from './components/ui/TableBorderWidthPicker';
export {
  TableCellFillPicker,
  type TableCellFillPickerProps,
} from './components/ui/TableCellFillPicker';
export { TableMergeButton, type TableMergeButtonProps } from './components/ui/TableMergeButton';
export {
  TableInsertButtons,
  type TableInsertButtonsProps,
} from './components/ui/TableInsertButtons';
export { TableMoreDropdown, type TableMoreDropdownProps } from './components/ui/TableMoreDropdown';
export {
  UnsavedIndicator,
  type UnsavedIndicatorProps,
  type IndicatorVariant,
  type IndicatorPosition,
  type UseUnsavedChangesOptions,
  type UseUnsavedChangesReturn,
  useUnsavedChanges,
  getVariantLabel,
  getAllVariants as getAllIndicatorVariants,
  getAllPositions as getAllIndicatorPositions,
  createChangeTracker,
} from './components/ui/UnsavedIndicator';
export {
  LoadingIndicator,
  type LoadingIndicatorProps,
  type LoadingVariant,
  type LoadingSize,
  type UseLoadingOptions,
  type UseLoadingReturn,
  type LoadingOperation,
  useLoading,
  useLoadingOperations,
  getLoadingVariantLabel,
  getAllLoadingVariants,
  getAllLoadingSizes,
  delay,
} from './components/ui/LoadingIndicator';
export {
  ResponsiveToolbar,
  type ResponsiveToolbarProps,
  type ToolbarItem,
  type ToolbarItemPriority,
  type UseResponsiveToolbarOptions,
  type UseResponsiveToolbarReturn,
  ToolbarGroup as ResponsiveToolbarGroup,
  type ToolbarGroupProps as ResponsiveToolbarGroupProps,
  useResponsiveToolbar,
  createToolbarItem,
  createToolbarItems,
  getRecommendedPriority,
} from './components/ui/ResponsiveToolbar';

// ============================================================================
// DIALOGS
// ============================================================================

export {
  FindReplaceDialog,
  type FindReplaceDialogProps,
  type FindReplaceOptions,
  type FindOptions,
  type FindMatch,
  type FindResult,
  type FindReplaceState,
  type UseFindReplaceReturn,
  useFindReplace,
  findInDocument,
  findInParagraph,
  findAllMatches,
  scrollToMatch,
  createDefaultFindOptions,
  createSearchPattern,
  replaceAllInContent,
  replaceFirstInContent,
  getMatchCountText,
  isEmptySearch,
  escapeRegexString,
  getDefaultHighlightOptions,
  type HighlightOptions,
} from './components/dialogs/FindReplaceDialog';
export {
  HyperlinkDialog,
  type HyperlinkDialogProps,
  type HyperlinkData,
  useHyperlinkDialog,
} from './components/dialogs/HyperlinkDialog';
export {
  InsertTableDialog,
  type InsertTableDialogProps,
  type TableConfig,
  useInsertTableDialog,
  createDefaultTableConfig,
  isValidTableConfig,
  clampTableConfig,
  formatTableDimensions,
  getTablePresets,
} from './components/dialogs/InsertTableDialog';
export {
  InsertImageDialog,
  type InsertImageDialogProps,
  type ImageData,
  useInsertImageDialog,
  isValidImageFile,
  getSupportedImageExtensions,
  getImageAcceptString,
  calculateFitDimensions,
  dataUrlToBlob,
  getImageDimensions,
  formatFileSize,
} from './components/dialogs/InsertImageDialog';
export {
  InsertSymbolDialog,
  type InsertSymbolDialogProps,
  type SymbolCategory,
  useInsertSymbolDialog,
  getSymbolCategories,
  getSymbolsByCategory,
  getSymbolInfo as getSymbolUnicodeInfo,
  searchSymbols,
  symbolFromCodePoint,
  SYMBOL_CATEGORIES,
} from './components/dialogs/InsertSymbolDialog';
export {
  PasteSpecialDialog,
  type PasteSpecialDialogProps,
  type PasteOption,
  type UsePasteSpecialReturn,
  type UsePasteSpecialOptions,
  usePasteSpecial,
  getPasteOption,
  getAllPasteOptions,
  getDefaultPasteOption,
  isPasteSpecialShortcut,
} from './components/dialogs/PasteSpecialDialog';
export {
  KeyboardShortcutsDialog,
  type KeyboardShortcutsDialogProps,
  type KeyboardShortcut as DialogKeyboardShortcut,
  type ShortcutCategory,
  type UseKeyboardShortcutsDialogOptions,
  type UseKeyboardShortcutsDialogReturn,
  useKeyboardShortcutsDialog,
  getDefaultShortcuts,
  getShortcutsByCategory,
  getCommonShortcuts,
  getCategoryLabel,
  getAllCategories,
  formatShortcutKeys,
} from './components/dialogs/KeyboardShortcutsDialog';

// ============================================================================
// I18N
// ============================================================================

export {
  LocaleProvider,
  useTranslation,
  type LocaleProviderProps,
  type LocaleStrings,
  type Translations,
  type PartialLocaleStrings,
  type TranslationKey,
} from './i18n';

// ============================================================================
// TYPES
// ============================================================================

// Document types
export type {
  Document,
  DocxPackage,
  DocumentBody,
  BlockContent,
  Paragraph,
  Run,
  RunContent,
  TextContent,
  Table,
  TableRow,
  TableCell,
  Image,
  Shape,
  TextBox,
  Hyperlink,
  BookmarkStart,
  BookmarkEnd,
  Field,
  Theme,
  ThemeColorScheme,
  ThemeFont,
  ThemeFontScheme,
  Style,
  StyleDefinitions,
  TextFormatting,
  ParagraphFormatting,
  SectionProperties,
  HeaderFooter,
  HeaderReference,
  FooterReference,
  Footnote,
  Endnote,
  ListLevel,
  NumberingDefinitions,
  Relationship,
  Comment,
} from '@eigenpal/docx-core/types/document';

// Agent API types
export type {
  AIAction,
  AIActionRequest,
  AgentResponse,
  AgentContext,
  SelectionContext,
  Range,
  Position,
  ParagraphContext,
  SuggestedAction,
  AgentCommand,
  InsertTextCommand,
  ReplaceTextCommand,
  DeleteTextCommand,
  FormatTextCommand,
  InsertTableCommand,
  InsertImageCommand,
  InsertHyperlinkCommand,
  SetVariableCommand,
  ApplyStyleCommand,
} from '@eigenpal/docx-core/types/agentApi';

// ============================================================================
// HOOKS
// ============================================================================

export {
  useTableSelection,
  TABLE_DATA_ATTRIBUTES,
  type TableSelectionState,
  type UseTableSelectionReturn,
  type UseTableSelectionOptions,
} from './hooks/useTableSelection';

export {
  useAutoSave,
  formatLastSaveTime,
  getAutoSaveStatusLabel,
  getAutoSaveStorageSize,
  formatStorageSize,
  isAutoSaveSupported,
  type AutoSaveStatus,
  type UseAutoSaveOptions,
  type UseAutoSaveReturn,
  type SavedDocumentData,
} from './hooks/useAutoSave';

export {
  useWheelZoom,
  getZoomPresets,
  findNearestZoomPreset,
  getNextZoomPreset,
  getPreviousZoomPreset,
  formatZoom,
  parseZoom,
  isZoomPreset,
  clampZoom,
  ZOOM_PRESETS,
  type UseWheelZoomOptions,
  type UseWheelZoomReturn,
} from './hooks/useWheelZoom';

// ============================================================================
// UTILITIES
// ============================================================================

export {
  twipsToPixels,
  pixelsToTwips,
  formatPx,
  emuToPixels,
  pointsToPixels,
  halfPointsToPixels,
  pixelsToEmu,
  emuToTwips,
  twipsToEmu,
} from '@eigenpal/docx-core/utils';
export {
  resolveColor,
  resolveHighlightColor,
  resolveShadingColor,
  parseColorString,
  createThemeColor,
  createRgbColor,
  darkenColor,
  lightenColor,
  blendColors,
  getContrastingColor,
  isBlack,
  isWhite,
  colorsEqual,
} from '@eigenpal/docx-core/utils';
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
  type InsertPosition,
} from '@eigenpal/docx-core/utils';

// Selection highlighting
export {
  useSelectionHighlight,
  generateOverlayElements,
  type UseSelectionHighlightOptions,
  type UseSelectionHighlightReturn,
  type SelectionOverlayProps,
} from './hooks/useSelectionHighlight';

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
  type HighlightRect,
  type SelectionHighlightConfig,
  type SelectionRange,
} from '@eigenpal/docx-core/utils';

// Text selection utilities for word/paragraph selection
export {
  isWordCharacter,
  isWhitespace,
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
  type WordSelectionResult,
} from '@eigenpal/docx-core/utils';

// Keyboard navigation
export {
  // Types
  type NavigationDirection,
  type NavigationUnit,
  type NavigationAction,
  type KeyboardShortcut,
  // Word boundary detection
  isWordCharacter as isWordChar,
  isWhitespace as isWhitespaceChar,
  isPunctuation,
  findWordStart,
  findWordEnd,
  findNextWordStart,
  findPreviousWordStart,
  // Line boundary detection
  findVisualLineStart,
  findVisualLineEnd,
  // DOM selection utilities
  getSelectionInfo,
  setSelectionPosition,
  extendSelectionTo,
  moveByWord,
  moveToLineEdge,
  // Keyboard event handling
  parseNavigationAction,
  handleNavigationKey,
  isNavigationKey,
  // Selection word expansion
  expandSelectionToWord,
  getWordAtCursor,
  // Keyboard shortcut utilities
  matchesShortcut,
  NAVIGATION_SHORTCUTS,
  describeShortcut,
  getNavigationShortcutDescriptions,
} from '@eigenpal/docx-core/utils';

// Clipboard utilities
export {
  useClipboard,
  createSelectionFromDOM,
  getSelectionRuns,
  type ClipboardSelection,
  type UseClipboardOptions,
  type UseClipboardReturn,
} from './hooks/useClipboard';

export {
  copyRuns,
  copyParagraphs,
  readFromClipboard,
  handlePasteEvent,
  htmlToRuns,
  cleanWordHtml,
  isWordHtml,
  isEditorHtml,
  createClipboardHandlers,
  runsToClipboardContent,
  paragraphsToClipboardContent,
  writeToClipboard,
  parseClipboardHtml,
  INTERNAL_CLIPBOARD_TYPE,
  CLIPBOARD_TYPES,
  type ClipboardContent,
  type ParsedClipboardContent,
  type ClipboardOptions,
} from '@eigenpal/docx-core/utils';

// ============================================================================
// PLUGIN API
// ============================================================================

export {
  PluginHost,
  PLUGIN_HOST_STYLES,
  type EditorPlugin,
  type PluginPanelProps,
  type PanelConfig,
  type PluginContext,
  type PluginHostProps,
  type PluginHostRef,
  type RenderedDomContext,
  type PositionCoordinates,
  type ReactSidebarItem,
  type SidebarItemRenderProps,
  type SidebarItemContext,
  type SidebarItem,
} from './plugin-api';

// ============================================================================
// PLUGINS
// ============================================================================

// Template Plugin (Editor UI)
export {
  templatePlugin,
  createPlugin as createTemplatePlugin,
  createTemplatePlugin as createTemplateProseMirrorPlugin,
  templatePluginKey,
  getTemplateTags as getTemplatePluginTags,
  setHoveredElement,
  setSelectedElement,
  TEMPLATE_DECORATION_STYLES,
  type TemplateTag,
  type TagType,
} from './plugins/template';

// ============================================================================
// CORE PLUGIN SYSTEM
// ============================================================================

export {
  pluginRegistry,
  PluginRegistry,
  registerPlugins,
  docxtemplaterPlugin,
  type CorePlugin,
  type McpToolDefinition,
  type McpToolHandler,
  type McpToolResult,
  type McpSession,
} from '@eigenpal/docx-core/core-plugins';

// ============================================================================
// FOCUS TRAP — opt-in primitive for dialog focus management
// ============================================================================
//
// Wraps a modal subtree so Tab / Shift+Tab cycle inside it and focus
// restores to the previously-active element on unmount. See
// docs/internal/08-improvement-tracker.md § F3.

export { FocusTrap, type FocusTrapProps } from './components/ui/FocusTrap';

// ============================================================================
// VERSION HISTORY — opt-in side panel + ProseMirror transaction feed
// ============================================================================
//
// Captures every committed transaction into a coalesced, human-readable
// timeline with revert-to support. Mirrors Casual Sheets' HistoryPanel.
// See docs/internal/08-improvement-tracker.md § F1.

export {
  VersionHistoryPanel,
  type VersionHistoryPanelProps,
} from './components/sidebar/VersionHistoryPanel';
export {
  fetchServerVersions,
  downloadServerVersion,
  type ServerVersionBackend,
} from './version-history/server-source';
export {
  useEditHistory,
  type EditHistoryEntry,
  type UseEditHistoryOptions,
  type UseEditHistoryReturn,
} from './hooks/useEditHistory';
