/**
 * DocxEditor Component
 *
 * Main component integrating all editor features:
 * - Toolbar for formatting
 * - ProseMirror-based editor for content editing
 * - Zoom control
 * - Error boundary
 * - Loading states
 */

import {
  useRef,
  useCallback,
  useState,
  useEffect,
  useMemo,
  forwardRef,
  useImperativeHandle,
  lazy,
  Suspense,
} from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type {
  Document,
  Theme,
  HeaderFooter,
  HeaderReference,
  FooterReference,
  SectionProperties,
} from '@eigenpal/docx-core/types/document';
import defaultLocale from '../../i18n/en.json';

import {
  ToolbarButton,
  ToolbarSeparator,
  type SelectionFormatting,
  type FormattingAction,
} from './Toolbar';
import type { FontOption } from './ui/FontPicker';
import { EditorToolbar } from './EditorToolbar';
import { StatusBar } from './StatusBar';
import { pointsToHalfPoints } from './ui/FontSizePicker';
import {
  DocumentOutline,
  OUTLINE_BUTTON_RESERVED_SPACE,
  OUTLINE_RESERVED_SPACE,
} from './DocumentOutline';
import { SIDEBAR_DOCUMENT_SHIFT } from './sidebar/constants';
import { VersionHistoryPanel } from './sidebar/VersionHistoryPanel';
import { useEditHistory } from '../hooks/useEditHistory';
import { useVoiceTyping } from '../hooks/useVoiceTyping';
import { VoiceTypingIndicator } from './ui/VoiceTypingIndicator';
import { UnifiedSidebar } from './UnifiedSidebar';
import { AgentPanel } from './AgentPanel';
import { PanelRail } from './PanelRail';
import { AutosaveRestoreBanner } from './AutosaveRestoreBanner';
import { writeAutosave } from '../utils/autosave';
import { recordRecentFile } from '../utils/recent-files';
import { CommentMarginMarkers } from './CommentMarginMarkers';
import { useCommentSidebarItems, type CommentCallbacks } from '../hooks/useCommentSidebarItems';
import { useTrackedChanges } from '../hooks/useTrackedChanges';
import type { EditorState as PMEditorState } from 'prosemirror-state';
import type { Mark as PMMark } from 'prosemirror-model';
import { undo as pmUndo, redo as pmRedo } from 'prosemirror-history';
import type { ReactSidebarItem } from '../plugin-api/types';
import type { HeadingInfo } from '@eigenpal/docx-core/utils';
import { checkAccessibility, type AccessibilityIssue } from '@eigenpal/docx-core/utils';
import type { Comment, BlockContent, ParagraphContent } from '@eigenpal/docx-core/types/content';
import { ErrorBoundary, ErrorProvider } from './ErrorBoundary';
import type { TableAction } from './ui/TableToolbar';
import { mapHexToHighlightName } from './toolbarUtils';
import { LocaleProvider, useTranslation } from '../i18n';
import type { Translations, TranslationKey } from '../i18n';
import { HorizontalRuler } from './ui/HorizontalRuler';
import { VerticalRuler } from './ui/VerticalRuler';
import { Z_INDEX } from '../styles/zIndex';
import { type PrintOptions } from './ui/PrintPreview';
// Dialog hooks + utilities — pulled from their own modules so a
// consumer that needs the runtime helpers doesn't drag a lazy()-
// loaded dialog component's chunk back into the main bundle. That
// double-import (eager + lazy on the same file) was the root cause
// of the production-only "TypeError: n is not a function" at boot
// — Vite couldn't form a stable chunk graph and the minified output
// reached for a value that had become undefined.
import { useFindReplace } from './dialogs/useFindReplace';
import {
  findInDocument,
  scrollToMatch,
  type FindMatch,
  type FindOptions,
  type FindResult,
} from './dialogs/findReplaceUtils';
import { useHyperlinkDialog, type HyperlinkData } from './dialogs/useHyperlinkDialog';
import type { ImagePositionData } from './dialogs/ImagePositionDialog';
import type { BordersAndShadingValue } from './dialogs/BordersAndShadingDialog';
import type { ImagePropertiesData } from './dialogs/ImagePropertiesDialog';
import {
  InlineHeaderFooterEditor,
  type InlineHeaderFooterEditorRef,
} from './InlineHeaderFooterEditor';

// Dialog components (lazy-loaded — only fetched when first opened)
const trackedChangesActionBtnStyle: CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  padding: '4px 6px',
  borderRadius: 4,
  color: 'var(--doc-text-on-surface)',
  display: 'inline-flex',
  alignItems: 'center',
};

const FindReplaceDialog = lazy(() => import('./dialogs/FindReplaceDialog'));
const HyperlinkDialog = lazy(() => import('./dialogs/HyperlinkDialog'));
const TablePropertiesDialog = lazy(() =>
  import('./dialogs/TablePropertiesDialog').then((m) => ({ default: m.TablePropertiesDialog }))
);
const SplitCellDialog = lazy(() => import('./dialogs/SplitCellDialog'));
const ImagePositionDialog = lazy(() =>
  import('./dialogs/ImagePositionDialog').then((m) => ({ default: m.ImagePositionDialog }))
);
const ImagePropertiesDialog = lazy(() =>
  import('./dialogs/ImagePropertiesDialog').then((m) => ({ default: m.ImagePropertiesDialog }))
);
const FootnotePropertiesDialog = lazy(() =>
  import('./dialogs/FootnotePropertiesDialog').then((m) => ({
    default: m.FootnotePropertiesDialog,
  }))
);
const PageSetupDialog = lazy(() =>
  import('./dialogs/PageSetupDialog').then((m) => ({ default: m.PageSetupDialog }))
);
const FilePropertiesDialog = lazy(() =>
  import('./dialogs/FilePropertiesDialog').then((m) => ({ default: m.FilePropertiesDialog }))
);
const WordCountDialog = lazy(() =>
  import('./dialogs/WordCountDialog').then((m) => ({ default: m.WordCountDialog }))
);
const BookmarksDialog = lazy(() =>
  import('./dialogs/BookmarksDialog').then((m) => ({ default: m.BookmarksDialog }))
);
const CharacterSpacingDialog = lazy(() =>
  import('./dialogs/CharacterSpacingDialog').then((m) => ({ default: m.CharacterSpacingDialog }))
);
const CustomSpacingDialog = lazy(() =>
  import('./dialogs/CustomSpacingDialog').then((m) => ({ default: m.CustomSpacingDialog }))
);
const BordersAndShadingDialog = lazy(() =>
  import('./dialogs/BordersAndShadingDialog').then((m) => ({
    default: m.BordersAndShadingDialog,
  }))
);
const InsertSymbolDialog = lazy(() =>
  import('./dialogs/InsertSymbolDialog').then((m) => ({ default: m.InsertSymbolDialog }))
);
const AboutDialog = lazy(() =>
  import('./dialogs/AboutDialog').then((m) => ({ default: m.AboutDialog }))
);
const CommandPaletteDialog = lazy(() =>
  import('./dialogs/CommandPaletteDialog').then((m) => ({ default: m.CommandPaletteDialog }))
);
const KeyboardShortcutsDialog = lazy(() =>
  import('./dialogs/KeyboardShortcutsDialog').then((m) => ({ default: m.KeyboardShortcutsDialog }))
);
const PreferencesDialog = lazy(() =>
  import('./dialogs/PreferencesDialog').then((m) => ({ default: m.PreferencesDialog }))
);
const WatermarkDialog = lazy(() =>
  import('./dialogs/WatermarkDialog').then((m) => ({ default: m.WatermarkDialog }))
);
const AccessibilityDialog = lazy(() =>
  import('./dialogs/AccessibilityDialog').then((m) => ({ default: m.AccessibilityDialog }))
);
const BuildingBlocksDialog = lazy(() =>
  import('./dialogs/BuildingBlocksDialog').then((m) => ({ default: m.BuildingBlocksDialog }))
);
const DictionaryDialog = lazy(() =>
  import('./dialogs/DictionaryDialog').then((m) => ({ default: m.DictionaryDialog }))
);
const TranslateDialog = lazy(() =>
  import('./dialogs/TranslateDialog').then((m) => ({ default: m.TranslateDialog }))
);
const TranslateDocumentDialog = lazy(() =>
  import('./dialogs/TranslateDocumentDialog').then((m) => ({
    default: m.TranslateDocumentDialog,
  }))
);
const WritingAssistantSheet = lazy(() =>
  import('./dialogs/WritingAssistantSheet').then((m) => ({
    default: m.WritingAssistantSheet,
  }))
);
const ExploreDialog = lazy(() =>
  import('./dialogs/ExploreDialog').then((m) => ({ default: m.ExploreDialog }))
);
const CitationsDialog = lazy(() =>
  import('./dialogs/CitationsDialog').then((m) => ({ default: m.CitationsDialog }))
);
import { MaterialSymbol } from './ui/Icons';
import { Tooltip } from './ui/Tooltip';
import {
  TextContextMenu,
  type TextContextAction,
  type TextContextMenuItem,
} from './TextContextMenu';
import { ImageContextMenu, useImageContextMenu } from './ImageContextMenu';
import { setImageWrapType, type ImageLayoutTarget } from '@eigenpal/docx-core/prosemirror/commands';
import {
  editorPreferences,
  setEditorPreference,
  type EditorPreferences,
  setSpellChecker,
  refreshSpellcheckDecorations,
} from '@eigenpal/docx-core/prosemirror/extensions';
import {
  getSpellCheckerImpl,
  isSpellEnabled,
  setSpellEnabled,
  loadSpellChecker,
  suggestionsFor,
  ignoreWord,
} from '../lib/spellcheck/service';
import { SpellSuggestionsMenu } from './SpellSuggestionsMenu';
import { bootWriterController, useWriterState } from '../lib/writer/controller';
import { rewriteFragment, sampleContext } from '../lib/writer/rewriteFragment';
import { applyInsertAsSuggestion, applyRewriteAsSuggestion } from '../lib/writer/applyAsSuggestion';
import { AISuggestionPanel } from './AISuggestionPanel';
import { ChatPanel } from './ChatPanel';
// WriterStatusPill is built and exported; rendering it inside
// `TitleBarRight` is queued for P2 along with the active-feature
// integrations so the chip appears next to the save indicator only
// once the engine actually does something interesting.
import type { WrapType } from '@eigenpal/docx-core/docx/wrapTypes';
import {
  captureInlinePositionEmu,
  toolbarValueToLayoutTarget,
  forceRenderAllPages,
  restoreVirtualization,
} from '@eigenpal/docx-core/layout-painter';
import { HyperlinkPopup, type HyperlinkPopupData } from './ui/HyperlinkPopup';
import { Toaster, toast } from 'sonner';
import { getBuiltinTableStyle, type TableStylePreset } from './ui/TableStyleGallery';
import { DocumentAgent } from '@eigenpal/docx-core/agent';
import { DefaultLoadingIndicator, DefaultPlaceholder, ParseError } from './DocxEditorHelpers';
import { parseDocx } from '@eigenpal/docx-core/docx';
import { findBodyPmAnchors } from '@eigenpal/docx-core/layout-bridge';
import { type DocxInput } from '@eigenpal/docx-core/utils';
import { onFontsLoaded, loadDocumentFonts } from '@eigenpal/docx-core/utils';
import { resolveColorToHex } from '@eigenpal/docx-core/utils';
import { executeCommand } from '@eigenpal/docx-core/agent';
import { useTableSelection } from '../hooks/useTableSelection';
import { useDocumentHistory } from '../hooks/useHistory';
import {
  getSplitCellDialogConfig,
  splitActiveTableCell,
} from '@eigenpal/docx-core/prosemirror/commands';

// Extension system
import { createStarterKit } from '@eigenpal/docx-core/prosemirror/extensions';
import { ExtensionManager } from '@eigenpal/docx-core/prosemirror/extensions';
import {
  createSuggestionModePlugin,
  setSuggestionMode,
} from '@eigenpal/docx-core/prosemirror/plugins';

// Conversion (for HF inline editor save)
import { proseDocToBlocks } from '@eigenpal/docx-core/prosemirror/conversion';

// ProseMirror editor
import {
  type SelectionState,
  TextSelection,
  extractSelectionState,
  toggleBold,
  toggleItalic,
  toggleUnderline,
  toggleStrike,
  toggleSuperscript,
  toggleSubscript,
  setTextColor,
  clearTextColor,
  setHighlight,
  setFontSize,
  setFontFamily,
  setAlignment,
  setLineSpacing,
  toggleBulletList,
  toggleNumberedList,
  increaseIndent,
  decreaseIndent,
  setIndentLeft,
  setIndentRight,
  setIndentFirstLine,
  removeTabStop,
  increaseListLevel,
  decreaseListLevel,
  clearFormatting,
  applyStyle,
  createStyleResolver,
  // Hyperlink commands
  getHyperlinkAttrs,
  getSelectedText,
  setHyperlink,
  removeHyperlink,
  insertHyperlink,
  // Text direction commands
  setRtl,
  setLtr,
  // Small caps / all caps / hidden / character spacing
  toggleSmallCaps,
  toggleAllCaps,
  toggleHidden,
  // Text effects (emboss / imprint / shadow / outline)
  toggleEmboss,
  toggleImprint,
  toggleTextShadow,
  toggleTextOutline,
  setCharacterSpacing,
  setCharacterAttrs,
  type CharacterAttrs,
  setParagraphAttrs,
  // Space before/after
  setSpaceBefore,
  setSpaceAfter,
  // Page break command
  insertPageBreak,
  // Section break command
  insertSectionBreak,
  insertFootnote,
  insertHorizontalRule,
  // Field insert command (PAGE / NUMPAGES / DATE / …)
  insertField,
  // List numbering control
  restartListNumbering,
  continueListNumbering,
  // Table of Contents command
  generateTOC,
  // Table commands
  getTableContext,
  insertTable,
  addRowAbove,
  addRowBelow,
  deleteRow as pmDeleteRow,
  addColumnLeft,
  addColumnRight,
  deleteColumn as pmDeleteColumn,
  deleteTable as pmDeleteTable,
  selectTable as pmSelectTable,
  selectRow as pmSelectRow,
  selectColumn as pmSelectColumn,
  mergeCells as pmMergeCells,
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
  removeTableBorders,
  setAllTableBorders,
  setOutsideTableBorders,
  setInsideTableBorders,
  setCellFillColor,
  setTableBorderColor,
  setTableBorderWidth,
  type TableContextInfo,
  type InsertableFieldType,
} from '@eigenpal/docx-core/prosemirror';
import {
  acceptChange,
  rejectChange,
  acceptAllChanges,
  rejectAllChanges,
  findNextChange,
  findPreviousChange,
} from '@eigenpal/docx-core/prosemirror/commands';
import { collectHeadings } from '@eigenpal/docx-core/utils';
import {
  getChangedParagraphIds,
  hasStructuralChanges,
  hasUntrackedChanges,
  hasNonParagraphBlockChanges,
  clearTrackedChanges,
} from '@eigenpal/docx-core/prosemirror/extensions';

// Paginated editor
import { PagedEditor, type PagedEditorRef, DEFAULT_PAGE_WIDTH } from '../paged-editor/PagedEditor';

// Plugin API types
import type { RenderedDomContext } from '../plugin-api/types';

// E3 — suggesting-mode banner. Yellow stripe above the editor matching
// Google Docs' visual language; visible only while editing-mode is
// "suggesting".
import { SuggestingModeBanner } from './SuggestingModeBanner';

// Building blocks (C6) — saved reusable snippets the user inserts via the
// Insert menu. Backed by localStorage; PM Slice JSON round-trip.
import { Slice } from 'prosemirror-model';
import { translateFragment, TRANSLATE_LANGUAGES } from '../lib/translate';
import {
  loadBuildingBlocks,
  addBuildingBlock,
  removeBuildingBlock,
  previewFromText,
  type BuildingBlock,
} from '../utils/buildingBlocks';

// Convert selection to table (B8) — auto-detect-delimiter helper that
// turns the selected paragraphs into a table in one click. The reverse
// direction (table → text) lives alongside it.
import { convertSelectionToTable, convertTableToText } from '../utils/convertTextToTable';
import { detectTabular } from '../utils/smartPaste';

// Citations manager (A6 v0) — localStorage CRUD; the host renders the
// formatted citation text and threads in a hyperlink for the URL.
import { loadCitations, addCitation, removeCitation, type Citation } from '../utils/citations';

// Basic inline shape generator (C2 v0). Returns SVG + data URL ready to
// drop into an image node at the cursor.
import { generateShape, type ShapeType } from '../utils/shapes';

// Platform-aware shortcut formatter (⌘ on Mac, Ctrl elsewhere).
// formatShortcut was used by the now-deleted floating outline button —
// the PanelRail computes its own shortcut chip via the same helper.

// ============================================================================
// TYPES
// ============================================================================

/**
 * DocxEditor props
 */
export interface DocxEditorProps {
  /** Document data — ArrayBuffer, Uint8Array, Blob, or File */
  documentBuffer?: DocxInput | null;
  /** Pre-parsed document (alternative to documentBuffer) */
  document?: Document | null;
  /** Callback when document is saved */
  onSave?: (buffer: ArrayBuffer) => void;
  /** Callback invoked when the user picks File → New. Host should
   *  replace the loaded document with a blank one. */
  onNew?: () => void;
  /** Author name used for comments and track changes */
  author?: string;
  /** Callback when document changes */
  onChange?: (document: Document) => void;
  /** Callback when selection changes */
  onSelectionChange?: (state: SelectionState | null) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** Callback when fonts are loaded */
  onFontsLoaded?: () => void;
  /** External ProseMirror plugins (from PluginHost) */
  externalPlugins?: import('prosemirror-state').Plugin[];
  /**
   * When true, the editor treats the `document` prop as a schema seed only and
   * does not load it into ProseMirror on mount. Content is expected to come from
   * external sources — typically `externalPlugins` such as `ySyncPlugin` from
   * `y-prosemirror`, but also any code that dispatches transactions directly.
   *
   * You must still pass a `document` prop (e.g., `createEmptyDocument()`) so the
   * editor can build its schema and render the shell.
   */
  externalContent?: boolean;
  /**
   * Starting offset for comment/tracked-change IDs. Default 0.
   *
   * Comments and tracked-change revisions share a single numeric ID space
   * inside the editor (and in OOXML's `<w:comment w:id=...>` / `<w:ins
   * w:id=...>`). The internal counter normally bumps itself above any
   * IDs already present in the loaded document, but a collab room that
   * seeds from `createEmptyDocument()` has no IDs to bump past, so two
   * peers can both start at 1 and create colliding comment IDs.
   *
   * Pass a unique base per peer (e.g. `clientId * 1e6`) to partition the
   * ID space — Comment.id values from peer A and peer B will never
   * collide. Issue: github.com/eigenpal/docx-editor/issues/257.
   */
  commentIdBase?: number;
  /** Callback when editor view is ready (for PluginHost) */
  onEditorViewReady?: (view: import('prosemirror-view').EditorView) => void;
  /** Theme for styling */
  theme?: Theme | null;
  /** Whether to show toolbar (default: true) */
  showToolbar?: boolean;
  /** Whether to show the right-edge PanelRail (default: true). Set to
   *  `false` when embedding the editor as a read-only preview so the
   *  Outline / Comments / History toggles don't render. */
  showPanelRail?: boolean;
  /** Whether to show the bottom status bar (default: true) */
  showStatusBar?: boolean;
  /** Whether to show zoom control (default: true) */
  showZoomControl?: boolean;
  /** Whether to show page margin guides/boundaries (default: false) */
  showMarginGuides?: boolean;
  /** Color for margin guides (default: '#c0c0c0') */
  marginGuideColor?: string;
  /** Whether to show horizontal ruler (default: false) */
  showRuler?: boolean;
  /** Unit for ruler display (default: 'inch') */
  rulerUnit?: 'inch' | 'cm';
  /** Initial zoom level (default: 1.0) */
  initialZoom?: number;
  /** Whether the editor is read-only. When true, hides toolbar and rulers */
  readOnly?: boolean;
  /**
   * When true, the editor does not intercept Cmd/Ctrl+F or Cmd/Ctrl+H.
   * This lets the browser or host app handle native find/history shortcuts.
   */
  disableFindReplaceShortcuts?: boolean;
  /** Custom toolbar actions */
  toolbarExtra?: ReactNode;
  /** Additional CSS class name */
  className?: string;
  /** Additional inline styles */
  style?: CSSProperties;
  /** Placeholder when no document */
  placeholder?: ReactNode;
  /** Loading indicator */
  loadingIndicator?: ReactNode;
  /** Whether to show the document outline sidebar (default: false) */
  showOutline?: boolean;
  /** Whether to show the floating outline toggle button (default: true) */
  showOutlineButton?: boolean;
  /**
   * Custom list of fonts shown in the toolbar's font-family dropdown.
   * Strings render in the "Other" group; pass `FontOption[]` for category
   * grouping and CSS fallback chains. Omit to use the built-in 12-font
   * default. An empty array renders an empty (but enabled) dropdown.
   *
   * Pass a stable reference (memoized or module-level) — inline arrays
   * create a new identity per render and invalidate the picker's memo.
   *
   * @example fontFamilies={['Arial', 'Roboto']}
   * @example fontFamilies={[{ name: 'Roboto', fontFamily: 'Roboto, sans-serif', category: 'sans-serif' }]}
   */
  fontFamilies?: ReadonlyArray<string | FontOption>;
  /** Whether to show print button in toolbar (default: true) */
  showPrintButton?: boolean;
  /** Print options for print preview */
  printOptions?: PrintOptions;
  /** Callback when print is triggered */
  onPrint?: () => void;
  /** Callback when content is copied */
  onCopy?: () => void;
  /** Callback when content is cut */
  onCut?: () => void;
  /** Callback when content is pasted */
  onPaste?: () => void;
  /** Editor mode: 'editing' (direct edits), 'suggesting' (track changes), or 'viewing' (read-only). Default: 'editing' */
  mode?: EditorMode;
  /** Callback when the editing mode changes */
  onModeChange?: (mode: EditorMode) => void;
  /** Callback when a comment is added via the UI */
  onCommentAdd?: (comment: Comment) => void;
  /** Callback when a comment is resolved via the UI */
  onCommentResolve?: (comment: Comment) => void;
  /** Callback when a comment is deleted via the UI */
  onCommentDelete?: (comment: Comment) => void;
  /** Callback when a reply is added to a comment via the UI */
  onCommentReply?: (reply: Comment, parent: Comment) => void;
  /**
   * Controlled comments array. When provided, the editor reads comment thread
   * metadata (text, author, replies, resolved status) from this prop instead
   * of internal state, and emits every change through `onCommentsChange`.
   *
   * Use this with collaboration backends (Yjs, Liveblocks, Automerge, …) so
   * comment threads sync across peers — the PM document only carries the
   * range markers; thread metadata lives outside the doc and needs its own
   * sync channel.
   *
   * If omitted, the editor falls back to internal state (current behavior).
   * The granular `onCommentAdd`/`onCommentResolve`/`onCommentDelete`/
   * `onCommentReply` callbacks fire in both modes.
   */
  comments?: Comment[];
  /** Fires whenever the comments array changes (controlled mode). */
  onCommentsChange?: (comments: Comment[]) => void;
  /**
   * Callback when rendered DOM context is ready (for plugin overlays).
   * Used by PluginHost to get access to the rendered page DOM for positioning.
   */
  onRenderedDomContextReady?: (context: RenderedDomContext) => void;
  /**
   * Plugin overlays to render inside the editor viewport.
   * Passed from PluginHost to render plugin-specific overlays.
   */
  pluginOverlays?: ReactNode;
  /** Sidebar items from plugins (passed from PluginHost). */
  pluginSidebarItems?: ReactSidebarItem[];
  /** Rendered DOM context from PluginHost (for sidebar position resolution). */
  pluginRenderedDomContext?: RenderedDomContext | null;
  /** Custom logo/icon for the title bar */
  renderLogo?: () => ReactNode;
  /** Document name shown in the title bar */
  documentName?: string;
  /** Callback when document name changes */
  onDocumentNameChange?: (name: string) => void;
  /** Whether the document name is editable (default: true) */
  documentNameEditable?: boolean;
  /** Custom right-side actions for the title bar */
  renderTitleBarRight?: () => ReactNode;
  /** Translation overrides. Import a locale JSON file and pass it directly. */
  i18n?: Translations;
  /**
   * Mount a controllable agent panel on the right side of the editor. The
   * panel is the chrome (header, close button, drag-resize); the consumer
   * supplies whatever content goes inside via `render` — typically a chat
   * UI from `@ai-sdk/react`'s `useChat`, `assistant-ui`, or any other
   * framework. We do not ship message bubbles, a composer, or a chat engine.
   *
   * Three control patterns:
   *  - **Uncontrolled**: `agentPanel={{ render }}` — toolbar button + panel
   *    close button toggle the panel. Width persists to localStorage.
   *  - **Controlled**: `agentPanel={{ render, open, onOpenChange }}` — the
   *    consumer owns open state (e.g. tied to a global menu).
   *  - **Headless**: omit `agentPanel`, use the toolkit directly via
   *    `useDocxAgentTools` — render the panel anywhere you want.
   */
  agentPanel?: {
    /** Render-prop returning the panel content. Called only when open. */
    render: (ctx: { close: () => void }) => ReactNode;
    /** Controlled open state. Omit for uncontrolled. */
    open?: boolean;
    /** Fires when toolbar button or panel close button is clicked. */
    onOpenChange?: (open: boolean) => void;
    /** Show the toolbar toggle button. Default: true. */
    showToolbarButton?: boolean;
    /** Optional badge / dot on the toolbar button. */
    toolbarBadge?: ReactNode;
    /** Optional panel title. Default: t('agentPanel.defaultTitle'). */
    title?: string;
    /** Optional panel header icon. Default: sparkle. */
    icon?: ReactNode;
    /** Initial panel width in px (uncontrolled). Default: 360. */
    defaultWidth?: number;
    /** Min drag width. Default: 280. */
    minWidth?: number;
    /** Max drag width. Default: 600. */
    maxWidth?: number;
  };
  /**
   * Opt-in Word-style rendering quirks (#395). Off by default.
   *
   * When set, the painter emulates Word's "firstRow-only borders close
   * the last body row" behavior — for a table where `<w:tblBorders>`
   * declares only `firstRow` styling, Word also draws the firstRow's
   * bottom border on the last cell of the last body row when that cell
   * has no `<w:bottom>` of its own. Other editors (LibreOffice, Google
   * Docs) leave the last row open in that case.
   *
   * Default is `false` so the renderer stays faithful to the literal
   * OOXML — hosts that want the Word look (doc-comparison UIs, side-
   * by-side viewers) flip this on. See gap-matrix → `table-last-row-
   * border` and GH #395.
   */
  wordCompat?: boolean;
}

/**
 * DocxEditor ref interface
 */
export interface DocxEditorRef {
  /** Get the DocumentAgent for programmatic access */
  getAgent: () => DocumentAgent | null;
  /** Get the current document */
  getDocument: () => Document | null;
  /** Get the editor ref */
  getEditorRef: () => PagedEditorRef | null;
  /** Save the document to buffer. Pass { selective: false } to force full repack. */
  save: (options?: { selective?: boolean }) => Promise<ArrayBuffer | null>;
  /** Set zoom level */
  setZoom: (zoom: number) => void;
  /** Get current zoom level */
  getZoom: () => number;
  /** Focus the editor */
  focus: () => void;
  /** Get current page number */
  getCurrentPage: () => number;
  /** Get total page count */
  getTotalPages: () => number;
  /**
   * Scroll the paginated view so the given page is in view.
   * Page numbers are 1-indexed (matches `getCurrentPage` / `getTotalPages`).
   * No-op for out-of-range or non-integer values.
   * @example ref.current?.scrollToPage(2)
   */
  scrollToPage: (pageNumber: number) => void;
  /**
   * Scroll the paginated view to the paragraph with the given Word `w14:paraId`.
   * @returns whether a matching paragraph exists in the ProseMirror document
   * @example ref.current?.scrollToParaId('1A2B3C4D')
   */
  scrollToParaId: (paraId: string) => boolean;
  /**
   * Scroll the paginated view to a specific ProseMirror document position.
   * Use this when you have a raw PM offset; for Word `w14:paraId` use
   * `scrollToParaId` instead.
   * @example ref.current?.scrollToPosition(42)
   */
  scrollToPosition: (pmPos: number) => void;
  /** Open print preview */
  openPrintPreview: () => void;
  /** Print the document directly */
  print: () => void;
  /** Load a pre-parsed document programmatically */
  loadDocument: (doc: Document) => void;
  /** Load a DOCX buffer programmatically (ArrayBuffer, Uint8Array, Blob, or File) */
  loadDocumentBuffer: (buffer: DocxInput) => Promise<void>;
  /** Add a comment programmatically. Anchored by Word `w14:paraId` so
   * it survives unrelated edits. Returns the comment ID, or null if
   * the paraId is unknown or the search text isn't found / is ambiguous. */
  addComment: (options: {
    paraId: string;
    text: string;
    author: string;
    /** Optional: anchor to a specific phrase within the paragraph (must be unique). */
    search?: string;
  }) => number | null;
  /** Reply to an existing comment. Returns the reply comment ID. */
  replyToComment: (commentId: number, text: string, author: string) => number | null;
  /** Resolve (mark as done) a comment. */
  resolveComment: (commentId: number) => void;
  /** Suggest a tracked change. Pass `replaceWith: ''` to delete the matched text;
   * pass `search: ''` to insert at paragraph end. Returns false on missing paraId,
   * missing/ambiguous search, or attempt to layer on an existing tracked change. */
  proposeChange: (options: {
    paraId: string;
    search: string;
    replaceWith: string;
    author: string;
  }) => boolean;
  /** Locate every paragraph containing `query` (case-insensitive substring).
   * Returns a stable handle (paraId + the matched phrase) the agent can pass
   * back to `addComment` / `proposeChange`. */
  findInDocument: (
    query: string,
    options?: { caseSensitive?: boolean; limit?: number }
  ) => Array<{ paraId: string; match: string; before: string; after: string }>;
  /**
   * Apply character formatting (bold / italic / color / size / font / etc.)
   * to a paragraph or to a unique phrase within it. This is a direct edit,
   * not a tracked change. Returns false on missing paraId or ambiguous search.
   */
  applyFormatting: (options: {
    paraId: string;
    search?: string;
    marks: {
      bold?: boolean;
      italic?: boolean;
      underline?: boolean | { style?: string };
      strike?: boolean;
      color?: { rgb?: string; themeColor?: string };
      highlight?: string;
      fontSize?: number;
      fontFamily?: { ascii?: string; hAnsi?: string };
    };
  }) => boolean;
  /**
   * Apply a paragraph style by styleId (e.g. `'Heading1'`, `'Quote'`).
   * Direct edit, not a tracked change. Returns false if paraId is unknown.
   */
  setParagraphStyle: (options: { paraId: string; styleId: string }) => boolean;
  /**
   * Read the contents of a single page. 1-indexed; returns null if the page
   * does not exist. Each paragraph is returned with its stable paraId so the
   * agent can comment on or modify it without an extra round-trip.
   */
  getPageContent: (pageNumber: number) => {
    pageNumber: number;
    text: string;
    paragraphs: Array<{ paraId: string; text: string; styleId?: string }>;
  } | null;
  /** Read the user's current cursor / selection — what's highlighted right now. */
  getSelectionInfo: () => {
    paraId: string | null;
    selectedText: string;
    paragraphText: string;
    before: string;
    after: string;
  } | null;
  /** Get all comments. */
  getComments: () => Comment[];
  /** Subscribe to document changes. Fires after every committed edit. Returns unsubscribe. */
  onContentChange: (listener: (document: Document) => void) => () => void;
  /** Subscribe to selection changes (cursor moves / selection changes). Returns unsubscribe. */
  onSelectionChange: (listener: (selection: SelectionState | null) => void) => () => void;
}

/**
 * Editor internal state
 */
interface EditorState {
  isLoading: boolean;
  parseError: string | null;
  zoom: number;
  /** Current selection formatting for toolbar */
  selectionFormatting: SelectionFormatting;
  /** Paragraph indent data for ruler */
  paragraphIndentLeft: number;
  paragraphIndentRight: number;
  paragraphFirstLineIndent: number;
  paragraphHangingIndent: boolean;
  paragraphTabs: import('@eigenpal/docx-core/types/document').TabStop[] | null;
  /** ProseMirror table context (for showing table toolbar) */
  pmTableContext: TableContextInfo | null;
  /** Image context when cursor is on an image node */
  pmImageContext: {
    pos: number;
    wrapType: string;
    displayMode: string;
    cssFloat: string | null;
    transform: string | null;
    alt: string | null;
    borderWidth: number | null;
    borderColor: string | null;
    borderStyle: string | null;
  } | null;
}

// ============================================================================
// EDITING MODE DROPDOWN (Google Docs-style)
// ============================================================================

export type EditorMode = 'editing' | 'suggesting' | 'viewing';

type EditingModeDef = {
  value: EditorMode;
  labelKey: TranslationKey;
  icon: string;
  descKey: TranslationKey;
};

const EDITING_MODES: readonly EditingModeDef[] = [
  {
    value: 'editing',
    labelKey: 'editor.editing',
    icon: 'edit_note',
    descKey: 'editor.editingDescription',
  },
  {
    value: 'suggesting',
    labelKey: 'editor.suggesting',
    icon: 'rate_review',
    descKey: 'editor.suggestingDescription',
  },
  {
    value: 'viewing',
    labelKey: 'editor.viewing',
    icon: 'visibility',
    descKey: 'editor.viewingDescription',
  },
];

/**
 * Floating page indicator shown next to the scrollbar while the user
 * scrolls a multi-page document. Wrapped so the `{current} of {total}`
 * template runs through `t()`; `useTranslation()` only works inside
 * `<LocaleProvider>`, which `DocxEditor`'s own body is not.
 */
function PageIndicator({
  currentPage,
  totalPages,
  visible,
}: {
  currentPage: number;
  totalPages: number;
  visible: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      style={{
        position: 'absolute',
        right: 24,
        top: '50%',
        transform: 'translateY(-50%)',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        color: 'white',
        padding: '6px 12px',
        borderRadius: '4px',
        fontSize: '12px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontWeight: 500,
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        zIndex: 1000,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.3s ease',
        userSelect: 'none',
      }}
      aria-live="polite"
      role="status"
    >
      {t('viewer.pageIndicator', { current: currentPage, total: totalPages })}
    </div>
  );
}

function AgentPanelToggle({
  active,
  onClick,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  badge?: ReactNode;
}) {
  const { t } = useTranslation();
  const title = t('agentPanel.toggle');
  return (
    <ToolbarButton onClick={onClick} active={active} title={title} ariaLabel={title}>
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <MaterialSymbol name="agent-sparkle" size={20} />
        {badge != null && (
          <span
            data-testid="agent-panel-toggle-badge"
            style={{
              position: 'absolute',
              top: -4,
              right: -6,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 14,
              height: 14,
              padding: '0 3px',
              borderRadius: 7,
              fontSize: 10,
              fontWeight: 600,
              background: '#ef4444',
              color: '#fff',
              lineHeight: 1,
            }}
          >
            {badge}
          </span>
        )}
      </span>
    </ToolbarButton>
  );
}

function EditingModeDropdown({
  mode,
  onModeChange,
}: {
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const current = EDITING_MODES.find((m) => m.value === mode)!;

  // Responsive: icon-only below 1400px
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 1400px)');
    setCompact(mql.matches);
    const handler = (e: MediaQueryListEvent) => setCompact(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // Position is computed in the trigger's onClick from e.currentTarget (see
  // below) so it works even when triggerRef is null — the <Tooltip> wrapper
  // can swallow the ref, which previously left the menu pinned at {0,0} (top
  // of the page) instead of under its right-aligned trigger.

  useEffect(() => {
    if (!isOpen) return;
    const close = (e: MouseEvent) => {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !dropdownRef.current?.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [isOpen]);

  return (
    <div style={{ position: 'relative' }}>
      <Tooltip content={`${t(current.labelKey)} (Ctrl+Shift+E)`}>
        <button
          ref={triggerRef}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            if (!isOpen) {
              const r = e.currentTarget.getBoundingClientRect();
              // Right-align the 220px menu to the trigger, clamped into the
              // viewport so it never runs off-screen or pins to a corner.
              const left = Math.max(8, Math.min(r.right, window.innerWidth - 8) - 220);
              setPos({ top: r.bottom + 2, left });
            }
            setIsOpen(!isOpen);
          }}
          aria-label={`${t(current.labelKey)} (Ctrl+Shift+E)`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: compact ? 0 : 4,
            padding: compact ? '2px 4px' : '2px 6px 2px 4px',
            border: 'none',
            background: isOpen ? 'var(--doc-hover, #f3f4f6)' : 'transparent',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 400,
            color: 'var(--doc-text, #374151)',
            whiteSpace: 'nowrap',
            height: 28,
          }}
        >
          <MaterialSymbol name={current.icon} size={18} />
          {!compact && <span>{t(current.labelKey)}</span>}
          <MaterialSymbol name="arrow_drop_down" size={16} />
        </button>
      </Tooltip>

      {isOpen && (
        <div
          ref={dropdownRef}
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            backgroundColor: 'var(--doc-surface, white)',
            color: 'var(--doc-text-on-surface, #1f2937)',
            border: '1px solid var(--doc-border, #d1d5db)',
            borderRadius: 8,
            boxShadow: 'var(--doc-shadow, 0 4px 12px rgba(0, 0, 0, 0.12))',
            padding: '4px 0',
            zIndex: 10000,
            minWidth: 220,
          }}
        >
          {EDITING_MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onModeChange(m.value);
                setIsOpen(false);
              }}
              onMouseOver={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                  'var(--doc-hover, #f3f4f6)';
              }}
              onMouseOut={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 13,
                color: 'var(--doc-text, #374151)',
                width: '100%',
                textAlign: 'left',
              }}
            >
              <MaterialSymbol name={m.icon} size={20} />
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span style={{ fontWeight: 500 }}>{t(m.labelKey)}</span>
                <span style={{ fontSize: 11, color: 'var(--doc-text-muted, #9ca3af)' }}>
                  {t(m.descKey)}
                </span>
              </span>
              {m.value === mode && (
                <MaterialSymbol
                  name="check"
                  size={18}
                  style={{ marginLeft: 'auto', color: 'var(--doc-primary)' }}
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

// Bumped on document load to be above all existing comment + tracked change IDs.
// Can also be bumped on mount by the `commentIdBase` prop so collab peers
// can partition the ID space and avoid collisions (issue #257).
let nextCommentId = 1;
const PENDING_COMMENT_ID = -1;

/**
 * Bump the shared `nextCommentId` counter forward (never backward).
 * Used both by the doc-load handler (to skip past IDs already in the
 * document) and by the `commentIdBase` prop effect (to skip past a
 * collab partition).
 */
function bumpNextCommentIdAtLeast(value: number): void {
  if (value > nextCommentId) nextCommentId = value;
}

/**
 * Inject commentRangeStart/End/Reference for reply comments.
 * Replies share the parent comment's text range in document.xml.
 * Without these markers, Pages/Word can't find the reply.
 */
function injectReplyRangeMarkers(content: BlockContent[], comments: Comment[]): void {
  const replies = comments.filter((c) => c.parentId != null);
  if (replies.length === 0) return;

  // Build parentId → reply IDs map
  const replyIdsByParent = new Map<number, number[]>();
  for (const r of replies) {
    const arr = replyIdsByParent.get(r.parentId!);
    if (arr) arr.push(r.id);
    else replyIdsByParent.set(r.parentId!, [r.id]);
  }

  // Walk document content and find parent commentRangeStart/End locations
  function walkBlocks(blocks: BlockContent[]): void {
    for (const block of blocks) {
      if (block.type === 'paragraph') {
        // Skip paragraphs without any comment range markers
        if (
          !block.content.some((i) => i.type === 'commentRangeStart' || i.type === 'commentRangeEnd')
        )
          continue;
        const newItems: ParagraphContent[] = [];
        for (const item of block.content) {
          if (item.type === 'commentRangeStart') {
            newItems.push(item);
            // Add reply range starts right after parent's start
            const replyIds = replyIdsByParent.get(item.id);
            if (replyIds) {
              for (const rid of replyIds) {
                newItems.push({ type: 'commentRangeStart', id: rid });
              }
            }
          } else if (item.type === 'commentRangeEnd') {
            // Parent's rangeEnd first, then reply rangeEnds (parallel, not nested)
            newItems.push(item);
            const replyIds = replyIdsByParent.get(item.id);
            if (replyIds) {
              for (const rid of replyIds) {
                newItems.push({ type: 'commentRangeEnd', id: rid });
              }
            }
          } else {
            newItems.push(item);
          }
        }
        block.content = newItems;
      } else if (block.type === 'table') {
        for (const row of block.rows) {
          for (const cell of row.cells) {
            walkBlocks(cell.content);
          }
        }
      }
    }
  }

  walkBlocks(content);
}

/**
 * Inject commentRangeStart/End for comments that reply to tracked changes.
 * TC replies' parents are insertion/deletion nodes (not comments), so
 * injectReplyRangeMarkers can't find them. This function finds the TC
 * content nodes and wraps them with comment range markers.
 */
function injectTCReplyRangeMarkers(content: BlockContent[], comments: Comment[]): void {
  // Find replies whose parentId is a tracked change (not a real comment)
  const commentIds = new Set(comments.map((c) => c.id));
  const tcReplies = comments.filter((c) => c.parentId != null && !commentIds.has(c.parentId));
  if (tcReplies.length === 0) return;

  // Build revisionId → reply comment IDs
  const replyIdsByRevision = new Map<number, number[]>();
  for (const r of tcReplies) {
    const arr = replyIdsByRevision.get(r.parentId!);
    if (arr) arr.push(r.id);
    else replyIdsByRevision.set(r.parentId!, [r.id]);
  }

  function walkBlocks(blocks: BlockContent[]): void {
    for (const block of blocks) {
      if (block.type === 'paragraph') {
        // Check if any insertion/deletion in this paragraph matches a TC reply
        const hasTC = block.content.some(
          (item) =>
            (item.type === 'insertion' || item.type === 'deletion') &&
            replyIdsByRevision.has(item.info.id)
        );
        if (!hasTC) continue;

        const newItems: ParagraphContent[] = [];
        const items = block.content;
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (
            (item.type === 'insertion' || item.type === 'deletion') &&
            replyIdsByRevision.has(item.info.id)
          ) {
            const replyIds = replyIdsByRevision.get(item.info.id)!;
            // Add commentRangeStart BEFORE the TC content
            for (const rid of replyIds) {
              newItems.push({ type: 'commentRangeStart', id: rid });
            }
            newItems.push(item);
            // Check if the next item is the other half of a replacement pair
            // (adjacent del+ins with same author+date). If so, include it inside
            // the comment range so we don't break del-ins adjacency.
            const next = items[i + 1];
            if (
              next &&
              (next.type === 'insertion' || next.type === 'deletion') &&
              next.type !== item.type &&
              next.info.author === item.info.author &&
              next.info.date === item.info.date
            ) {
              newItems.push(next);
              i++; // skip the paired item
            }
            // Add commentRangeEnd AFTER both TC items
            for (const rid of replyIds) {
              newItems.push({ type: 'commentRangeEnd', id: rid });
            }
          } else {
            newItems.push(item);
          }
        }
        block.content = newItems;
      } else if (block.type === 'table') {
        for (const row of block.rows) {
          for (const cell of row.cells) {
            walkBlocks(cell.content);
          }
        }
      }
    }
  }

  walkBlocks(content);
}

const EMPTY_ANCHOR_POSITIONS = new Map<string, number>();

/**
 * Find the Y position (relative to parentEl) of the element containing the given PM position.
 * Used by both the floating comment button and the context menu comment action.
 * Queries all elements with data-pm-start (spans, divs, imgs) — not just spans,
 * since table cell content may use div fragments.
 */
function findSelectionYPosition(
  scrollContainer: HTMLElement | null,
  parentEl: HTMLElement | null,
  pmPos: number
): number | null {
  if (!scrollContainer || !parentEl) return null;
  const pagesEl = scrollContainer.querySelector('.paged-editor__pages');
  if (!pagesEl) return null;
  for (const el of findBodyPmAnchors(pagesEl)) {
    const pmStart = Number(el.dataset.pmStart);
    const pmEnd = Number(el.dataset.pmEnd);
    if (pmPos >= pmStart && pmPos <= pmEnd) {
      return el.getBoundingClientRect().top - parentEl.getBoundingClientRect().top;
    }
  }
  return null;
}

function createComment(text: string, authorName: string, parentId?: number): Comment {
  return {
    id: nextCommentId++,
    author: authorName,
    date: new Date().toISOString(),
    content: [
      {
        type: 'paragraph',
        formatting: {},
        content: [{ type: 'run', formatting: {}, content: [{ type: 'text', text }] }],
      },
    ],
    ...(parentId !== undefined && { parentId }),
  };
}

function getInitialSectionProperties(
  doc: Document | null | undefined
): SectionProperties | undefined {
  const body = doc?.package?.document;
  return body?.sections?.[0]?.properties ?? body?.finalSectionProperties;
}

/**
 * Find the ProseMirror position range for a paragraph by Word `w14:paraId`.
 * Stable across edits — the inverse of `formatContentForLLM`'s `[paraId]` line tag.
 *
 * Returns inclusive `from` (position before the textblock) and exclusive `to`
 * (`from + nodeSize`). Text content lives in `[from + 1, to - 1]`.
 */
function findParaIdRange(
  doc: import('prosemirror-model').Node,
  paraId: string
): { from: number; to: number } | null {
  if (!paraId || !paraId.trim()) return null;
  let result: { from: number; to: number } | null = null;
  doc.descendants((node, pos) => {
    if (result !== null) return false;
    if (node.isTextblock && node.attrs?.paraId === paraId) {
      result = { from: pos, to: pos + node.nodeSize };
      return false;
    }
    return true;
  });
  return result;
}

/**
 * Find a text string within a ProseMirror paragraph node range and return its positions.
 *
 * Returns null if:
 *   - searchText is empty
 *   - searchText is not found
 *   - searchText appears more than once (ambiguous; caller must disambiguate)
 *
 * The fullText is built from PM text nodes only and matches the vanilla view
 * the agent reads via `read_document` (the bridge passes includeTrackedChanges/
 * includeCommentAnchors=false): tracked insertions are excluded (not in the doc
 * yet), tracked deletions are included (still in the doc until accepted), and
 * comment markers are stripped.
 */
/**
 * Vanilla-view text of a single PM node (typically a paragraph): concatenates
 * descendant text node content, skipping any text inside an `insertion` mark.
 * Use this in any agent-facing read path so the agent's view of the document
 * matches what `add_comment` / `suggest_change` can anchor.
 */
function getVanillaNodeText(node: import('prosemirror-model').Node): string {
  const parts: string[] = [];
  node.descendants((child) => {
    if (!child.isText || !child.text) return true;
    if (child.marks.some((m) => m.type.name === 'insertion')) return false;
    parts.push(child.text);
    return true;
  });
  return parts.join('');
}

/**
 * Vanilla-view text between two doc positions. Same semantics as
 * `getVanillaNodeText`, but takes a PM position range so it can serve a
 * selection rather than a single node.
 */
function getVanillaTextBetween(
  doc: import('prosemirror-model').Node,
  from: number,
  to: number
): string {
  if (from >= to) return '';
  const parts: string[] = [];
  doc.nodesBetween(from, to, (child, pos) => {
    if (!child.isText || !child.text) return;
    if (child.marks.some((m) => m.type.name === 'insertion')) return;
    const start = Math.max(from, pos);
    const end = Math.min(to, pos + child.text.length);
    if (start < end) parts.push(child.text.slice(start - pos, end - pos));
  });
  return parts.join('');
}

function findTextInPmParagraph(
  doc: import('prosemirror-model').Node,
  paragraphFrom: number,
  paragraphTo: number,
  searchText: string
): { from: number; to: number } | null {
  if (!searchText) return null;

  let fullText = '';
  const textPositions: { pos: number; len: number }[] = [];

  doc.nodesBetween(paragraphFrom, paragraphTo, (node, pos) => {
    if (!node.isText || !node.text) return;
    // Vanilla view: text inside an `insertion` mark isn't in the doc yet.
    if (node.marks.some((m) => m.type.name === 'insertion')) return;
    textPositions.push({ pos, len: node.text.length });
    fullText += node.text;
  });

  const firstMatch = fullText.indexOf(searchText);
  if (firstMatch === -1) return null;
  // Reject ambiguous searches — the LLM gets a clearer error than a silent mistarget.
  const secondMatch = fullText.indexOf(searchText, firstMatch + 1);
  if (secondMatch !== -1) return null;

  // Map string offset to PM position
  let charOffset = 0;
  let fromPos = paragraphFrom;
  let toPos = paragraphFrom;

  for (const tp of textPositions) {
    const segEnd = charOffset + tp.len;
    if (charOffset <= firstMatch && firstMatch < segEnd) {
      fromPos = tp.pos + (firstMatch - charOffset);
    }
    if (charOffset <= firstMatch + searchText.length && firstMatch + searchText.length <= segEnd) {
      toPos = tp.pos + (firstMatch + searchText.length - charOffset);
      break;
    }
    charOffset = segEnd;
  }

  return { from: fromPos, to: toPos };
}

/**
 * DocxEditor - Complete DOCX editor component
 */
export const DocxEditor = forwardRef<DocxEditorRef, DocxEditorProps>(function DocxEditor(
  {
    documentBuffer,
    document: initialDocument,
    onSave,
    onNew,
    author = 'User',
    onChange,
    onSelectionChange,
    onError,
    onFontsLoaded: onFontsLoadedCallback,
    theme,
    showToolbar = true,
    showPanelRail = true,
    showStatusBar = true,
    showZoomControl = true,
    showMarginGuides: _showMarginGuides = false,
    marginGuideColor: _marginGuideColor,
    showRuler = false,
    rulerUnit = 'inch',
    initialZoom = 1.0,
    readOnly: readOnlyProp = false,
    disableFindReplaceShortcuts = false,
    toolbarExtra,
    className = '',
    style,
    placeholder,
    loadingIndicator,
    showOutline: showOutlineProp = false,
    showOutlineButton = true,
    fontFamilies,
    showPrintButton = true,
    printOptions: _printOptions,
    onPrint,
    onCopy: _onCopy,
    onCut: _onCut,
    onPaste: _onPaste,
    mode: modeProp,
    onModeChange,
    onCommentAdd,
    onCommentResolve,
    onCommentDelete,
    onCommentReply,
    comments: commentsProp,
    onCommentsChange,
    externalPlugins,
    externalContent = false,
    commentIdBase,
    onEditorViewReady,
    onRenderedDomContextReady,
    pluginOverlays,
    pluginSidebarItems,
    pluginRenderedDomContext,
    renderLogo,
    documentName,
    onDocumentNameChange,
    documentNameEditable = true,
    renderTitleBarRight,
    i18n,
    agentPanel,
    wordCompat = false,
  },
  ref
) {
  const { t } = useTranslation();
  // State
  const [state, setState] = useState<EditorState>({
    isLoading: !!documentBuffer && !externalContent,
    parseError: null,
    zoom: initialZoom,
    selectionFormatting: {},
    paragraphIndentLeft: 0,
    paragraphIndentRight: 0,
    paragraphFirstLineIndent: 0,
    paragraphHangingIndent: false,
    paragraphTabs: null,
    pmTableContext: null,
    pmImageContext: null,
  });

  // Table properties dialog state
  const [tablePropsOpen, setTablePropsOpen] = useState(false);
  // Bookmarks dialog state (Phase 1.5 U14)
  const [bookmarksDialogOpen, setBookmarksDialogOpen] = useState(false);
  // Character spacing dialog state (Phase 1.5 U1)
  const [characterSpacingDialogOpen, setCharacterSpacingDialogOpen] = useState(false);
  const [characterSpacingInitial, setCharacterSpacingInitial] = useState<{
    scale: number | null;
    spacing: number | null;
    position: number | null;
    kerning: number | null;
  }>({ scale: null, spacing: null, position: null, kerning: null });
  // Paragraph dialog state (Phase 1.5 U5)
  const [paragraphDialogOpen, setParagraphDialogOpen] = useState(false);
  // Borders + Shading dialog state (Phase 1.5 U6)
  const [bordersShadingOpen, setBordersShadingOpen] = useState(false);
  const [bordersShadingInitial, setBordersShadingInitial] = useState<BordersAndShadingValue>({
    borders: {},
    shading: { fillHex: '', pattern: 'clear', patternColorHex: '' },
  });
  const [splitCellDialogState, setSplitCellDialogState] = useState({
    isOpen: false,
    initialRows: 1,
    initialCols: 2,
    minRows: 1,
    minCols: 1,
    source: null as 'pm' | 'legacy' | null,
    /** Captured cell coordinates at dialog-open time (PM path) */
    capturedCellRow: null as number | null,
    capturedCellCol: null as number | null,
  });
  // Image position dialog state
  const [imagePositionOpen, setImagePositionOpen] = useState(false);
  // Image properties dialog state
  const [imagePropsOpen, setImagePropsOpen] = useState(false);
  // Footnote properties dialog state
  const [footnotePropsOpen, setFootnotePropsOpen] = useState(false);
  // Header/footer editing state
  const [hfEditPosition, setHfEditPosition] = useState<'header' | 'footer' | null>(null);
  const [hfEditIsFirstPage, setHfEditIsFirstPage] = useState(false);
  // Document outline sidebar state
  const [showOutline, setShowOutline] = useState(showOutlineProp);
  const showOutlineRef = useRef(false);
  showOutlineRef.current = showOutline;
  const [outlineHeadings, setHeadingInfos] = useState<HeadingInfo[]>([]);

  // Comments sidebar state
  const [showCommentsSidebar, setShowCommentsSidebar] = useState(false);
  // Wire-up batch (Docs parity #1.5): dialogs that already existed but
  // had no menu entry. Each is open/close + a trigger handler.
  const [insertSymbolOpen, setInsertSymbolOpen] = useState(false);
  // Ruler visibility override — once the user toggles it, this takes
  // precedence over the showRuler prop. Initialised from the prop.
  const [showRulerLocal, setShowRulerLocal] = useState<boolean | null>(null);
  const showRulerEffective = showRulerLocal ?? showRuler;
  // Paint format (format painter) — when set, the next non-empty
  // selection will receive these marks. Esc cancels. Toolbar button
  // toggles between idle/armed.
  const [paintFormatMarks, setPaintFormatMarks] = useState<readonly PMMark[] | null>(null);
  const paintFormatMarksRef = useRef<readonly PMMark[] | null>(null);
  useEffect(() => {
    paintFormatMarksRef.current = paintFormatMarks;
  }, [paintFormatMarks]);
  const [expandedSidebarItem, setExpandedSidebarItem] = useState<string | null>(null);

  // Version-history side-panel state (F1 mount). The hook owns the
  // capture plugin; attach it to the body PM view once it's mounted.
  // Comments + version-history are mutually exclusive — opening one
  // closes the other so the right rail doesn't double-stack panels.
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const editHistory = useEditHistory({ author: 'You' });

  // Shared toggle handlers — used by both the toolbar buttons and the
  // right-edge PanelRail so the mutual-exclusion logic between Comments
  // and Version history lives in one place. Declared up here (before any
  // conditional early-return) to keep React's hook order stable.
  // Tracks `comments.length` so the rail toggle can read it without
  // depending on the (still-undeclared at this hook order) `comments`
  // variable. Updated every render in an effect below.
  const commentsCountRef = useRef(0);
  const handleToggleComments = useCallback(() => {
    setShowCommentsSidebar((v) => {
      const next = !v;
      // Opening with zero comments looks broken — there's nothing to
      // show. Surface a hint instead of silently flipping the rail.
      if (next && commentsCountRef.current === 0) {
        toast('No comments yet — select text and click "Add comment".');
      }
      return next;
    });
    setExpandedSidebarItem(null);
    setShowVersionHistory(false);
  }, []);
  const handleToggleVersionHistory = useCallback(() => {
    setShowVersionHistory((v) => {
      const next = !v;
      if (next) {
        setShowCommentsSidebar(false);
        setExpandedSidebarItem(null);
      }
      return next;
    });
  }, []);
  // Comments live in internal state by default; if the consumer passes
  // `comments` as a prop, we treat the editor as controlled — `setComments`
  // routes mutations through `onCommentsChange` instead of touching internal
  // state. Keeps the controlled/uncontrolled API symmetric with React inputs.
  const [internalComments, setInternalComments] = useState<Comment[]>([]);
  const isControlledComments = commentsProp !== undefined;
  const comments = isControlledComments ? commentsProp : internalComments;
  // Mirror to the ref the rail toggle reads — kept in render, not in
  // an effect, so the very first click after a comment-state update
  // sees the right count.
  commentsCountRef.current = comments.length;
  // Latest PM state — mirrored from the view on every doc-changing transaction.
  // Drives `useTrackedChanges` so the sidebar derives its list directly from PM
  // (the source of truth, including remote ySync updates) rather than a debounced
  // copy in React state.
  const [pmState, setPmState] = useState<PMEditorState | null>(null);
  // Index of the heading whose section the cursor is currently in.
  // Recomputed from the live PM selection + the heading list whenever
  // either changes. The outline panel uses this to render the active-row
  // highlight (A2 of the parity pipeline). Declared here (after pmState)
  // because both inputs need to be in scope.
  const activeOutlineIndex = useMemo(() => {
    if (outlineHeadings.length === 0 || !pmState) return null;
    const cursor = pmState.selection.from;
    let active: number | null = null;
    for (let i = 0; i < outlineHeadings.length; i++) {
      if (outlineHeadings[i].pmPos <= cursor) active = i;
      else break;
    }
    return active;
  }, [outlineHeadings, pmState]);
  const { entries: trackedChanges, commentToRevision } = useTrackedChanges(pmState);
  const [anchorPositions, setAnchorPositions] =
    useState<Map<string, number>>(EMPTY_ANCHOR_POSITIONS);
  // No separate state needed — pluginRenderedDomContext comes from PluginHost

  const [isAddingComment, setIsAddingComment] = useState(false);
  const [commentSelectionRange, setCommentSelectionRange] = useState<{
    from: number;
    to: number;
  } | null>(null);
  const [addCommentYPosition, setAddCommentYPosition] = useState<number | null>(null);
  const [editingModeInternal, setEditingModeInternal] = useState<EditorMode>(modeProp ?? 'editing');
  const editingMode = modeProp ?? editingModeInternal;
  const setEditingMode = (mode: EditorMode) => {
    if (!modeProp) setEditingModeInternal(mode);
    onModeChange?.(mode);
  };
  // Refs so the global keydown listener can read latest without re-binding.
  const editingModeRef = useRef<EditorMode>(editingMode);
  useEffect(() => {
    editingModeRef.current = editingMode;
  }, [editingMode]);
  const setEditingModeRef = useRef(setEditingMode);
  useEffect(() => {
    setEditingModeRef.current = setEditingMode;
  });
  // 'viewing' mode acts as read-only
  const readOnly = readOnlyProp || editingMode === 'viewing';

  // Agent panel open state (uncontrolled fallback when `agentPanel.open` is undefined).
  const [agentPanelInternalOpen, setAgentPanelInternalOpen] = useState(false);
  const isAgentPanelControlled = agentPanel?.open !== undefined;
  const agentPanelOpen = !agentPanel
    ? false
    : isAgentPanelControlled
      ? !!agentPanel.open
      : agentPanelInternalOpen;
  const setAgentPanelOpen = useCallback(
    (next: boolean) => {
      agentPanel?.onOpenChange?.(next);
      if (!isAgentPanelControlled) setAgentPanelInternalOpen(next);
    },
    [agentPanel, isAgentPanelControlled]
  );

  // Accessed by the stable recomputeFloatingCommentBtn callback below.
  // Kept in sync below after that callback is declared.
  // Floating "add comment" button position (relative to scroll container, null = hidden)
  const [floatingCommentBtn, setFloatingCommentBtn] = useState<{
    top: number;
    left: number;
  } | null>(null);

  // Right-click context menu state
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    hasSelection: boolean;
    cursorInTable: boolean;
    tableContext: TableContextInfo | null;
  }>({
    isOpen: false,
    position: { x: 0, y: 0 },
    hasSelection: false,
    cursorInTable: false,
    tableContext: null,
  });

  // Debounce timer for orphaned-comment cleanup (still needed: orphan detection
  // requires a post-edit settle so the user doesn't see comments vanish mid-edit).
  const cleanOrphanedCommentsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commentsRef = useRef(comments);
  commentsRef.current = comments;
  const isAddingCommentRef = useRef(isAddingComment);
  isAddingCommentRef.current = isAddingComment;
  const onCommentDeleteRef = useRef(onCommentDelete);
  onCommentDeleteRef.current = onCommentDelete;

  // Bridge / agent event subscribers — fan-out from the existing onChange and
  // onSelectionChange paths so multiple listeners (host app, MCP server, etc.)
  // can observe edits without competing for the single React prop.
  const contentChangeSubscribersRef = useRef(new Set<(doc: Document) => void>());
  const selectionChangeSubscribersRef = useRef(new Set<(s: SelectionState | null) => void>());
  const onCommentsChangeRef = useRef(onCommentsChange);
  onCommentsChangeRef.current = onCommentsChange;

  // Unified setter — routes to internal state in uncontrolled mode and/or to
  // the parent's onCommentsChange callback in controlled mode.
  //
  // In uncontrolled mode we mutate `commentsRef.current` synchronously
  // *before* queuing the React update so rapid sequential calls in the
  // same tick (e.g. an agent loop calling `addComment` 30 times back-to-
  // back) see the latest accumulated state. Without this, every functional
  // updater reads the same stale ref and only the last comment survives.
  //
  // In controlled mode the parent's prop is the source of truth — we don't
  // mutate the ref here because the parent might transform / reject the
  // value before echoing it back via `commentsProp`. The `commentsRef.current = comments`
  // assignment one effect above keeps the ref in sync with the prop.
  const setComments = useCallback(
    (next: Comment[] | ((prev: Comment[]) => Comment[])) => {
      const resolved =
        typeof next === 'function'
          ? (next as (prev: Comment[]) => Comment[])(commentsRef.current)
          : next;
      if (resolved === commentsRef.current) return;
      if (!isControlledComments) {
        commentsRef.current = resolved;
        setInternalComments(resolved);
      }
      onCommentsChangeRef.current?.(resolved);
    },
    [isControlledComments]
  );

  // Thread comments under their overlapping tracked change (parentId = revisionId).
  // The overlap map is computed in the same doc walk as `extractTrackedChanges`
  // so we don't pay for a second descendants() pass per transaction.
  useEffect(() => {
    if (commentToRevision.size === 0) return;
    setComments((prev) => {
      let changed = false;
      const updated = prev.map((c) => {
        if (c.parentId != null) return c; // already threaded
        const rid = commentToRevision.get(c.id);
        if (rid != null) {
          changed = true;
          return { ...c, parentId: rid };
        }
        return c;
      });
      return changed ? updated : prev;
    });
  }, [commentToRevision, setComments]);

  // Remove comments whose marks no longer exist in the document
  const cleanOrphanedComments = useCallback(() => {
    if (isAddingCommentRef.current) return;
    const view = pagedEditorRef.current?.getView();
    if (!view) return;
    const { doc, schema } = view.state;
    const commentMarkType = schema.marks.comment;
    if (!commentMarkType) return;

    const liveIds = new Set<number>();
    doc.descendants((node) => {
      for (const mark of node.marks) {
        if (mark.type === commentMarkType) {
          const id = mark.attrs.commentId as number;
          if (id !== PENDING_COMMENT_ID) liveIds.add(id);
        }
      }
    });

    const currentComments = commentsRef.current;
    const orphanedIds = new Set<number>();
    for (const c of currentComments) {
      if (c.parentId == null && !liveIds.has(c.id)) {
        orphanedIds.add(c.id);
      }
    }
    if (orphanedIds.size === 0) return;

    for (const c of currentComments) {
      if (orphanedIds.has(c.id)) onCommentDeleteRef.current?.(c);
    }
    setComments((prev) =>
      prev.filter((c) => !orphanedIds.has(c.id) && !orphanedIds.has(c.parentId!))
    );
  }, []);

  // Clean up debounce timers on unmount
  useEffect(() => {
    return () => {
      if (cleanOrphanedCommentsTimerRef.current) {
        clearTimeout(cleanOrphanedCommentsTimerRef.current);
      }
    };
  }, []);

  // Sync outline visibility when prop changes
  useEffect(() => {
    setShowOutline(showOutlineProp);
    if (showOutlineProp) {
      const view = pagedEditorRef.current?.getView();
      if (view) {
        setHeadingInfos(collectHeadings(view.state.doc));
      }
    }
  }, [showOutlineProp]);

  // History hook for undo/redo - start with null document
  const history = useDocumentHistory<Document | null>(initialDocument || null, {
    maxEntries: 100,
    groupingInterval: 500,
    enableKeyboardShortcuts: true,
  });

  // Extract comments from document model on initial load
  const commentsLoadedRef = useRef(false);
  useEffect(() => {
    if (commentsLoadedRef.current) return;
    const doc = history.state;
    if (!doc) return;
    const bodyComments = doc.package?.document?.comments;
    if (bodyComments && bodyComments.length > 0) {
      setComments(bodyComments);
      setShowCommentsSidebar(true);
      commentsLoadedRef.current = true;
      // Ensure nextCommentId is above all loaded comment IDs AND tracked change
      // revisionIds to avoid collisions (they share the same ID space in OOXML)
      let maxId = bodyComments.reduce((max, c) => Math.max(max, c.id), 0);
      // Also check tracked change revisionIds from the PM document
      const view = pagedEditorRef.current?.getView();
      if (view) {
        view.state.doc.descendants((node) => {
          for (const mark of node.marks) {
            if (mark.attrs.revisionId != null) {
              maxId = Math.max(maxId, mark.attrs.revisionId as number);
            }
          }
        });
      }
      // Bump past the document's existing IDs and (if set) past the
      // collab partition base.
      const partition = commentIdBase ?? 0;
      bumpNextCommentIdAtLeast(Math.max(maxId, partition) + 1);
    }
  }, [history.state, commentIdBase]);

  // Apply commentIdBase on mount and whenever it changes — independent
  // of doc-load, since collab rooms can seed from createEmptyDocument()
  // (no comments → load-time bump never fires; both peers would start
  // at 1 without this).
  useEffect(() => {
    if (commentIdBase !== undefined) {
      bumpNextCommentIdAtLeast(commentIdBase + 1);
    }
  }, [commentIdBase]);

  // Extension manager — built once, provides schema + plugins + commands
  const extensionManager = useMemo(() => {
    const mgr = new ExtensionManager(createStarterKit());
    mgr.buildSchema();
    mgr.initializeRuntime();
    return mgr;
  }, []);

  // Suggestion mode plugin — merged with external plugins
  const suggestionPlugin = useMemo(
    () => createSuggestionModePlugin(editingMode === 'suggesting', author),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const allExternalPlugins = useMemo(
    () => [suggestionPlugin, ...(externalPlugins ?? [])],
    [suggestionPlugin, externalPlugins]
  );

  // Refs
  const pagedEditorRef = useRef<PagedEditorRef>(null);
  const hfEditorRef = useRef<InlineHeaderFooterEditorRef>(null);
  const agentRef = useRef<DocumentAgent | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Save the last known selection for restoring after toolbar interactions
  const lastSelectionRef = useRef<{ from: number; to: number } | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docxInputRef = useRef<HTMLInputElement>(null);
  const editorContentRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const toolbarWrapperRef = useRef<HTMLDivElement>(null);
  const toolbarRoRef = useRef<ResizeObserver | null>(null);
  const [toolbarHeight, setToolbarHeight] = useState(0);
  // Horizontal scroll offset of the editor scroll container. Used to pin the
  // vertical ruler to the viewport's left edge during horizontal scroll
  // (`position: sticky` won't work — it only kicks in after scrolling past the
  // element's natural position, but we want the ruler at left=0 from the
  // start). The horizontal ruler scrolls natively via sticky-top.
  const [editorScrollLeft, setEditorScrollLeft] = useState(0);
  // Keep history.state accessible in stable callbacks without stale closures
  const historyStateRef = useRef(history.state);
  historyStateRef.current = history.state;

  // F1: attach the edit-history capture plugin once the body PM view is
  // ready. `pmState != null` flips false→true exactly when the view is
  // first available; subsequent state changes don't re-trigger the
  // effect since the dep is a boolean. attach() returns a cleanup that
  // detaches the plugin on unmount.
  const isBodyPmReady = pmState != null;
  const editHistoryAttach = editHistory.attach;
  useEffect(() => {
    if (!isBodyPmReady) return;
    const view = pagedEditorRef.current?.getView();
    if (!view) return;
    return editHistoryAttach(view);
  }, [isBodyPmReady, editHistoryAttach]);

  // Word + character counts for the status bar. Derived from the live
  // ProseMirror doc (not `history.state` — that only refreshes on major
  // lifecycle events like open / save / autosave, so the count stayed
  // stale during typing + undo / redo). Walks every text node via
  // `descendants` and stitches text fragments. Recomputes whenever
  // `pmState` flips, which `onSelectionChange` and the post-load effect
  // already drive on every transaction.
  const { wordCount, charCount, charCountWithSpaces, paragraphCount } = useMemo(() => {
    if (!pmState) {
      return {
        wordCount: undefined,
        charCount: undefined,
        charCountWithSpaces: undefined,
        paragraphCount: undefined,
      };
    }
    const paraTexts: string[] = [];
    pmState.doc.descendants((node) => {
      if (node.type.name === 'paragraph') {
        paraTexts.push(node.textContent);
        return false;
      }
      return true;
    });
    const text = paraTexts.join('\n');
    const words = text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
    // Word's "characters (with spaces)" includes the joined newlines
    // implicit between paragraphs. Mirror Word: count whitespace
    // collapsed into a single space per paragraph break.
    const charsWith = text.length;
    // "characters (no spaces)" matches Word's convention.
    const chars = text.replace(/\s/g, '').length;
    const paragraphs = paraTexts.filter((p) => p.trim().length > 0).length;
    return {
      wordCount: words,
      charCount: chars,
      charCountWithSpaces: charsWith,
      paragraphCount: paragraphs,
    };
  }, [pmState]);
  // Track current border color/width for border presets (like Google Docs)
  const borderSpecRef = useRef({ style: 'single', size: 4, color: { rgb: '000000' } });
  // Cache style resolver to avoid recreating on every selection change
  const styleResolverCacheRef = useRef<{
    styles: unknown;
    resolver: ReturnType<typeof createStyleResolver>;
  } | null>(null);
  const getCachedStyleResolver = useCallback(
    (styles: Parameters<typeof createStyleResolver>[0]) => {
      const cached = styleResolverCacheRef.current;
      if (cached && cached.styles === styles) {
        return cached.resolver;
      }
      const resolver = createStyleResolver(styles);
      styleResolverCacheRef.current = { styles, resolver };
      return resolver;
    },
    []
  );

  // Scroll-based page indicator (Google Docs style)
  const [scrollPageInfo, setScrollPageInfo] = useState<{
    currentPage: number;
    totalPages: number;
    visible: boolean;
  }>({ currentPage: 1, totalPages: 1, visible: false });
  const scrollFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Measure toolbar height for positioning the outline panel below it
  const toolbarRefCallback = useCallback((el: HTMLDivElement | null) => {
    toolbarWrapperRef.current = el;
    // Clean up previous observer
    if (toolbarRoRef.current) {
      toolbarRoRef.current.disconnect();
      toolbarRoRef.current = null;
    }
    if (!el) {
      setToolbarHeight(0);
      return;
    }
    setToolbarHeight(el.offsetHeight);
    const ro = new ResizeObserver(() => {
      setToolbarHeight(el.offsetHeight);
    });
    ro.observe(el);
    toolbarRoRef.current = ro;
  }, []);

  // Cleanup ResizeObserver on unmount
  useEffect(() => {
    return () => {
      toolbarRoRef.current?.disconnect();
    };
  }, []);

  // Track horizontal scroll so the outline panel and toggle button slide
  // with the doc instead of staying pinned. Re-runs after the loading state
  // flips because the scroll container only mounts once the doc is ready.
  // Updates are coalesced to one per frame — scroll events fire faster than
  // React can re-render the whole editor tree.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      setEditorScrollLeft(el.scrollLeft);
    };
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };
    update();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [state.isLoading]);

  // Helper to get the active editor's view — returns HF editor view when in HF editing mode
  const getActiveEditorView = useCallback(() => {
    if (hfEditPosition && hfEditorRef.current) {
      return hfEditorRef.current.getView();
    }
    return pagedEditorRef.current?.getView();
  }, [hfEditPosition]);

  // Helper to focus the active editor
  const focusActiveEditor = useCallback(() => {
    if (hfEditPosition && hfEditorRef.current) {
      hfEditorRef.current.focus();
    } else {
      pagedEditorRef.current?.focus();
    }
  }, [hfEditPosition]);

  // Helper to undo in the active editor
  const undoActiveEditor = useCallback(() => {
    if (hfEditPosition && hfEditorRef.current) {
      hfEditorRef.current.undo();
    } else {
      pagedEditorRef.current?.undo();
    }
  }, [hfEditPosition]);

  // Helper to redo in the active editor
  const redoActiveEditor = useCallback(() => {
    if (hfEditPosition && hfEditorRef.current) {
      hfEditorRef.current.redo();
    } else {
      pagedEditorRef.current?.redo();
    }
  }, [hfEditPosition]);

  const canUndoActiveEditor = useMemo(() => {
    const view = getActiveEditorView();
    return view ? pmUndo(view.state) : false;
  }, [getActiveEditorView, state.selectionFormatting, hfEditPosition]);

  const canRedoActiveEditor = useMemo(() => {
    const view = getActiveEditorView();
    return view ? pmRedo(view.state) : false;
  }, [getActiveEditorView, state.selectionFormatting, hfEditPosition]);

  // Find/Replace hook
  const findReplace = useFindReplace();

  // Hyperlink dialog hook
  const hyperlinkDialog = useHyperlinkDialog();

  // Page setup dialog state
  const [showPageSetup, setShowPageSetup] = useState(false);
  const handleOpenPageSetup = useCallback(() => setShowPageSetup(true), []);

  // File → Properties dialog state.
  const [showFileProperties, setShowFileProperties] = useState(false);
  const handleOpenFileProperties = useCallback(() => setShowFileProperties(true), []);

  // Word count dialog state (Ctrl+Shift+C, also surfaced via Edit menu).
  const [showWordCount, setShowWordCount] = useState(false);
  const handleOpenWordCount = useCallback(() => setShowWordCount(true), []);

  // Voice typing — inserts recognized text at the active editor's
  // cursor. The hook owns the SpeechRecognition lifecycle; we just
  // give it an insertion sink + render the floating indicator.
  const voiceTyping = useVoiceTyping({
    onFinalText: (text) => {
      const view = getActiveEditorView();
      if (!view) return;
      // Append a leading space when the cursor is mid-text and the
      // previous char isn't whitespace — Web Speech doesn't emit
      // leading whitespace between continuous sessions, so without
      // this two consecutive utterances would jam together.
      const { from } = view.state.selection;
      const prevChar = from > 0 ? view.state.doc.textBetween(from - 1, from, ' ', ' ') : '';
      const insert = prevChar && !/\s/.test(prevChar) ? ' ' + text : text;
      view.dispatch(view.state.tr.insertText(insert, from));
    },
  });
  const handleToggleVoiceTyping = useCallback(() => {
    voiceTyping.toggle();
  }, [voiceTyping]);

  // Help → About dialog state.
  const [showAbout, setShowAbout] = useState(false);
  const handleShowAbout = useCallback(() => setShowAbout(true), []);
  const handleReportBug = useCallback(() => {
    void import('./report-bug').then((m) => m.openBugReport());
  }, []);

  // Command palette state (⌘⇧P / Ctrl+Shift+P). Searchable list of every
  // menu action, sourced from the same callbacks the menus use.
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [showWatermarkDialog, setShowWatermarkDialog] = useState(false);
  const [showAccessibility, setShowAccessibility] = useState(false);
  const [accessibilityIssues, setAccessibilityIssues] = useState<AccessibilityIssue[]>([]);
  // Building blocks (C6): persisted snippet list + a snapshot of whatever
  // the editor selection contained at the moment the dialog opened, so
  // saving works even after focus has shifted to the dialog input.
  const [showBuildingBlocks, setShowBuildingBlocks] = useState(false);
  const [buildingBlocks, setBuildingBlocks] = useState<BuildingBlock[]>(() => loadBuildingBlocks());
  const [pendingBuildingBlock, setPendingBuildingBlock] = useState<{
    content: unknown;
    preview: string;
  } | null>(null);
  // A4 — dictionary lookup. Captures the selected word at open time so
  // the dialog can show "looking up <word>" loading state without a
  // re-fetch on every render.
  const [showDictionary, setShowDictionary] = useState(false);
  const [dictionaryWord, setDictionaryWord] = useState<string | null>(null);
  // A5 — translate selection. Captures the selection text at open time.
  // `translateRange` is also captured when the dialog is opened from
  // the editor's right-click menu so the Replace button can target the
  // exact span the user selected, even if the cursor moves while the
  // dialog is up.
  const [showTranslate, setShowTranslate] = useState(false);
  const [translateText, setTranslateText] = useState<string | null>(null);
  const [translateRange, setTranslateRange] = useState<{ from: number; to: number } | null>(null);
  // Whole-document translate-and-export dialog. Separate from the
  // selection dialog above because its action (download a translated
  // copy) is distinct from "replace selection in-place".
  const [showTranslateDocument, setShowTranslateDocument] = useState(false);

  // Writing Assistant — sheet + rail entry. Boots the controller on
  // mount so capability checks + auto-load run before the sheet opens.
  const [showWritingAssistant, setShowWritingAssistant] = useState(false);
  const [showChatPanel, setShowChatPanel] = useState(false);
  useEffect(() => {
    void bootWriterController();
  }, []);

  // Smart paste — after the user pastes tabular content (TSV / CSV)
  // the editor surfaces a sonner toast offering one-click conversion
  // to a real table. Detection is strict (see `detectTabular`) so
  // ordinary prose paste doesn't trigger the prompt.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const view = getActiveEditorView();
      if (!view) return;
      const target = e.target as Node | null;
      if (!target || !view.dom.contains(target)) return;
      const text = e.clipboardData?.getData('text/plain') ?? '';
      const shape = detectTabular(text);
      if (!shape) return;
      const sizeBefore = view.state.doc.content.size;
      // Wait one tick for PM to apply its paste transaction, then
      // grab the inserted range from the doc-size delta. The
      // selection collapses to the right edge of the inserted slice
      // after PM applies the paste.
      requestAnimationFrame(() => {
        const live = getActiveEditorView();
        if (!live) return;
        const sizeAfter = live.state.doc.content.size;
        const inserted = sizeAfter - sizeBefore;
        if (inserted <= 0) return;
        const to = live.state.selection.head;
        const from = Math.max(0, to - inserted);
        toast.message(`Pasted data looks like a ${shape.rows} × ${shape.columns} table.`, {
          duration: 8000,
          action: {
            label: 'Convert to table',
            onClick: () => {
              const v = getActiveEditorView();
              if (!v) return;
              v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, from, to)));
              convertSelectionToTable(v);
            },
          },
        });
      });
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [getActiveEditorView]);

  // AI suggestion popover wiring. See definitions below the state
  // for `openAiSuggestion`, `runAiSuggestion`, and the accept/reject
  // handlers — they sit lower because they depend on
  // `getActiveEditorView` which is declared further down the file.
  type AIToneId = 'polish' | 'concise' | 'formal' | 'casual' | 'shorter' | 'longer';
  const aiAbortRef = useRef<AbortController | null>(null);
  const aiFragmentRef = useRef<import('prosemirror-model').Fragment | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<{
    mode: 'rewrite' | 'summarize';
    from: number;
    to: number;
    original: string;
    suggestion: string | null;
    inferenceMs: number | null;
    tone: AIToneId;
    busy: boolean;
    error: string | null;
  } | null>(null);
  // A3 — explore (Wikipedia lookup). Seeds the query from the selection.
  const [showExplore, setShowExplore] = useState(false);
  const [exploreQuery, setExploreQuery] = useState<string | null>(null);
  // A6 v0 — citations manager. Local-only storage.
  const [showCitations, setShowCitations] = useState(false);
  const [citations, setCitations] = useState<Citation[]>(() => loadCitations());
  // Editor preferences — smart quotes / autocorrect runtime toggles.
  // Lazy-init from localStorage and hydrate the core singleton so the
  // smart-quotes/autocorrect plugins see the persisted values on the very
  // first keystroke, not just after a re-render.
  const [preferences, setPreferences] = useState<EditorPreferences>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem('docx-editor-prefs');
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<EditorPreferences>;
          if (typeof parsed.smartQuotes === 'boolean') {
            editorPreferences.smartQuotes = parsed.smartQuotes;
          }
          if (typeof parsed.autocorrect === 'boolean') {
            editorPreferences.autocorrect = parsed.autocorrect;
          }
        }
      } catch {
        // Corrupted localStorage — fall through to defaults.
      }
    }
    return { ...editorPreferences };
  });

  // Spell-suggestions popover — shown when the user right-clicks on a
  // misspelled word. Captures the underlying PM range so the picked
  // replacement can be dispatched directly.
  const [spellMenu, setSpellMenu] = useState<{
    x: number;
    y: number;
    from: number;
    to: number;
    word: string;
    suggestions: string[];
  } | null>(null);

  // Spell-check runtime toggle. Off by default — the ~500 KB Hunspell
  // dictionary downloads lazily the first time the user flips this on.
  // Persisted to localStorage so the choice survives reloads.
  const SPELLCHECK_KEY = 'docx-editor-spellcheck-enabled';
  const [spellOn, setSpellOn] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(SPELLCHECK_KEY) === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    // Register the React-side checker with the core extension exactly
    // once. The injection is module-level so HMR-safe — every reload
    // overwrites the same singleton.
    setSpellChecker(getSpellCheckerImpl());
    return () => {
      setSpellChecker(null);
    };
  }, []);
  const handlePreferenceChange = useCallback(
    <K extends keyof EditorPreferences>(key: K, value: EditorPreferences[K]) => {
      setEditorPreference(key, value);
      setPreferences((prev) => {
        const next = { ...prev, [key]: value };
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem('docx-editor-prefs', JSON.stringify(next));
          } catch {
            // Quota exceeded / private mode — fail silently; runtime
            // setting still applies for the current session.
          }
        }
        return next;
      });
    },
    []
  );

  // Color theme: 'auto' (follow OS) | 'light' | 'dark'. Persisted in
  // localStorage. editor.css selects `[data-theme="dark"]` and
  // `[data-theme="auto"]` (the latter only when the OS reports dark).
  const [colorTheme, setColorTheme] = useState<'light' | 'dark' | 'auto'>(() => {
    if (typeof window === 'undefined') return 'auto';
    const stored = window.localStorage.getItem('casual-editor:color-theme');
    return stored === 'light' || stored === 'dark' || stored === 'auto' ? stored : 'auto';
  });
  // Apply the *initial* theme synchronously on mount so the attribute is
  // set before the first paint (no flash).
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', colorTheme);
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Update the data-theme attribute synchronously in the click handler so
  // the CSS recalc happens immediately, without waiting for React's
  // commit phase + useEffect. The setState below only drives the icon
  // re-render in the title bar.
  const handleSetColorTheme = useCallback((t: 'light' | 'dark' | 'auto') => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', t);
    }
    try {
      window.localStorage.setItem('casual-editor:color-theme', t);
    } catch {
      // localStorage may be unavailable (private mode); harmless.
    }
    setColorTheme(t);
  }, []);

  // Hyperlink popup state (Google Docs-style floating popup on link click)
  const [hyperlinkPopupData, setHyperlinkPopupData] = useState<HyperlinkPopupData | null>(null);

  // Monotonically increasing generation counter to discard stale async loads
  const loadGenerationRef = useRef(0);

  // Reset internal state when loading a new document (clears stale refs, comments, tracked changes, etc.)
  const resetForNewDocument = useCallback(() => {
    commentsLoadedRef.current = false;
    trackedChangesLoadedRef.current = false;
    setComments([]);
    setHeadingInfos([]);
    setShowCommentsSidebar(false);
    setIsAddingComment(false);
    setCommentSelectionRange(null);
    setAddCommentYPosition(null);
    setFloatingCommentBtn(null);
    setHfEditPosition(null);
    setAnchorPositions(EMPTY_ANCHOR_POSITIONS);
    findReplace.setMatches([], 0);
    if (cleanOrphanedCommentsTimerRef.current) {
      clearTimeout(cleanOrphanedCommentsTimerRef.current);
      cleanOrphanedCommentsTimerRef.current = null;
    }
  }, [findReplace.setMatches, setComments]);

  // Load a pre-parsed document (used by ref method and internally)
  const loadParsedDocument = useCallback(
    (doc: Document) => {
      resetForNewDocument();
      history.reset(doc);
      setState((prev) => ({ ...prev, isLoading: false, parseError: null }));
      loadDocumentFonts(doc).catch((err) => {
        console.warn('Failed to load document fonts:', err);
      });
    },
    [resetForNewDocument, history]
  );

  // Load a DOCX buffer (used by ref method and internally)
  const loadBuffer = useCallback(
    async (buffer: DocxInput) => {
      const generation = ++loadGenerationRef.current;
      resetForNewDocument();
      // Loading a fresh buffer wipes the prior edit state, so the new
      // document starts clean.
      markDirty(false);
      setState((prev) => ({ ...prev, isLoading: true, parseError: null }));
      try {
        const doc = await parseDocx(buffer);
        // Discard result if a newer load was started while we were parsing
        if (loadGenerationRef.current !== generation) return;
        loadParsedDocument(doc);
      } catch (error) {
        if (loadGenerationRef.current !== generation) return;
        const message = error instanceof Error ? error.message : 'Failed to parse document';
        setState((prev) => ({
          ...prev,
          isLoading: false,
          parseError: message,
        }));
        onError?.(error instanceof Error ? error : new Error(message));
      }
    },
    [resetForNewDocument, loadParsedDocument, onError]
  );

  // React to document/documentBuffer prop changes
  useEffect(() => {
    // External content mode: caller (e.g. ySyncPlugin) populates PM directly — skip the load.
    if (externalContent) return;

    if (!documentBuffer) {
      if (initialDocument) {
        loadParsedDocument(initialDocument);
      }
      return;
    }

    loadBuffer(documentBuffer);
  }, [documentBuffer, initialDocument, externalContent]); // eslint-disable-line react-hooks/exhaustive-deps

  // Create/update agent when document changes
  useEffect(() => {
    if (history.state) {
      agentRef.current = new DocumentAgent(history.state);
    } else {
      agentRef.current = null;
    }
  }, [history.state]);

  // Mirror PM state on each external document load (mount-time view creation
  // is handled by PagedEditor's `onReady` below; this effect catches subsequent
  // loads via `document`/`documentBuffer` prop changes, which go through
  // HiddenProseMirror's `updateState` and never fire `handleDocumentChange`).
  // Effects run child-first, so `view.state` already reflects the new doc by
  // the time this runs.
  useEffect(() => {
    if (state.isLoading || !history.state) return;
    const view = pagedEditorRef.current?.getView();
    if (view) setPmState(view.state);
  }, [state.isLoading, history.state]);

  // Auto-open the sidebar once if the loaded document already has tracked changes.
  const trackedChangesLoadedRef = useRef(false);
  useEffect(() => {
    if (trackedChangesLoadedRef.current) return;
    if (state.isLoading || !pmState) return;
    trackedChangesLoadedRef.current = true;
    if (trackedChanges.length > 0) setShowCommentsSidebar(true);
  }, [pmState, state.isLoading, trackedChanges.length]);

  // Listen for font loading
  useEffect(() => {
    const cleanup = onFontsLoaded(() => {
      onFontsLoadedCallback?.();
    });
    return cleanup;
  }, [onFontsLoadedCallback]);

  // Sync editing mode to ProseMirror suggestion mode plugin
  useEffect(() => {
    const view = pagedEditorRef.current?.getView();
    if (view) {
      setSuggestionMode(editingMode === 'suggesting', view.state, view.dispatch, author);
    }
  }, [editingMode, author]);

  const pushDocument = useCallback(
    (document: Document) => {
      history.push(document);
      return document;
    },
    [history]
  );

  // Tracks whether the user has unsaved edits. The ref is read by the
  // `beforeunload` listener (which can't trigger React re-renders).
  // The state mirrors the ref so the title-bar UnsavedIndicator updates
  // when the value flips.
  const isDirtyRef = useRef(false);
  const [isDirty, setIsDirty] = useState(false);
  const markDirty = useCallback((dirty: boolean) => {
    isDirtyRef.current = dirty;
    // Only re-render when the displayed state actually changes.
    setIsDirty((prev) => (prev === dirty ? prev : dirty));
  }, []);
  // True while a save / download is in flight — drives the
  // "Saving…" indicator in the title bar.
  const [isSaving, setIsSaving] = useState(false);

  // beforeunload guard — browsers show the native confirm dialog when
  // `event.returnValue` is set to a non-empty string (the actual string is
  // ignored in modern browsers; only the presence matters).
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirtyRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // Handle document change
  const handleDocumentChange = useCallback(
    (newDocument: Document) => {
      markDirty(true);
      pushDocument(newDocument);
      onChange?.(newDocument);
      // Fan out to bridge subscribers (errors in one don't break the others).
      for (const cb of contentChangeSubscribersRef.current) {
        try {
          cb(newDocument);
        } catch (e) {
          console.error('contentChange subscriber threw:', e);
        }
      }
      // Update outline headings if sidebar is open
      if (showOutlineRef.current) {
        const view = pagedEditorRef.current?.getView();
        if (view) {
          setHeadingInfos(collectHeadings(view.state.doc));
        }
      }
      // Mirror latest PM state so `useTrackedChanges` (and the threading effect)
      // re-derive from the new doc — including for transactions that came in
      // remotely via ySyncPlugin in collab mode.
      const view = pagedEditorRef.current?.getView();
      if (view) setPmState(view.state);
      // Clean up orphaned comments (debounced — avoid yanking comments mid-edit)
      if (cleanOrphanedCommentsTimerRef.current) {
        clearTimeout(cleanOrphanedCommentsTimerRef.current);
      }
      cleanOrphanedCommentsTimerRef.current = setTimeout(cleanOrphanedComments, 300);
    },
    [onChange, pushDocument, cleanOrphanedComments]
  );

  // Recompute the floating "add comment" button position from the current PM
  // selection + page/container geometry. Called from handleSelectionChange and
  // from the geometry-change effects below (resize, zoom), because PagedEditor's
  // onSelectionChange no longer fires on mere overlay redraws after the
  // state-identity dedup in #268.
  const readOnlyForFloatingBtnRef = useRef(false);
  const recomputeFloatingCommentBtn = useCallback(() => {
    const view = pagedEditorRef.current?.getView();
    if (!view) return;
    if (isAddingCommentRef.current || readOnlyForFloatingBtnRef.current) {
      setFloatingCommentBtn(null);
      return;
    }
    const { from, to } = view.state.selection;
    if (from === to) {
      setFloatingCommentBtn(null);
      return;
    }
    const container = scrollContainerRef.current;
    const parentEl = editorContentRef.current;
    if (!container || !parentEl) return;
    const top = findSelectionYPosition(container, parentEl, from);
    if (top == null) return;
    const pagesEl = container.querySelector('.paged-editor__pages');
    const pageEl = pagesEl?.querySelector('.layout-page') as HTMLElement | null;
    const left = pageEl
      ? pageEl.getBoundingClientRect().right - parentEl.getBoundingClientRect().left
      : parentEl.getBoundingClientRect().width / 2 + 408;
    setFloatingCommentBtn({ top, left });
  }, []);
  // Keep the readOnly ref used by recomputeFloatingCommentBtn in sync
  readOnlyForFloatingBtnRef.current = readOnly;

  // Reposition the floating "add comment" button when the editor container
  // resizes (window resize, sidebar toggle, loading→ready transition) or when
  // zoom changes. Both move the page edges without changing PM selection, so
  // the onSelectionChange path no longer covers them after the dedup fix in
  // #268. The scroll container may not be mounted on the first render (loading
  // state renders a different subtree), so re-run the effect whenever that
  // state flips — that's the point at which the container first becomes
  // available.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => recomputeFloatingCommentBtn());
    ro.observe(container);
    const onWinResize = () => recomputeFloatingCommentBtn();
    window.addEventListener('resize', onWinResize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onWinResize);
    };
  }, [state.isLoading, recomputeFloatingCommentBtn]);
  useEffect(() => {
    recomputeFloatingCommentBtn();
  }, [state.zoom, recomputeFloatingCommentBtn]);

  // Handle selection changes from ProseMirror
  const handleSelectionChange = useCallback(
    (selectionState: SelectionState | null) => {
      // Save selection for restoring after toolbar interactions
      const view = getActiveEditorView();
      if (view) {
        const { from, to } = view.state.selection;
        lastSelectionRef.current = { from, to };
      }

      // Also check table context from ProseMirror
      let pmTableCtx: TableContextInfo | null = null;
      if (view) {
        pmTableCtx = getTableContext(view.state);
        if (!pmTableCtx.isInTable) {
          pmTableCtx = null;
        }
      }

      // Sync borderSpecRef with the current cell's actual border color
      if (pmTableCtx?.cellBorderColor) {
        const rgb = resolveColorToHex(pmTableCtx.cellBorderColor, theme);
        if (rgb) {
          borderSpecRef.current = { ...borderSpecRef.current, color: { rgb } };
        }
      }

      // Check if cursor is on an image (NodeSelection)
      let pmImageCtx: typeof state.pmImageContext = null;
      if (view) {
        const sel = view.state.selection;
        // NodeSelection has a `node` property
        const selectedNode = (
          sel as { node?: { type: { name: string }; attrs: Record<string, unknown> } }
        ).node;
        if (selectedNode?.type.name === 'image') {
          pmImageCtx = {
            pos: sel.from,
            wrapType: (selectedNode.attrs.wrapType as string) ?? 'inline',
            displayMode: (selectedNode.attrs.displayMode as string) ?? 'inline',
            cssFloat: (selectedNode.attrs.cssFloat as string) ?? null,
            transform: (selectedNode.attrs.transform as string) ?? null,
            alt: (selectedNode.attrs.alt as string) ?? null,
            borderWidth: (selectedNode.attrs.borderWidth as number) ?? null,
            borderColor: (selectedNode.attrs.borderColor as string) ?? null,
            borderStyle: (selectedNode.attrs.borderStyle as string) ?? null,
          };
        }
      }

      if (!selectionState) {
        setFloatingCommentBtn(null);
        setState((prev) => ({
          ...prev,
          selectionFormatting: {},
          pmTableContext: pmTableCtx,
          pmImageContext: pmImageCtx,
        }));
        return;
      }

      // Update toolbar formatting from ProseMirror selection
      const { textFormatting, paragraphFormatting } = selectionState;

      // Extract font family (prefer ascii, fall back to hAnsi)
      let fontFamily = textFormatting.fontFamily?.ascii || textFormatting.fontFamily?.hAnsi;
      let fontSize = textFormatting.fontSize;

      // If no explicit font/size marks, resolve from paragraph style or document defaults
      if (!fontFamily || !fontSize) {
        const currentDoc = historyStateRef.current;
        const paraStyleId = selectionState.styleId;
        if (currentDoc?.package.styles && paraStyleId) {
          const resolver = getCachedStyleResolver(currentDoc.package.styles);
          const resolved = resolver.resolveParagraphStyle(paraStyleId);
          if (!fontFamily && resolved.runFormatting?.fontFamily) {
            fontFamily =
              resolved.runFormatting.fontFamily.ascii || resolved.runFormatting.fontFamily.hAnsi;
          }
          if (!fontSize && resolved.runFormatting?.fontSize) {
            fontSize = resolved.runFormatting.fontSize;
          }
        }
      }

      const textColorHex = resolveColorToHex(textFormatting.color, theme);
      const textColor = textColorHex ? `#${textColorHex}` : undefined;

      // Build list state from numPr
      const numPr = paragraphFormatting.numPr;
      const listState = numPr
        ? {
            type: (numPr.numId === 1 ? 'bullet' : 'numbered') as 'bullet' | 'numbered',
            level: numPr.ilvl ?? 0,
            isInList: true,
            numId: numPr.numId,
          }
        : undefined;

      const formatting: SelectionFormatting = {
        bold: textFormatting.bold,
        italic: textFormatting.italic,
        underline: !!textFormatting.underline,
        strike: textFormatting.strike,
        superscript: textFormatting.vertAlign === 'superscript',
        subscript: textFormatting.vertAlign === 'subscript',
        smallCaps: textFormatting.smallCaps,
        allCaps: textFormatting.allCaps,
        hidden: textFormatting.hidden,
        emboss: textFormatting.emboss,
        imprint: textFormatting.imprint,
        shadow: textFormatting.shadow,
        outline: textFormatting.outline,
        fontFamily,
        fontSize,
        color: textColor,
        highlight: textFormatting.highlight,
        alignment: paragraphFormatting.alignment,
        lineSpacing: paragraphFormatting.lineSpacing,
        spaceBefore: paragraphFormatting.spaceBefore,
        spaceAfter: paragraphFormatting.spaceAfter,
        listState,
        styleId: selectionState.styleId ?? undefined,
        indentLeft: paragraphFormatting.indentLeft,
        bidi: !!paragraphFormatting.bidi,
        keepNext: paragraphFormatting.keepNext,
        keepLines: paragraphFormatting.keepLines,
        pageBreakBefore: paragraphFormatting.pageBreakBefore,
        widowControl: paragraphFormatting.widowControl,
      };
      setState((prev) => ({
        ...prev,
        selectionFormatting: formatting,
        paragraphIndentLeft: paragraphFormatting.indentLeft ?? 0,
        paragraphIndentRight: paragraphFormatting.indentRight ?? 0,
        paragraphFirstLineIndent: paragraphFormatting.indentFirstLine ?? 0,
        paragraphHangingIndent: paragraphFormatting.hangingIndent ?? false,
        paragraphTabs: paragraphFormatting.tabs ?? null,
        pmTableContext: pmTableCtx,
        pmImageContext: pmImageCtx,
      }));

      // Update floating comment button position
      recomputeFloatingCommentBtn();

      // Paint-format armed and now there's a non-empty selection — apply.
      if (paintFormatMarksRef.current) {
        const view = pagedEditorRef.current?.getView();
        if (view) {
          const { from, to } = view.state.selection;
          if (from !== to) {
            applyPaintedMarks(from, to);
          }
        }
      }

      // Notify parent
      onSelectionChange?.(selectionState);
      // Fan out to bridge subscribers.
      for (const cb of selectionChangeSubscribersRef.current) {
        try {
          cb(selectionState);
        } catch (e) {
          console.error('selectionChange subscriber threw:', e);
        }
      }
    },
    // getActiveEditorView's return depends on hfEditPosition; theme drives
    // color resolution. Both must be in deps to avoid stale-closure reads.
    [onSelectionChange, isAddingComment, readOnly, getActiveEditorView, theme]
  );

  // Table selection hook
  const tableSelection = useTableSelection({
    document: history.state,
    onChange: handleDocumentChange,
    onSelectionChange: (_context) => {
      // Could notify parent of table selection changes
    },
  });

  // Keyboard shortcuts for Find/Replace (Ctrl+F, Ctrl+H) and delete table selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Ctrl+F (Find) or Ctrl+H (Replace)
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      // Delete selected table from layout selection (non-ProseMirror selection)
      if (!cmdOrCtrl && !e.shiftKey && !e.altKey) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          // If full table is selected via ProseMirror CellSelection, delete it.
          const view = pagedEditorRef.current?.getView();
          if (view) {
            const sel = view.state.selection as { $anchorCell?: unknown; forEachCell?: unknown };
            const isCellSel = '$anchorCell' in sel && typeof sel.forEachCell === 'function';
            if (isCellSel) {
              const context = getTableContext(view.state);
              if (context.isInTable && context.table) {
                let totalCells = 0;
                context.table.descendants((node) => {
                  if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
                    totalCells += 1;
                  }
                });
                let selectedCells = 0;
                (sel as { forEachCell: (fn: () => void) => void }).forEachCell(() => {
                  selectedCells += 1;
                });
                if (totalCells > 0 && selectedCells >= totalCells) {
                  e.preventDefault();
                  pmDeleteTable(view.state, view.dispatch);
                  return;
                }
              }
            }
          }

          if (tableSelection.state.tableIndex !== null) {
            e.preventDefault();
            tableSelection.handleAction('deleteTable');
            return;
          }
        }
      }

      if (cmdOrCtrl && !e.shiftKey && !e.altKey) {
        if (e.key.toLowerCase() === 'f') {
          if (disableFindReplaceShortcuts) return;
          e.preventDefault();
          // Get selected text if any
          const selection = window.getSelection();
          const selectedText = selection && !selection.isCollapsed ? selection.toString() : '';
          findReplace.openFind(selectedText);
        } else if (e.key.toLowerCase() === 'h') {
          if (disableFindReplaceShortcuts) return;
          e.preventDefault();
          // Get selected text if any
          const selection = window.getSelection();
          const selectedText = selection && !selection.isCollapsed ? selection.toString() : '';
          findReplace.openReplace(selectedText);
        } else if (e.key.toLowerCase() === 'k') {
          e.preventDefault();
          // Open hyperlink dialog
          const view = pagedEditorRef.current?.getView();
          if (view) {
            const selectedText = getSelectedText(view.state);
            const existingLink = getHyperlinkAttrs(view.state);
            if (existingLink) {
              hyperlinkDialog.openEdit({
                url: existingLink.href,
                displayText: selectedText,
                tooltip: existingLink.tooltip,
              });
            } else {
              hyperlinkDialog.openInsert(selectedText);
            }
          }
        } else if (e.key.toLowerCase() === 's') {
          // Mod+S: Save (download .docx)
          e.preventDefault();
          shortcutActionsRef.current.save?.();
        } else if (e.key.toLowerCase() === 'p') {
          // Mod+P: Print
          e.preventDefault();
          shortcutActionsRef.current.print?.();
        } else if (e.key.toLowerCase() === 'n') {
          // Mod+N: New document. Only honor if the host opted in via onNew.
          if (shortcutActionsRef.current.new) {
            e.preventDefault();
            shortcutActionsRef.current.new();
          }
        } else if (e.key.toLowerCase() === 'o') {
          // Mod+O: Open file picker
          e.preventDefault();
          shortcutActionsRef.current.open?.();
        } else if (e.key === '\\') {
          // Mod+\\: Clear formatting (Google Docs convention)
          const view = pagedEditorRef.current?.getView();
          if (view) {
            e.preventDefault();
            clearFormatting(view.state, view.dispatch);
          }
        } else if (e.key === '=' || e.key === '+') {
          // Mod+= / Mod++: Zoom in.
          e.preventDefault();
          shortcutActionsRef.current.zoomIn?.();
        } else if (e.key === '-') {
          // Mod+-: Zoom out.
          e.preventDefault();
          shortcutActionsRef.current.zoomOut?.();
        } else if (e.key === '0') {
          // Mod+0: Reset zoom to 100%.
          e.preventDefault();
          shortcutActionsRef.current.zoomReset?.();
        }
      }

      // Mod+Shift+P → command palette. Word / VS Code / Notion convention.
      if (cmdOrCtrl && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setShowCommandPalette(true);
      }

      // Mod+Alt+M → start a new comment on the selection (Google Docs
      // binding). Uses e.code, not e.key, because Option remaps the M key
      // on macOS. No-op when the selection is empty (handled downstream).
      if (cmdOrCtrl && e.altKey && !e.shiftKey && e.code === 'KeyM') {
        e.preventDefault();
        shortcutActionsRef.current.startComment?.();
      }

      // Mod+/ → keyboard-shortcuts dialog (Google Docs binding).
      if (cmdOrCtrl && !e.shiftKey && !e.altKey && e.key === '/') {
        e.preventDefault();
        setShowKeyboardShortcuts(true);
      }

      // Mod+Shift+L → toggle bullet list. Word convention; also matches
      // Google Docs (Ctrl+Shift+8 there, but L is the documented Word
      // binding and the doc community expects it). Routes through the
      // same handleFormat path the toolbar uses so behavior stays
      // identical to clicking the bullet button.
      if (cmdOrCtrl && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        const view = getActiveEditorView();
        if (view) {
          toggleBulletList(view.state, view.dispatch);
        }
      }

      // Mod+Shift+E → cycle editing mode (Docs convention: Editing →
      // Suggesting → Viewing → Editing). The mode-toggle button tooltip
      // already advertises this shortcut; this wires it.
      if (cmdOrCtrl && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        const current = editingModeRef.current;
        const next: EditorMode =
          current === 'editing' ? 'suggesting' : current === 'suggesting' ? 'viewing' : 'editing';
        setEditingModeRef.current(next);
      }

      // Mod+Shift+C → open Word count dialog (Google Docs convention).
      // Same dialog the Edit → Word count menu item opens.
      if (cmdOrCtrl && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        setShowWordCount(true);
      }

      // Mod+Shift+Y → open Dictionary dialog (Google Docs convention, A4).
      // Same dialog the Tools → Dictionary menu item opens, with the
      // current selection (if any) pre-filled.
      if (cmdOrCtrl && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleOpenDictionary();
      }

      // Mod+Shift+H → toggle document outline. Mod+H (no shift) opens
      // Find & Replace, so the shifted variant is the obvious free slot.
      // Mac users can't easily use Mod+Alt+H — that's "Hide Others" at
      // the system level — so the shift-modifier shortcut is the
      // cross-platform-safe choice.
      if (cmdOrCtrl && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        handleToggleOutline();
      }

      // Mod+Shift+V → paste without formatting (Google Docs + Word
      // convention; the same handler the Edit menu's "Paste without
      // formatting" item runs). Reads the system clipboard as plain
      // text and inserts via execCommand so the inserted run inherits
      // the cursor's stored marks. Falls back silently when the
      // browser blocks the clipboard read — the user can still
      // ⌘V then Ctrl+\ (clear formatting) as a manual fallback.
      if (cmdOrCtrl && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        void (async () => {
          try {
            const text = await navigator.clipboard.readText();
            if (!text) return;
            pagedEditorRef.current?.focus();
            document.execCommand('insertText', false, text);
          } catch {
            // Clipboard read denied — silently no-op; the Edit menu
            // entry has the same fallback behaviour.
          }
        })();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [disableFindReplaceShortcuts, findReplace, hyperlinkDialog, tableSelection]);

  // Ref holds the latest file-op handlers so the global keydown listener
  // (registered once above) can call them without depending on their
  // identity (they're defined later in the function — referencing them
  // directly trips TS's temporal-dead-zone check).
  const shortcutActionsRef = useRef<{
    save?: () => void;
    print?: () => void;
    new?: () => void;
    open?: () => void;
    zoomIn?: () => void;
    zoomOut?: () => void;
    zoomReset?: () => void;
    startComment?: () => void;
  }>({});

  // Handle table insert from toolbar
  const handleInsertTable = useCallback(
    (rows: number, columns: number) => {
      const view = getActiveEditorView();
      if (!view) return;
      insertTable(rows, columns)(view.state, view.dispatch);
      focusActiveEditor();
    },
    [getActiveEditorView, focusActiveEditor]
  );

  // Paint format (format painter): toggle armed state. If already armed,
  // disarm. Otherwise capture the current cursor's mark set; the next
  // selection-change with a non-empty selection will apply them.
  const handleTogglePaintFormat = useCallback(() => {
    if (paintFormatMarksRef.current) {
      setPaintFormatMarks(null);
      return;
    }
    const view = pagedEditorRef.current?.getView();
    if (!view) return;
    const { selection, storedMarks } = view.state;
    let marks: readonly PMMark[];
    if (storedMarks && storedMarks.length > 0) {
      marks = storedMarks;
    } else if (!selection.empty) {
      // Take marks from the first character of the range.
      const $pos = view.state.doc.resolve(selection.from + 1);
      marks = $pos.marks();
    } else {
      marks = selection.$from.marks();
    }
    setPaintFormatMarks(marks);
  }, []);

  // Apply painted marks to a non-empty selection, then disarm.
  const applyPaintedMarks = useCallback((from: number, to: number) => {
    const marks = paintFormatMarksRef.current;
    if (!marks) return;
    const view = pagedEditorRef.current?.getView();
    if (!view) return;
    let tr = view.state.tr;
    // Clear ALL existing marks on the range first, then add the captured
    // set. This is what Docs/Word do — paint format replaces, not merges.
    const allMarkTypes = Object.values(view.state.schema.marks);
    for (const mt of allMarkTypes) {
      tr = tr.removeMark(from, to, mt);
    }
    for (const m of marks) {
      tr = tr.addMark(from, to, m);
    }
    view.dispatch(tr);
    setPaintFormatMarks(null);
  }, []);

  // Cancel paint-format on Escape.
  useEffect(() => {
    if (!paintFormatMarks) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPaintFormatMarks(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [paintFormatMarks]);

  // Start the add-comment flow from a toolbar/menu trigger (mirrors the
  // floating "+" button + context-menu addComment paths). Selection
  // must be non-empty; when empty, the toolbar button is disabled.
  const handleStartAddComment = useCallback(() => {
    const view = pagedEditorRef.current?.getView();
    if (!view) return;
    const { from, to } = view.state.selection;
    if (from === to) return;
    const yPos = findSelectionYPosition(scrollContainerRef.current, editorContentRef.current, from);
    setCommentSelectionRange({ from, to });
    const pendingMark = view.state.schema.marks.comment.create({
      commentId: PENDING_COMMENT_ID,
    });
    const tr = view.state.tr.addMark(from, to, pendingMark);
    tr.setSelection(TextSelection.create(tr.doc, to));
    view.dispatch(tr);
    setAddCommentYPosition(yPos);
    setShowCommentsSidebar(true);
    setIsAddingComment(true);
    setFloatingCommentBtn(null);
  }, []);

  // Insert a page break at cursor
  const handleInsertPageBreak = useCallback(() => {
    const view = getActiveEditorView();
    if (!view) return;
    insertPageBreak(view.state, view.dispatch);
    focusActiveEditor();
  }, [getActiveEditorView, focusActiveEditor]);

  // Open the Character Spacing dialog with attrs harvested from the
  // current selection's characterSpacing mark (or zeros if absent).
  const handleOpenCharacterSpacing = useCallback(() => {
    const view = getActiveEditorView();
    if (!view) return;
    const markType = view.state.schema.marks['characterSpacing'];
    const initial = { scale: null, spacing: null, position: null, kerning: null } as {
      scale: number | null;
      spacing: number | null;
      position: number | null;
      kerning: number | null;
    };
    if (markType) {
      const { from, to, empty } = view.state.selection;
      let attrs: Record<string, unknown> | null = null;
      if (empty) {
        const stored = view.state.storedMarks ?? view.state.selection.$from.marks();
        const m = stored.find((mk) => mk.type === markType);
        if (m) attrs = m.attrs;
      } else {
        view.state.doc.nodesBetween(from, to, (node) => {
          if (attrs) return false;
          const m = node.marks.find((mk) => mk.type === markType);
          if (m) attrs = m.attrs;
          return true;
        });
      }
      if (attrs) {
        const a = attrs as Record<string, number | null | undefined>;
        initial.scale = a.scale ?? null;
        initial.spacing = a.spacing ?? null;
        initial.position = a.position ?? null;
        initial.kerning = a.kerning ?? null;
      }
    }
    setCharacterSpacingInitial(initial);
    setCharacterSpacingDialogOpen(true);
  }, [getActiveEditorView]);

  const handleSubmitCharacterSpacing = useCallback(
    (value: CharacterAttrs) => {
      const view = getActiveEditorView();
      if (!view) return;
      setCharacterAttrs(value)(view.state, view.dispatch);
      focusActiveEditor();
    },
    [getActiveEditorView, focusActiveEditor]
  );

  // Open the Paragraph dialog with the cursor paragraph's current attrs.
  const handleOpenParagraphDialog = useCallback(() => {
    setParagraphDialogOpen(true);
  }, []);

  // Open the Borders & Shading dialog. Harvest the current paragraph's
  // borders/shading attrs from the live PM doc at open time so existing
  // values appear in the dialog (Word's behaviour).
  const handleOpenBordersShading = useCallback(() => {
    const view = getActiveEditorView();
    const initial: typeof bordersShadingInitial = {
      borders: {},
      shading: { fillHex: '', pattern: 'clear', patternColorHex: '' },
    };
    if (view) {
      const { $from } = view.state.selection;
      let para = $from.parent;
      // Walk up to nearest paragraph if cursor is deeper.
      for (let d = $from.depth; d > 0 && para.type.name !== 'paragraph'; d--) {
        para = $from.node(d - 1);
      }
      if (para.type.name === 'paragraph') {
        const attrs = para.attrs as {
          borders?: Record<string, { style?: string; color?: { rgb?: string }; size?: number }>;
          shading?: { fill?: { rgb?: string }; color?: { rgb?: string }; pattern?: string };
        };
        if (attrs.borders) {
          const b = attrs.borders;
          (['top', 'bottom', 'left', 'right'] as const).forEach((side) => {
            const spec = b[side];
            if (spec && spec.style && spec.style !== 'none' && spec.style !== 'nil') {
              const known = ['single', 'double', 'dotted', 'dashed', 'thick', 'triple'];
              const style = known.includes(spec.style)
                ? (spec.style as 'single' | 'double' | 'dotted' | 'dashed' | 'thick' | 'triple')
                : 'single';
              (initial.borders as Record<string, unknown>)[side] = {
                style,
                colorHex: (spec.color?.rgb || '000000').toUpperCase(),
                size: spec.size ?? 4,
              };
            }
          });
        }
        if (attrs.shading) {
          const s = attrs.shading;
          initial.shading = {
            fillHex: (s.fill?.rgb || '').toUpperCase(),
            pattern: (s.pattern as typeof initial.shading.pattern) || 'clear',
            patternColorHex: (s.color?.rgb || '').toUpperCase(),
          };
        }
      }
    }
    setBordersShadingInitial(initial);
    setBordersShadingOpen(true);
  }, [getActiveEditorView]);

  // Convert dialog value into OOXML-shaped paragraph attrs and dispatch.
  const handleSubmitBordersShading = useCallback(
    (v: BordersAndShadingValue) => {
      const view = getActiveEditorView();
      if (!view) return;
      const sides = ['top', 'bottom', 'left', 'right'] as const;
      const borders: Record<string, unknown> = {};
      let anyBorder = false;
      for (const side of sides) {
        const spec = (
          v.borders as Record<string, { style: string; colorHex: string; size: number }>
        )[side];
        if (spec) {
          anyBorder = true;
          borders[side] = {
            style: spec.style,
            color: spec.colorHex ? { rgb: spec.colorHex } : undefined,
            size: spec.size,
          };
        }
      }
      const shadingHasFill = !!v.shading.fillHex;
      const shadingHasPattern = v.shading.pattern !== 'clear';
      const shadingHasPatternColor = !!v.shading.patternColorHex;
      const shading =
        shadingHasFill || shadingHasPattern || shadingHasPatternColor
          ? {
              fill: shadingHasFill ? { rgb: v.shading.fillHex } : undefined,
              color: shadingHasPatternColor ? { rgb: v.shading.patternColorHex } : undefined,
              pattern: v.shading.pattern,
            }
          : null;
      setParagraphAttrs({
        borders: anyBorder ? borders : null,
        shading,
      })(view.state, view.dispatch);
      focusActiveEditor();
    },
    [getActiveEditorView, focusActiveEditor]
  );

  // Insert an inline OOXML field node (PAGE / NUMPAGES / DATE / TIME /
  // CREATEDATE / SAVEDATE / AUTHOR / FILENAME) at the cursor. The
  // header/footer flow is the primary use; body insertion also works
  // (Word renders PAGE in body the same way). The round-trip through
  // parser+serializer is locked in by footer-field-roundtrip.test.ts.
  const handleInsertField = useCallback(
    (fieldType: InsertableFieldType) => {
      const view = getActiveEditorView();
      if (!view) return;
      insertField(fieldType)(view.state, view.dispatch);
      focusActiveEditor();
    },
    [getActiveEditorView, focusActiveEditor]
  );

  // Insert a section break of the given OOXML type. Section breaks
  // are a stronger structural divider than page breaks — they let
  // the next section have its own page-size / margins / columns /
  // headers + footers. `nextPage` matches Word's default; the
  // other three (`continuous` / `evenPage` / `oddPage`) cover the
  // less-common section-control cases.
  const handleInsertSectionBreak = useCallback(
    (breakType: 'nextPage' | 'continuous' | 'oddPage' | 'evenPage') => {
      const view = getActiveEditorView();
      if (!view) return;
      insertSectionBreak(breakType)(view.state, view.dispatch);
      focusActiveEditor();
    },
    [getActiveEditorView, focusActiveEditor]
  );

  const handleInsertHorizontalRule = useCallback(() => {
    const view = getActiveEditorView();
    if (!view) return;
    insertHorizontalRule(view.state, view.dispatch);
    focusActiveEditor();
  }, [getActiveEditorView, focusActiveEditor]);

  // Insert a footnote ref at the cursor. The id is "next free integer"
  // computed by scanning existing footnoteRef marks in the doc.
  const handleInsertFootnote = useCallback(() => {
    const view = getActiveEditorView();
    if (!view) return;
    let maxId = 0;
    view.state.doc.descendants((node) => {
      if (!node.isText) return;
      for (const m of node.marks) {
        if (m.type.name === 'footnoteRef') {
          const id = Number(m.attrs.id);
          if (Number.isFinite(id) && id > maxId) maxId = id;
        }
      }
    });
    insertFootnote(maxId + 1)(view.state, view.dispatch);
    focusActiveEditor();
  }, [getActiveEditorView, focusActiveEditor]);

  const handleOpenInsertSymbol = useCallback(() => setInsertSymbolOpen(true), []);

  const handleToggleShowRuler = useCallback(() => {
    setShowRulerLocal((prev) => !(prev ?? showRuler));
  }, [showRuler]);

  // F6 — View → Show non-printing characters. Persist across sessions so
  // the preference survives a reload, matching how Google Docs / Word
  // remember the formatting-marks toggle.
  const [showFormattingMarks, setShowFormattingMarks] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem('docx-editor-show-marks') === '1';
    } catch {
      return false;
    }
  });
  const handleToggleShowFormattingMarks = useCallback(() => {
    setShowFormattingMarks((prev) => {
      const next = !prev;
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('docx-editor-show-marks', next ? '1' : '0');
        }
      } catch {
        // Quota / private mode — toggle still works in-memory.
      }
      return next;
    });
  }, []);

  const handleInsertSymbol = useCallback(
    (symbol: string) => {
      const view = getActiveEditorView();
      if (!view) return;
      view.dispatch(view.state.tr.insertText(symbol));
      setInsertSymbolOpen(false);
      focusActiveEditor();
    },
    [getActiveEditorView, focusActiveEditor]
  );

  // Insert a table of contents at cursor
  const handleInsertTOC = useCallback(() => {
    const view = getActiveEditorView();
    if (!view) return;
    generateTOC(view.state, view.dispatch);
    focusActiveEditor();
  }, [getActiveEditorView, focusActiveEditor]);

  // Toggle document outline sidebar
  const handleToggleOutline = useCallback(() => {
    setShowOutline((prev) => {
      if (!prev) {
        // Opening: collect headings immediately
        const view = pagedEditorRef.current?.getView();
        if (view) {
          setHeadingInfos(collectHeadings(view.state.doc));
        }
      }
      return !prev;
    });
  }, []);

  // Navigate to a heading from the outline
  const handleHeadingInfoClick = useCallback((pmPos: number) => {
    pagedEditorRef.current?.scrollToPosition(pmPos);
    // Also set selection to the heading
    pagedEditorRef.current?.setSelection(pmPos + 1);
    pagedEditorRef.current?.focus();
  }, []);

  // Trigger file picker for image insert
  const handleInsertImageClick = useCallback(() => {
    imageInputRef.current?.click();
  }, []);

  // Handle file selection for image insert
  const handleImageFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const view = getActiveEditorView();
      if (!view) return;

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;

        // Create an Image element to get natural dimensions
        const img = new Image();
        img.onload = () => {
          let width = img.naturalWidth;
          let height = img.naturalHeight;

          // Constrain to reasonable max width (content area of US Letter page at 96dpi)
          const maxWidth = 612; // ~6.375 inches
          if (width > maxWidth) {
            const scale = maxWidth / width;
            width = maxWidth;
            height = Math.round(height * scale);
          }

          const rId = `rId_img_${Date.now()}`;
          const imageNode = view.state.schema.nodes.image.create({
            src: dataUrl,
            alt: file.name,
            width,
            height,
            rId,
            wrapType: 'inline',
            displayMode: 'inline',
          });

          const { from } = view.state.selection;
          const tr = view.state.tr.insert(from, imageNode);
          view.dispatch(tr.scrollIntoView());
          focusActiveEditor();
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);

      // Reset the input so the same file can be selected again
      e.target.value = '';
    },
    [getActiveEditorView, focusActiveEditor]
  );

  // Handle shape insertion
  // Handle image wrap type change
  const handleImageWrapType = useCallback(
    (toolbarValue: string) => {
      const view = getActiveEditorView();
      if (!view || !state.pmImageContext) return;
      const pos = state.pmImageContext.pos;
      const node = view.state.doc.nodeAt(pos);
      if (!node || node.type.name !== 'image') return;

      // Translate the toolbar's legacy vocabulary into the PM command's
      // `ImageLayoutTarget` so the toolbar and the right-click menu share
      // `setImageWrapType` and its `resolveAnchorAttrs` taxonomy. The mapping
      // lives in core so the Vue adapter doesn't have to duplicate it.
      const target = toolbarValueToLayoutTarget(toolbarValue);
      if (!target) return;

      // For inline → anchor, capture the inline glyph's rendered offset so
      // the new float lands at the same X/Y (Word's behavior). The core
      // helper handles the zoom + EMU conversion uniformly.
      let opts: { initialPositionEmu?: { horizontalEmu: number; verticalEmu: number } } | undefined;
      if (node.attrs.wrapType === 'inline' && target !== 'inline') {
        const inlineEl = document.querySelector(
          `.layout-run-image[data-pm-start="${pos}"]`
        ) as HTMLElement | null;
        const captured = inlineEl ? captureInlinePositionEmu(inlineEl, state.zoom) : undefined;
        if (captured) opts = { initialPositionEmu: captured };
      }

      setImageWrapType(pos, target, opts)(view.state, view.dispatch);
      focusActiveEditor();
    },
    [getActiveEditorView, focusActiveEditor, state.pmImageContext, state.zoom]
  );

  // Handle image transform (rotate/flip)
  const handleImageTransform = useCallback(
    (action: 'rotateCW' | 'rotateCCW' | 'flipH' | 'flipV') => {
      const view = getActiveEditorView();
      if (!view || !state.pmImageContext) return;

      const pos = state.pmImageContext.pos;
      const node = view.state.doc.nodeAt(pos);
      if (!node || node.type.name !== 'image') return;

      const currentTransform = (node.attrs.transform as string) || '';

      // Parse current rotation and flip state
      const rotateMatch = currentTransform.match(/rotate\((-?\d+(?:\.\d+)?)deg\)/);
      let rotation = rotateMatch ? parseFloat(rotateMatch[1]) : 0;
      let hasFlipH = /scaleX\(-1\)/.test(currentTransform);
      let hasFlipV = /scaleY\(-1\)/.test(currentTransform);

      switch (action) {
        case 'rotateCW':
          rotation = (rotation + 90) % 360;
          break;
        case 'rotateCCW':
          rotation = (rotation - 90 + 360) % 360;
          break;
        case 'flipH':
          hasFlipH = !hasFlipH;
          break;
        case 'flipV':
          hasFlipV = !hasFlipV;
          break;
      }

      // Build new transform string
      const parts: string[] = [];
      if (rotation !== 0) parts.push(`rotate(${rotation}deg)`);
      if (hasFlipH) parts.push('scaleX(-1)');
      if (hasFlipV) parts.push('scaleY(-1)');
      const newTransform = parts.length > 0 ? parts.join(' ') : null;

      const tr = view.state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        transform: newTransform,
      });
      view.dispatch(tr.scrollIntoView());
      focusActiveEditor();
    },
    [getActiveEditorView, focusActiveEditor, state.pmImageContext]
  );

  // Apply image position changes
  const handleApplyImagePosition = useCallback(
    (data: ImagePositionData) => {
      const view = getActiveEditorView();
      if (!view || !state.pmImageContext) return;

      const pos = state.pmImageContext.pos;
      const node = view.state.doc.nodeAt(pos);
      if (!node || node.type.name !== 'image') return;

      const tr = view.state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        position: {
          horizontal: data.horizontal,
          vertical: data.vertical,
        },
        distTop: data.distTop ?? node.attrs.distTop,
        distBottom: data.distBottom ?? node.attrs.distBottom,
        distLeft: data.distLeft ?? node.attrs.distLeft,
        distRight: data.distRight ?? node.attrs.distRight,
      });
      view.dispatch(tr.scrollIntoView());
      focusActiveEditor();
    },
    [getActiveEditorView, focusActiveEditor, state.pmImageContext]
  );

  // Open image properties dialog
  const handleOpenImageProperties = useCallback(() => {
    setImagePropsOpen(true);
  }, []);

  // Apply image properties (alt text + border)
  const handleApplyImageProperties = useCallback(
    (data: ImagePropertiesData) => {
      const view = getActiveEditorView();
      if (!view || !state.pmImageContext) return;

      const pos = state.pmImageContext.pos;
      const node = view.state.doc.nodeAt(pos);
      if (!node || node.type.name !== 'image') return;

      const tr = view.state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        alt: data.alt ?? null,
        borderWidth: data.borderWidth ?? null,
        borderColor: data.borderColor ?? null,
        borderStyle: data.borderStyle ?? null,
      });
      view.dispatch(tr.scrollIntoView());
      focusActiveEditor();
    },
    [getActiveEditorView, focusActiveEditor, state.pmImageContext]
  );

  // Handle footnote/endnote properties update
  const handleApplyFootnoteProperties = useCallback(
    (
      footnotePr: import('@eigenpal/docx-core/types/document').FootnoteProperties,
      endnotePr: import('@eigenpal/docx-core/types/document').EndnoteProperties
    ) => {
      if (!history.state?.package) return;
      const newDoc = {
        ...history.state.package.document,
        finalSectionProperties: {
          ...history.state.package.document.finalSectionProperties,
          footnotePr,
          endnotePr,
        },
      };
      pushDocument({
        ...history.state,
        package: {
          ...history.state.package,
          document: newDoc,
        },
      });
    },
    [history, pushDocument]
  );

  const openSplitCellDialog = useCallback(() => {
    const view = getActiveEditorView();
    const pmConfig = view ? getSplitCellDialogConfig(view.state) : null;
    const legacyConfig = pmConfig ? null : tableSelection.getSplitCellConfig();
    const config = pmConfig ?? legacyConfig;
    if (!config) return;

    setSplitCellDialogState({
      isOpen: true,
      ...config,
      source: pmConfig ? 'pm' : 'legacy',
      capturedCellRow: pmConfig?.capturedCellRow ?? null,
      capturedCellCol: pmConfig?.capturedCellCol ?? null,
    });
  }, [getActiveEditorView, tableSelection]);

  // Handle table action from Toolbar - use ProseMirror commands
  const handleTableAction = useCallback(
    (action: TableAction) => {
      const view = getActiveEditorView();
      if (!view) {
        if (action === 'splitCell') {
          openSplitCellDialog();
        } else if (typeof action !== 'object') {
          tableSelection.handleAction(action);
        }
        return;
      }

      switch (action) {
        case 'addRowAbove':
          addRowAbove(view.state, view.dispatch);
          break;
        case 'addRowBelow':
          addRowBelow(view.state, view.dispatch);
          break;
        case 'addColumnLeft':
          addColumnLeft(view.state, view.dispatch);
          break;
        case 'addColumnRight':
          addColumnRight(view.state, view.dispatch);
          break;
        case 'deleteRow':
          pmDeleteRow(view.state, view.dispatch);
          break;
        case 'deleteColumn':
          pmDeleteColumn(view.state, view.dispatch);
          break;
        case 'deleteTable':
          pmDeleteTable(view.state, view.dispatch);
          break;
        case 'selectTable':
          pmSelectTable(view.state, view.dispatch);
          break;
        case 'selectRow':
          pmSelectRow(view.state, view.dispatch);
          break;
        case 'selectColumn':
          pmSelectColumn(view.state, view.dispatch);
          break;
        case 'mergeCells':
          pmMergeCells(view.state, view.dispatch);
          break;
        case 'splitCell':
          openSplitCellDialog();
          break;
        // Border actions — use current border spec from toolbar
        case 'borderAll':
          setAllTableBorders(view.state, view.dispatch, borderSpecRef.current);
          break;
        case 'borderOutside':
          setOutsideTableBorders(view.state, view.dispatch, borderSpecRef.current);
          break;
        case 'borderInside':
          setInsideTableBorders(view.state, view.dispatch, borderSpecRef.current);
          break;
        case 'borderNone':
          removeTableBorders(view.state, view.dispatch);
          break;
        // Per-side border actions (use current border spec)
        case 'borderTop':
          setCellBorder('top', borderSpecRef.current, true)(view.state, view.dispatch);
          break;
        case 'borderBottom':
          setCellBorder('bottom', borderSpecRef.current, true)(view.state, view.dispatch);
          break;
        case 'borderLeft':
          setCellBorder('left', borderSpecRef.current, true)(view.state, view.dispatch);
          break;
        case 'borderRight':
          setCellBorder('right', borderSpecRef.current, true)(view.state, view.dispatch);
          break;
        default:
          // Handle complex actions (with parameters)
          if (typeof action === 'object') {
            if (action.type === 'cellFillColor') {
              setCellFillColor(action.color)(view.state, view.dispatch);
            } else if (action.type === 'borderColor') {
              const rgb = action.color.replace(/^#/, '');
              borderSpecRef.current = { ...borderSpecRef.current, color: { rgb } };
              setTableBorderColor(action.color)(view.state, view.dispatch);
            } else if (action.type === 'borderWidth') {
              borderSpecRef.current = { ...borderSpecRef.current, size: action.size };
              setTableBorderWidth(action.size)(view.state, view.dispatch);
            } else if (action.type === 'cellBorder') {
              setCellBorder(action.side, {
                style: action.style,
                size: action.size,
                color: { rgb: action.color.replace(/^#/, '') },
              })(view.state, view.dispatch);
            } else if (action.type === 'cellVerticalAlign') {
              setCellVerticalAlign(action.align)(view.state, view.dispatch);
            } else if (action.type === 'cellMargins') {
              setCellMargins(action.margins)(view.state, view.dispatch);
            } else if (action.type === 'cellTextDirection') {
              setCellTextDirection(action.direction)(view.state, view.dispatch);
            } else if (action.type === 'toggleNoWrap') {
              toggleNoWrap()(view.state, view.dispatch);
            } else if (action.type === 'rowHeight') {
              setRowHeight(action.height, action.rule)(view.state, view.dispatch);
            } else if (action.type === 'toggleHeaderRow') {
              toggleHeaderRow()(view.state, view.dispatch);
            } else if (action.type === 'distributeColumns') {
              distributeColumns()(view.state, view.dispatch);
            } else if (action.type === 'distributeRows') {
              distributeRows()(view.state, view.dispatch);
            } else if (action.type === 'sortTable') {
              sortTable(action.direction)(view.state, view.dispatch);
            } else if (action.type === 'autoFitContents') {
              autoFitContents()(view.state, view.dispatch);
            } else if (action.type === 'autoFitWindow') {
              autoFitWindow()(view.state, view.dispatch);
            } else if (action.type === 'openTableProperties') {
              setTablePropsOpen(true);
            } else if (action.type === 'tableProperties') {
              setTableProperties(action.props)(view.state, view.dispatch);
            } else if (action.type === 'applyTableStyle') {
              // Resolve style data from built-in presets or document styles
              let preset: TableStylePreset | undefined = getBuiltinTableStyle(action.styleId);
              const currentDocForTable = historyStateRef.current;
              if (!preset && currentDocForTable?.package.styles) {
                const styleResolver = getCachedStyleResolver(currentDocForTable.package.styles);
                const docStyle = styleResolver.getStyle(action.styleId);
                if (docStyle) {
                  // Convert to preset inline (same as documentStyleToPreset)
                  preset = { id: docStyle.styleId, name: docStyle.name ?? docStyle.styleId };
                  if (docStyle.tblPr?.borders) {
                    const b = docStyle.tblPr.borders;
                    preset.tableBorders = {};
                    for (const side of [
                      'top',
                      'bottom',
                      'left',
                      'right',
                      'insideH',
                      'insideV',
                    ] as const) {
                      const bs = b[side];
                      if (bs) {
                        preset.tableBorders[side] = {
                          style: bs.style,
                          size: bs.size,
                          color: bs.color?.rgb ? { rgb: bs.color.rgb } : undefined,
                        };
                      }
                    }
                  }
                  if (docStyle.tblStylePr) {
                    preset.conditionals = {};
                    for (const cond of docStyle.tblStylePr) {
                      const entry: Record<string, unknown> = {};
                      if (cond.tcPr?.shading?.fill)
                        entry.backgroundColor = `#${cond.tcPr.shading.fill}`;
                      if (cond.tcPr?.borders) {
                        const borders: Record<string, unknown> = {};
                        for (const s of ['top', 'bottom', 'left', 'right'] as const) {
                          const bs2 = cond.tcPr.borders[s];
                          if (bs2)
                            borders[s] = {
                              style: bs2.style,
                              size: bs2.size,
                              color: bs2.color?.rgb ? { rgb: bs2.color.rgb } : undefined,
                            };
                        }
                        entry.borders = borders;
                      }
                      if (cond.rPr?.bold) entry.bold = true;
                      if (cond.rPr?.color?.rgb) entry.color = `#${cond.rPr.color.rgb}`;
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      (preset.conditionals as any)[cond.type] = entry;
                    }
                  }
                  preset.look = { firstRow: true, lastRow: false, noHBand: false, noVBand: true };
                }
              }
              if (preset) {
                applyTableStyle({
                  styleId: preset.id,
                  tableBorders: preset.tableBorders,
                  conditionals: preset.conditionals,
                  look: preset.look,
                })(view.state, view.dispatch);
              }
            }
          } else {
            // Fallback to legacy table selection handler for other actions
            tableSelection.handleAction(action);
          }
      }

      focusActiveEditor();
    },
    [tableSelection, getActiveEditorView, focusActiveEditor, openSplitCellDialog]
  );

  // Context menu handler. Body content has its own context-menu plumbing
  // wired through PagedEditor (handleContextMenu below), so we early-out
  // when the right-click landed in the body's pages region — *unless* the
  // inline HF editor is open, in which case we need to show the menu for
  // the HF view since body's plumbing won't fire for HF clicks.
  const handleEditorContextMenu = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('.paged-editor__pages') && !target.closest('.hf-inline-editor')) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const view = getActiveEditorView();
      const tableContext = view ? getTableContext(view.state) : { isInTable: false };
      const { from, to } = view?.state.selection ?? { from: 0, to: 0 };
      const hasSel = from !== to;
      setContextMenu({
        isOpen: true,
        position: { x: e.clientX, y: e.clientY },
        hasSelection: hasSel,
        cursorInTable: tableContext.isInTable,
        tableContext: tableContext.isInTable ? tableContext : null,
      });
    },
    [getActiveEditorView]
  );

  // Handle formatting action from toolbar
  const handleFormat = useCallback(
    (action: FormattingAction) => {
      const view = getActiveEditorView();
      if (!view) return;

      // Focus editor first to ensure we can dispatch commands
      view.focus();

      // Restore selection if it was lost during toolbar interaction
      // This happens when user clicks on dropdown menus (font picker, style picker, etc.)
      // Only restore for the body editor — HF editor manages its own selection
      const isBodyEditor = view === pagedEditorRef.current?.getView();
      const { from, to } = view.state.selection;
      const savedSelection = lastSelectionRef.current;

      if (
        isBodyEditor &&
        savedSelection &&
        (from !== savedSelection.from || to !== savedSelection.to)
      ) {
        // Selection was lost (focus moved to dropdown portal) - restore it
        try {
          const tr = view.state.tr.setSelection(
            TextSelection.create(view.state.doc, savedSelection.from, savedSelection.to)
          );
          view.dispatch(tr);
        } catch (e) {
          // If restoration fails (e.g., positions are invalid after doc change), continue with current selection
          console.warn('Could not restore selection:', e);
        }
      }

      // Handle simple toggle actions
      if (action === 'bold') {
        toggleBold(view.state, view.dispatch);
        return;
      }
      if (action === 'italic') {
        toggleItalic(view.state, view.dispatch);
        return;
      }
      if (action === 'underline') {
        toggleUnderline(view.state, view.dispatch);
        return;
      }
      if (action === 'strikethrough') {
        toggleStrike(view.state, view.dispatch);
        return;
      }
      if (action === 'superscript') {
        toggleSuperscript(view.state, view.dispatch);
        return;
      }
      if (action === 'subscript') {
        toggleSubscript(view.state, view.dispatch);
        return;
      }
      if (action === 'bulletList') {
        toggleBulletList(view.state, view.dispatch);
        return;
      }
      if (action === 'numberedList') {
        toggleNumberedList(view.state, view.dispatch);
        return;
      }
      if (action === 'indent') {
        // Try list indent first, then paragraph indent
        if (!increaseListLevel(view.state, view.dispatch)) {
          increaseIndent()(view.state, view.dispatch);
        }
        return;
      }
      if (action === 'outdent') {
        // Try list outdent first, then paragraph outdent
        if (!decreaseListLevel(view.state, view.dispatch)) {
          decreaseIndent()(view.state, view.dispatch);
        }
        return;
      }
      if (action === 'clearFormatting') {
        clearFormatting(view.state, view.dispatch);
        return;
      }
      if (action === 'setRtl') {
        setRtl(view.state, view.dispatch);
        return;
      }
      if (action === 'setLtr') {
        setLtr(view.state, view.dispatch);
        return;
      }
      if (action === 'selectAll') {
        const { doc } = view.state;
        const tr = view.state.tr.setSelection(TextSelection.create(doc, 0, doc.content.size));
        view.dispatch(tr);
        return;
      }
      if (action === 'toggleSmallCaps') {
        toggleSmallCaps(view.state, view.dispatch);
        return;
      }
      if (action === 'toggleAllCaps') {
        toggleAllCaps(view.state, view.dispatch);
        return;
      }
      if (action === 'toggleHidden') {
        toggleHidden(view.state, view.dispatch);
        return;
      }
      if (action === 'toggleEmboss') {
        toggleEmboss(view.state, view.dispatch);
        return;
      }
      if (action === 'toggleImprint') {
        toggleImprint(view.state, view.dispatch);
        return;
      }
      if (action === 'toggleTextShadow') {
        toggleTextShadow(view.state, view.dispatch);
        return;
      }
      if (action === 'toggleTextOutline') {
        toggleTextOutline(view.state, view.dispatch);
        return;
      }
      if (action === 'restartListNumbering') {
        restartListNumbering(view.state, view.dispatch);
        return;
      }
      if (action === 'continueListNumbering') {
        continueListNumbering(view.state, view.dispatch);
        return;
      }
      if (action === 'insertLink') {
        // Get the selected text for the hyperlink dialog
        const selectedText = getSelectedText(view.state);
        // Check if we're editing an existing link
        const existingLink = getHyperlinkAttrs(view.state);
        if (existingLink) {
          hyperlinkDialog.openEdit({
            url: existingLink.href,
            displayText: selectedText,
            tooltip: existingLink.tooltip,
          });
        } else {
          hyperlinkDialog.openInsert(selectedText);
        }
        return;
      }

      // Handle object-based actions
      if (typeof action === 'object') {
        switch (action.type) {
          case 'alignment':
            setAlignment(action.value)(view.state, view.dispatch);
            break;
          case 'textColor': {
            // action.value can be a ColorValue object or a string like "#FF0000"
            const colorVal = action.value;
            if (typeof colorVal === 'string') {
              setTextColor({ rgb: colorVal.replace('#', '') })(view.state, view.dispatch);
            } else if (colorVal.auto) {
              // "Automatic" — remove text color
              clearTextColor(view.state, view.dispatch);
            } else {
              setTextColor(colorVal)(view.state, view.dispatch);
            }
            break;
          }
          case 'highlightColor': {
            // Convert hex to OOXML named highlight value (e.g., 'FFFF00' → 'yellow')
            const highlightName = action.value ? mapHexToHighlightName(action.value) : '';
            setHighlight(highlightName || action.value)(view.state, view.dispatch);
            break;
          }
          case 'fontSize':
            // Convert points to half-points (OOXML uses half-points for font sizes)
            setFontSize(pointsToHalfPoints(action.value))(view.state, view.dispatch);
            break;
          case 'fontFamily':
            setFontFamily(action.value)(view.state, view.dispatch);
            break;
          case 'lineSpacing':
            setLineSpacing(action.value)(view.state, view.dispatch);
            break;
          case 'spaceBefore':
            setSpaceBefore(action.value)(view.state, view.dispatch);
            break;
          case 'spaceAfter':
            setSpaceAfter(action.value)(view.state, view.dispatch);
            break;
          case 'charSpacing':
            setCharacterSpacing(action.value)(view.state, view.dispatch);
            break;
          case 'keepNext':
          case 'keepLines':
          case 'pageBreakBefore':
          case 'widowControl':
            setParagraphAttrs({ [action.type]: action.value })(view.state, view.dispatch);
            break;
          case 'applyStyle': {
            // Resolve style to get its formatting properties
            // Use ref to avoid stale closure (handleFormat has [] deps)
            const currentDoc = historyStateRef.current;
            const styleResolver = currentDoc?.package.styles
              ? getCachedStyleResolver(currentDoc.package.styles)
              : null;

            if (styleResolver) {
              const resolved = styleResolver.resolveParagraphStyle(action.value);
              applyStyle(action.value, {
                paragraphFormatting: resolved.paragraphFormatting,
                runFormatting: resolved.runFormatting,
              })(view.state, view.dispatch);
            } else {
              // No styles available, just set the styleId
              applyStyle(action.value)(view.state, view.dispatch);
            }
            break;
          }
        }
      }
    },
    [getActiveEditorView, openSplitCellDialog]
  );

  const handleSplitCellDialogClose = useCallback(() => {
    setSplitCellDialogState((prev) => ({
      ...prev,
      isOpen: false,
      source: null,
      capturedCellRow: null,
      capturedCellCol: null,
    }));
  }, []);

  const handleSplitCellDialogApply = useCallback(
    (rows: number, cols: number) => {
      if (splitCellDialogState.source === 'legacy') {
        tableSelection.applySplitCell(rows, cols);
        focusActiveEditor();
        return;
      }

      const view = getActiveEditorView();
      if (!view) return;
      splitActiveTableCell(
        view.state,
        view.dispatch,
        rows,
        cols,
        splitCellDialogState.capturedCellRow ?? undefined,
        splitCellDialogState.capturedCellCol ?? undefined
      );
      focusActiveEditor();
    },
    [
      focusActiveEditor,
      getActiveEditorView,
      splitCellDialogState.source,
      splitCellDialogState.capturedCellRow,
      splitCellDialogState.capturedCellCol,
      tableSelection,
    ]
  );

  // Handle zoom change
  const handleZoomChange = useCallback((zoom: number) => {
    setState((prev) => ({ ...prev, zoom }));
  }, []);

  // Handle hyperlink dialog submit
  const handleHyperlinkSubmit = useCallback(
    (data: HyperlinkData) => {
      const view = getActiveEditorView();
      if (!view) return;

      const url = data.url || '';
      const tooltip = data.tooltip;

      // Check if we have a selection
      const { empty } = view.state.selection;

      if (empty && data.displayText) {
        // No selection but display text provided - insert new linked text
        insertHyperlink(data.displayText, url, tooltip)(view.state, view.dispatch);
      } else if (!empty) {
        // Have selection - apply hyperlink to it
        setHyperlink(url, tooltip)(view.state, view.dispatch);
      } else if (data.displayText) {
        // Empty selection but display text provided
        insertHyperlink(data.displayText, url, tooltip)(view.state, view.dispatch);
      }

      hyperlinkDialog.close();
      focusActiveEditor();
    },
    [hyperlinkDialog, getActiveEditorView, focusActiveEditor]
  );

  // Shared: remove hyperlink mark and refocus editor
  const doRemoveHyperlink = useCallback(() => {
    const view = getActiveEditorView();
    if (!view) return;
    removeHyperlink(view.state, view.dispatch);
    focusActiveEditor();
  }, [getActiveEditorView, focusActiveEditor]);

  // Handle hyperlink removal (from dialog)
  const handleHyperlinkRemove = useCallback(() => {
    doRemoveHyperlink();
    hyperlinkDialog.close();
  }, [hyperlinkDialog, doRemoveHyperlink]);

  // Handle hyperlink popup (Google Docs-style)
  const handleHyperlinkClick = useCallback(
    (data: HyperlinkPopupData) => setHyperlinkPopupData(data),
    []
  );

  const handleHyperlinkPopupNavigate = useCallback((href: string) => {
    window.open(href, '_blank', 'noopener,noreferrer');
  }, []);

  const handleHyperlinkPopupCopy = useCallback((href: string) => {
    navigator.clipboard.writeText(href).catch(() => {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = href;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    });
  }, []);

  const handleHyperlinkPopupEdit = useCallback(
    (displayText: string, href: string) => {
      const view = getActiveEditorView();
      if (!view) return;

      // Find the full hyperlink mark range at current cursor position
      const hlType = view.state.schema.marks.hyperlink;
      if (!hlType) return;

      const { $from } = view.state.selection;
      const linkMark = $from.marks().find((m) => m.type === hlType);

      if (linkMark) {
        // Collect all contiguous text nodes with the same hyperlink mark
        const parent = $from.parent;
        const parentStart = $from.start();

        // Build ranges of consecutive hyperlink-marked nodes
        type Range = { start: number; end: number };
        const ranges: Range[] = [];
        let currentRange: Range | null = null;

        parent.forEach((node, offset) => {
          const nodeStart = parentStart + offset;
          const nodeEnd = nodeStart + node.nodeSize;
          const hlMark = node.isText
            ? node.marks.find((m) => m.type === hlType && m.attrs.href === linkMark.attrs.href)
            : null;

          if (hlMark) {
            if (currentRange) {
              currentRange.end = nodeEnd;
            } else {
              currentRange = { start: nodeStart, end: nodeEnd };
            }
          } else {
            if (currentRange) {
              ranges.push(currentRange);
              currentRange = null;
            }
          }
        });
        if (currentRange) ranges.push(currentRange);

        // Find the range that contains the cursor
        const cursorPos = $from.pos;
        const targetRange = ranges.find((r) => r.start <= cursorPos && cursorPos <= r.end);
        if (!targetRange) return;

        // Replace the text and mark
        const tr = view.state.tr;
        const newMark = hlType.create({ href, tooltip: linkMark.attrs.tooltip });
        const textNode = view.state.schema.text(displayText, [
          ...$from.marks().filter((m) => m.type !== hlType),
          newMark,
        ]);
        tr.replaceWith(targetRange.start, targetRange.end, textNode);
        view.dispatch(tr.scrollIntoView());
      }

      setHyperlinkPopupData(null);
      focusActiveEditor();
    },
    [getActiveEditorView, focusActiveEditor]
  );

  const handleHyperlinkPopupRemove = useCallback(() => {
    const view = getActiveEditorView();
    if (!view) return;

    const hlType = view.state.schema.marks.hyperlink;
    if (!hlType) return;

    const { $from } = view.state.selection;

    // Try $from.marks() first, then check the node after the cursor
    // (ProseMirror may not report marks at boundary positions)
    let linkMark = $from.marks().find((m) => m.type === hlType);
    if (!linkMark && $from.nodeAfter) {
      linkMark = $from.nodeAfter.marks.find((m) => m.type === hlType);
    }
    if (!linkMark && $from.nodeBefore) {
      linkMark = $from.nodeBefore.marks.find((m) => m.type === hlType);
    }

    // Fall back to searching by href from popup data
    if (!linkMark && hyperlinkPopupData) {
      const parent = $from.parent;
      parent.forEach((node) => {
        if (!linkMark && node.isText) {
          const m = node.marks.find(
            (mk) => mk.type === hlType && mk.attrs.href === hyperlinkPopupData.href
          );
          if (m) linkMark = m;
        }
      });
    }

    if (!linkMark) return;

    // Find contiguous range of nodes with matching hyperlink mark
    const parent = $from.parent;
    const parentStart = $from.start();
    type Range = { start: number; end: number };
    const ranges: Range[] = [];
    let currentRange: Range | null = null;

    parent.forEach((node, offset) => {
      const nodeStart = parentStart + offset;
      const nodeEnd = nodeStart + node.nodeSize;
      const hlMark = node.isText
        ? node.marks.find((m) => m.type === hlType && m.attrs.href === linkMark!.attrs.href)
        : null;

      if (hlMark) {
        if (currentRange) {
          currentRange.end = nodeEnd;
        } else {
          currentRange = { start: nodeStart, end: nodeEnd };
        }
      } else {
        if (currentRange) {
          ranges.push(currentRange);
          currentRange = null;
        }
      }
    });
    if (currentRange) ranges.push(currentRange);

    const cursorPos = $from.pos;
    const targetRange = ranges.find((r) => r.start <= cursorPos && cursorPos <= r.end);
    if (!targetRange) return;

    const tr = view.state.tr;
    tr.removeMark(targetRange.start, targetRange.end, hlType);
    view.dispatch(tr.scrollIntoView());

    setHyperlinkPopupData(null);
    focusActiveEditor();
    toast('Link removed');
  }, [getActiveEditorView, focusActiveEditor, hyperlinkPopupData]);

  const handleHyperlinkPopupClose = useCallback(() => {
    setHyperlinkPopupData(null);
  }, []);

  // Image-specific right-click menu state.
  const imageContextMenu = useImageContextMenu();

  // Right-click context menu handlers. Use the active view so the menu
  // reflects HF state when the inline editor is open.
  const handleContextMenu = useCallback(
    (data: {
      x: number;
      y: number;
      hasSelection: boolean;
      image?: {
        pos: number;
        wrapType: WrapType;
        cssFloat?: 'left' | 'right' | 'none' | null;
        inlinePositionEmu?: { horizontalEmu: number; verticalEmu: number };
      } | null;
      spellcheck?: { from: number; to: number; word: string } | null;
    }) => {
      // Spell-check hit takes priority over both image and text menus —
      // matches Word's behaviour where a misspelled word's right-click
      // menu pre-empts the standard one.
      if (data.spellcheck) {
        setSpellMenu({
          x: data.x,
          y: data.y,
          from: data.spellcheck.from,
          to: data.spellcheck.to,
          word: data.spellcheck.word,
          suggestions: suggestionsFor(data.spellcheck.word, 5),
        });
        return;
      }
      // Image right-click takes priority over the text context menu.
      if (data.image) {
        imageContextMenu.openForImage({
          x: data.x,
          y: data.y,
          wrapType: data.image.wrapType,
          cssFloat: data.image.cssFloat,
          pos: data.image.pos,
          inlinePositionEmu: data.image.inlinePositionEmu,
        });
        return;
      }
      const view = getActiveEditorView();
      const tableContext = view ? getTableContext(view.state) : { isInTable: false };
      setContextMenu({
        isOpen: true,
        position: data,
        hasSelection: data.hasSelection,
        cursorInTable: tableContext.isInTable,
        tableContext: tableContext.isInTable ? tableContext : null,
      });
    },
    [getActiveEditorView, imageContextMenu]
  );

  // Apply a spell-check suggestion: replace the misspelled span with
  // the picked word, preserving the marks on the first character of the
  // range so case/format don't disappear.
  const handlePickSpellSuggestion = useCallback(
    (suggestion: string) => {
      const view = getActiveEditorView();
      if (!view || !spellMenu) return;
      const { from, to } = spellMenu;
      const docSize = view.state.doc.content.size;
      const clampedFrom = Math.min(Math.max(from, 0), docSize);
      const clampedTo = Math.min(Math.max(to, clampedFrom), docSize);
      // Read the marks at the start of the misspelled word so the
      // replacement carries the same bold/italic/etc styling.
      const nodeAtFrom = view.state.doc.nodeAt(clampedFrom);
      const marks = nodeAtFrom?.marks ?? [];
      const replacementNode = view.state.schema.text(suggestion, marks);
      const tr = view.state.tr.replaceWith(clampedFrom, clampedTo, replacementNode);
      view.dispatch(tr);
      setSpellMenu(null);
    },
    [getActiveEditorView, spellMenu]
  );

  const handleIgnoreSpell = useCallback(() => {
    if (!spellMenu) return;
    ignoreWord(spellMenu.word);
    const view = getActiveEditorView();
    if (view) refreshSpellcheckDecorations(view);
    setSpellMenu(null);
  }, [getActiveEditorView, spellMenu]);

  const handleImageWrapApply = useCallback(
    (target: ImageLayoutTarget) => {
      const view = getActiveEditorView();
      if (!view || imageContextMenu.imagePos === null) return;
      // For inline → anchor, hand the captured EMU offset to the command so
      // the new float lands where the inline glyph used to sit.
      const opts = imageContextMenu.inlinePositionEmu
        ? { initialPositionEmu: imageContextMenu.inlinePositionEmu }
        : undefined;
      setImageWrapType(imageContextMenu.imagePos, target, opts)(view.state, view.dispatch);
    },
    [getActiveEditorView, imageContextMenu.imagePos, imageContextMenu.inlinePositionEmu]
  );

  // Text actions that ride along inside the image context menu — Word shows
  // Cut / Copy / Paste / Delete underneath the layout choices, so users don't
  // need to flip menus to do basic clipboard work on the selected image.
  const imageContextMenuTextActions = useMemo(
    () => [
      {
        action: 'cut' as TextContextAction,
        label: t('contextMenu.cut'),
        shortcut: t('contextMenu.cutShortcut'),
      },
      {
        action: 'copy' as TextContextAction,
        label: t('contextMenu.copy'),
        shortcut: t('contextMenu.copyShortcut'),
      },
      {
        action: 'paste' as TextContextAction,
        label: t('contextMenu.paste'),
        shortcut: t('contextMenu.pasteShortcut'),
        dividerAfter: true,
      },
      {
        action: 'delete' as TextContextAction,
        label: t('contextMenu.delete'),
        shortcut: t('contextMenu.deleteShortcut'),
      },
    ],
    [t]
  );

  const handleContextMenuClose = useCallback(() => {
    setContextMenu({
      isOpen: false,
      position: { x: 0, y: 0 },
      hasSelection: false,
      cursorInTable: false,
      tableContext: null,
    });
  }, []);

  // Writing-Assistant state. The right-click "Rewrite with AI" and
  // "Summarize with AI" menu entries only appear when the matching
  // feature is enabled AND a model is currently loaded — anything
  // else and the user would tap a menu item that errors immediately.
  const writerState = useWriterState();
  const aiRewriteReady =
    writerState.enabledFeatures.includes('tone') &&
    writerState.phase === 'ready' &&
    writerState.loadedModelId !== null;
  const aiSummarizeReady =
    writerState.enabledFeatures.includes('summarize-basic') &&
    writerState.phase === 'ready' &&
    writerState.loadedModelId !== null;

  const contextMenuItems = useMemo((): TextContextMenuItem[] => {
    const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
    const mod = isMac ? '⌘' : 'Ctrl';
    const items: TextContextMenuItem[] = [
      { action: 'cut', label: 'Cut', shortcut: `${mod}+X` },
      { action: 'copy', label: 'Copy', shortcut: `${mod}+C` },
      { action: 'paste', label: 'Paste', shortcut: `${mod}+V` },
      {
        action: 'pasteAsPlainText',
        label: 'Paste as Plain Text',
        shortcut: `${mod}+Shift+V`,
        dividerAfter: true,
      },
      {
        action: 'delete',
        label: 'Delete',
        shortcut: 'Del',
        dividerAfter: !contextMenu.hasSelection && !contextMenu.cursorInTable,
      },
    ];
    if (contextMenu.hasSelection) {
      items.push({
        action: 'addComment',
        label: 'Comment',
      });
      // Quick-translate: instant replace with the last target the
      // user picked. The dialog entry sticks around for picking a
      // different language or seeing the preview.
      const lastTranslateTarget = (() => {
        try {
          return window.localStorage.getItem('translate:last-target');
        } catch {
          return null;
        }
      })();
      const targetLabel =
        lastTranslateTarget &&
        TRANSLATE_LANGUAGES.find((l) => l.code === lastTranslateTarget)?.label;
      if (targetLabel) {
        items.push({
          action: 'translateQuickReplace',
          label: `Translate to ${targetLabel}`,
        });
      }
      items.push({
        action: 'translateSelection',
        label: 'Translate selection…',
      });
      if (aiRewriteReady) {
        items.push({ action: 'aiRewrite', label: 'Rewrite with AI' });
      }
      if (aiSummarizeReady) {
        items.push({ action: 'aiSummarize', label: 'Summarize with AI' });
      }
      // Add the divider on the last selection-only entry, before the
      // table block / Select All trailer.
      if (items.length > 0) {
        const last = items[items.length - 1];
        if (last) last.dividerAfter = !contextMenu.cursorInTable;
      }
    }
    if (contextMenu.cursorInTable) {
      items.push(
        { action: 'addRowAbove', label: 'Insert row above' },
        { action: 'addRowBelow', label: 'Insert row below' },
        { action: 'deleteRow', label: 'Delete row', dividerAfter: true },
        { action: 'addColumnLeft', label: 'Insert column left' },
        { action: 'addColumnRight', label: 'Insert column right' },
        { action: 'deleteColumn', label: 'Delete column' },
        {
          action: 'mergeCells',
          label: i18n?.table?.mergeCells ?? defaultLocale.table.mergeCells,
          disabled: !contextMenu.tableContext?.hasMultiCellSelection,
        },
        {
          action: 'splitCell',
          label: i18n?.table?.splitCell ?? defaultLocale.table.splitCell,
          disabled: !contextMenu.tableContext?.canSplitCell,
          dividerAfter: true,
        }
      );
    }
    items.push({ action: 'selectAll', label: 'Select All', shortcut: `${mod}+A` });
    return items;
  }, [
    contextMenu.hasSelection,
    contextMenu.cursorInTable,
    contextMenu.tableContext,
    aiRewriteReady,
    aiSummarizeReady,
  ]);

  // ---------------------------------------------------------------
  // AI suggestion (rewrite / summarize) — popover-based flow.
  // ---------------------------------------------------------------

  const runAiSuggestion = useCallback(
    async (mode: 'rewrite' | 'summarize', tone: AIToneId, range: { from: number; to: number }) => {
      const view = getActiveEditorView();
      if (!view) return;
      aiAbortRef.current?.abort();
      const controller = new AbortController();
      aiAbortRef.current = controller;
      setAiSuggestion((prev) =>
        prev ? { ...prev, busy: true, suggestion: null, error: null, inferenceMs: null } : prev
      );
      try {
        const slice = view.state.doc.slice(range.from, range.to);
        const ctx = sampleContext(view.state.doc, range.from, range.to);
        const startedAt = Date.now();
        const transformed = await rewriteFragment(
          slice.content,
          view.state.schema,
          mode === 'rewrite' ? 'rewrite' : 'summarize',
          {
            tone,
            contextBefore: ctx.before,
            contextAfter: ctx.after,
          },
          controller.signal
        );
        const text = (() => {
          let out = '';
          for (let i = 0; i < transformed.childCount; i++) out += transformed.child(i).textContent;
          return out.trim();
        })();
        if (controller.signal.aborted) return;
        setAiSuggestion((prev) =>
          prev
            ? {
                ...prev,
                suggestion: text || prev.original,
                inferenceMs: Date.now() - startedAt,
                busy: false,
              }
            : prev
        );
        // Stash the transformed fragment so Accept can replay it
        // without re-running inference.
        aiFragmentRef.current = transformed;
      } catch (err) {
        if (controller.signal.aborted) return;
        const e = err as Error;
        const msg = e.message?.includes('No model is loaded')
          ? mode === 'rewrite'
            ? 'Enable Tone & style rewrite in the Writing Assistant first.'
            : 'Enable Summarize selection in the Writing Assistant first.'
          : (e.message ?? 'Inference failed.');
        setAiSuggestion((prev) => (prev ? { ...prev, busy: false, error: msg } : prev));
      }
    },
    [getActiveEditorView]
  );

  const openAiSuggestion = useCallback(
    (mode: 'rewrite' | 'summarize') => {
      const view = getActiveEditorView();
      if (!view) return;
      const { from, to } = view.state.selection;
      if (from === to) return;
      const original = view.state.doc.textBetween(from, to, ' ', ' ').trim();
      if (!original) return;
      // Right-docked panel doesn't need a per-selection bbox — the
      // dock position is fixed. We still snapshot the PM range so
      // Accept replays exactly the span the user picked, even if the
      // cursor moves while the panel is open.
      setAiSuggestion({
        mode,
        from,
        to,
        original,
        suggestion: null,
        inferenceMs: null,
        tone: 'polish',
        busy: true,
        error: null,
      });
      void runAiSuggestion(mode, 'polish', { from, to });
    },
    [getActiveEditorView, runAiSuggestion]
  );

  const handleAiAccept = useCallback(() => {
    const view = getActiveEditorView();
    const state = aiSuggestion;
    if (!view || !state) return;
    const docSize = view.state.doc.content.size;
    if (state.mode === 'rewrite' && aiFragmentRef.current) {
      // Land the rewrite as a tracked change instead of clobbering the
      // selection — the original stays in place struck-through (red),
      // the AI's version arrives underlined (green) so the user
      // accepts or rejects through the existing tracked-change UI.
      const from = Math.min(Math.max(state.from, 0), docSize);
      const to = Math.min(Math.max(state.to, from), docSize);
      applyRewriteAsSuggestion({
        view,
        from,
        to,
        replacement: aiFragmentRef.current,
      });
    } else if (state.mode === 'summarize' && state.suggestion) {
      // Insert the summary at the END of the selection as a tracked
      // change. Nothing gets deleted; the user just gets a marked
      // insertion they can accept or reject.
      const to = Math.min(Math.max(state.to, 0), docSize);
      applyInsertAsSuggestion({
        view,
        at: to,
        text: `\n\nSummary: ${state.suggestion}\n`,
      });
    }
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;
    aiFragmentRef.current = null;
    setAiSuggestion(null);
  }, [aiSuggestion, getActiveEditorView]);

  const handleAiReject = useCallback(() => {
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;
    aiFragmentRef.current = null;
    setAiSuggestion(null);
  }, []);

  const handleAiRetry = useCallback(() => {
    if (!aiSuggestion) return;
    void runAiSuggestion(aiSuggestion.mode, aiSuggestion.tone, {
      from: aiSuggestion.from,
      to: aiSuggestion.to,
    });
  }, [aiSuggestion, runAiSuggestion]);

  const handleAiTone = useCallback(
    (id: string) => {
      if (!aiSuggestion) return;
      const next = id as AIToneId;
      setAiSuggestion((prev) => (prev ? { ...prev, tone: next, busy: true } : prev));
      void runAiSuggestion(aiSuggestion.mode, next, {
        from: aiSuggestion.from,
        to: aiSuggestion.to,
      });
    },
    [aiSuggestion, runAiSuggestion]
  );

  const handleContextMenuAction = useCallback(
    async (action: TextContextAction) => {
      const view = getActiveEditorView();
      if (!view) return;

      // Focus the hidden PM so execCommand targets the right element
      focusActiveEditor();

      switch (action) {
        case 'cut':
          document.execCommand('cut');
          break;
        case 'copy':
          document.execCommand('copy');
          break;
        case 'paste': {
          // Use Clipboard API — document.execCommand('paste') is blocked in modern browsers
          try {
            const items = await navigator.clipboard.read();
            let html = '';
            let text = '';
            for (const item of items) {
              if (item.types.includes('text/html')) {
                html = await (await item.getType('text/html')).text();
              }
              if (item.types.includes('text/plain')) {
                text = await (await item.getType('text/plain')).text();
              }
            }
            const dt = new DataTransfer();
            if (html) dt.items.add(html, 'text/html');
            if (text) dt.items.add(text, 'text/plain');
            const pasteEvent = new ClipboardEvent('paste', {
              clipboardData: dt,
              bubbles: true,
              cancelable: true,
            });
            view.dom.dispatchEvent(pasteEvent);
          } catch {
            try {
              const text = await navigator.clipboard.readText();
              if (text) view.dispatch(view.state.tr.insertText(text));
            } catch {
              // Clipboard access denied
            }
          }
          break;
        }
        case 'pasteAsPlainText':
          try {
            const text = await navigator.clipboard.readText();
            if (text) view.dispatch(view.state.tr.insertText(text));
          } catch {
            // Clipboard access denied
          }
          break;
        case 'delete': {
          const { from, to } = view.state.selection;
          if (from !== to) {
            view.dispatch(view.state.tr.deleteRange(from, to));
          }
          break;
        }
        case 'selectAll':
          view.dispatch(
            view.state.tr.setSelection(
              TextSelection.create(view.state.doc, 0, view.state.doc.content.size)
            )
          );
          break;
        // Table operations
        case 'addRowAbove':
          addRowAbove(view.state, view.dispatch);
          break;
        case 'addRowBelow':
          addRowBelow(view.state, view.dispatch);
          break;
        case 'deleteRow':
          pmDeleteRow(view.state, view.dispatch);
          break;
        case 'addColumnLeft':
          addColumnLeft(view.state, view.dispatch);
          break;
        case 'addColumnRight':
          addColumnRight(view.state, view.dispatch);
          break;
        case 'deleteColumn':
          pmDeleteColumn(view.state, view.dispatch);
          break;
        case 'mergeCells':
          pmMergeCells(view.state, view.dispatch);
          break;
        case 'splitCell':
          openSplitCellDialog();
          break;
        // Translate — capture the selection range so the dialog's
        // Replace button can write back to exactly this span.
        case 'translateSelection': {
          const { from, to } = view.state.selection;
          if (from === to) break;
          const raw = view.state.doc.textBetween(from, to, ' ', ' ').trim();
          setTranslateRange({ from, to });
          setTranslateText(raw.length > 0 ? raw : null);
          setShowTranslate(true);
          break;
        }
        // Quick translate — instant format-preserving replace into
        // the user's last-chosen target language. No dialog, no
        // preview, just the same translateFragment path the dialog
        // would have run on Accept.
        case 'translateQuickReplace': {
          const { from, to } = view.state.selection;
          if (from === to) break;
          let target: string | null = null;
          try {
            target = window.localStorage.getItem('translate:last-target');
          } catch {
            // Storage denied — fall back to dialog.
          }
          if (!target) {
            // No remembered language yet; route through the dialog so
            // the user picks one.
            const raw = view.state.doc.textBetween(from, to, ' ', ' ').trim();
            setTranslateRange({ from, to });
            setTranslateText(raw.length > 0 ? raw : null);
            setShowTranslate(true);
            break;
          }
          const targetLang = target;
          const docSize = view.state.doc.content.size;
          const clampedFrom = Math.min(Math.max(from, 0), docSize);
          const clampedTo = Math.min(Math.max(to, clampedFrom), docSize);
          const slice = view.state.doc.slice(clampedFrom, clampedTo);
          const targetLabel =
            TRANSLATE_LANGUAGES.find((l) => l.code === targetLang)?.label ??
            targetLang.toUpperCase();
          const toastId = toast.loading(`Translating to ${targetLabel}…`);
          try {
            const translatedContent = await translateFragment(
              slice.content,
              view.state.schema,
              'en',
              targetLang
            );
            const translatedSlice = new Slice(translatedContent, slice.openStart, slice.openEnd);
            const live = getActiveEditorView();
            if (!live) {
              toast.dismiss(toastId);
              break;
            }
            const tr = live.state.tr.replace(clampedFrom, clampedTo, translatedSlice);
            live.dispatch(tr);
            toast.success(`Replaced with ${targetLabel} translation.`, { id: toastId });
          } catch {
            toast.error("Couldn't translate — check your connection or pick another language.", {
              id: toastId,
            });
          }
          break;
        }
        // AI rewrite — opens the inline suggestion popover anchored
        // to the selection. The popover is what runs the model + lets
        // the user Accept / Reject; nothing changes in the doc until
        // they explicitly click Replace.
        case 'aiRewrite': {
          openAiSuggestion('rewrite');
          break;
        }
        case 'aiSummarize': {
          openAiSuggestion('summarize');
          break;
        }
        // Comment — same flow as floating comment button
        case 'addComment': {
          const { from, to } = view.state.selection;
          if (from === to) break;
          // Compute Y position BEFORE dispatching — dispatch triggers re-layout
          // which rebuilds page DOM and invalidates the old span elements
          const yPos = findSelectionYPosition(
            scrollContainerRef.current,
            editorContentRef.current,
            from
          );
          setCommentSelectionRange({ from, to });
          const pendingMark = view.state.schema.marks.comment.create({
            commentId: PENDING_COMMENT_ID,
          });
          const tr = view.state.tr.addMark(from, to, pendingMark);
          tr.setSelection(TextSelection.create(tr.doc, to));
          view.dispatch(tr);
          setAddCommentYPosition(yPos);
          setShowCommentsSidebar(true);
          setIsAddingComment(true);
          setFloatingCommentBtn(null);
          break;
        }
      }
      // TextContextMenu calls onClose after onAction, so no need to close here
    },
    [getActiveEditorView, focusActiveEditor, openSplitCellDialog]
  );

  // Handle margin changes from rulers
  const createMarginHandler = useCallback(
    (property: 'marginLeft' | 'marginRight' | 'marginTop' | 'marginBottom') =>
      (marginTwips: number) => {
        if (!history.state || readOnly) return;
        const newDoc = {
          ...history.state,
          package: {
            ...history.state.package,
            document: {
              ...history.state.package.document,
              finalSectionProperties: {
                ...history.state.package.document.finalSectionProperties,
                [property]: marginTwips,
              },
            },
          },
        };
        handleDocumentChange(newDoc);
      },
    [history.state, readOnly, handleDocumentChange]
  );

  const handleLeftMarginChange = useMemo(
    () => createMarginHandler('marginLeft'),
    [createMarginHandler]
  );
  const handleRightMarginChange = useMemo(
    () => createMarginHandler('marginRight'),
    [createMarginHandler]
  );
  const handleTopMarginChange = useMemo(
    () => createMarginHandler('marginTop'),
    [createMarginHandler]
  );
  const handleBottomMarginChange = useMemo(
    () => createMarginHandler('marginBottom'),
    [createMarginHandler]
  );

  // Page setup apply handler
  const handlePageSetupApply = useCallback(
    (props: Partial<SectionProperties>) => {
      if (!history.state || readOnly) return;
      const newDoc = {
        ...history.state,
        package: {
          ...history.state.package,
          document: {
            ...history.state.package.document,
            finalSectionProperties: {
              ...history.state.package.document.finalSectionProperties,
              ...props,
            },
          },
        },
      };
      handleDocumentChange(newDoc);
    },
    [history.state, readOnly, handleDocumentChange]
  );

  // Page-color apply handler — writes the new color into the
  // doc-level <w:background> slot so the painter picks it up on
  // the next render and the next save round-trips it. `undefined`
  // clears the background entirely (the serializer skips emitting
  // <w:background> when `body.background` is absent).
  const handlePageColorChange = useCallback(
    (color: string | undefined) => {
      if (!history.state || readOnly) return;
      const rgb = color?.replace(/^#/, '').toUpperCase();
      const nextBg = rgb ? { color: { rgb } } : undefined;
      const newDoc = {
        ...history.state,
        package: {
          ...history.state.package,
          document: {
            ...history.state.package.document,
            background: nextBg,
          },
        },
      };
      handleDocumentChange(newDoc);
    },
    [history.state, readOnly, handleDocumentChange]
  );

  // Accessibility check (D8) — snapshots issues from the current PM doc
  // when the user opens the dialog. Read-only; no edits to the document.
  const handleOpenAccessibility = useCallback(() => {
    const view = pagedEditorRef.current?.getView();
    if (view) setAccessibilityIssues(checkAccessibility(view.state.doc));
    setShowAccessibility(true);
  }, []);
  const handleAccessibilityGoto = useCallback((pmPos: number) => {
    const view = pagedEditorRef.current?.getView();
    if (!view) return;
    const { doc } = view.state;
    const safePos = Math.max(0, Math.min(pmPos, doc.content.size));
    // Resolve to the nearest valid text selection so an image position
    // doesn't fail (NodeSelection vs TextSelection).
    const $pos = doc.resolve(safePos);
    const near =
      $pos.parent.isTextblock || $pos.parent.inlineContent
        ? TextSelection.near($pos)
        : TextSelection.create(doc, safePos);
    view.dispatch(view.state.tr.setSelection(near).scrollIntoView());
    view.focus();
  }, []);

  // Building blocks (C6) — capture the active editor's selection content
  // at open time so the dialog can save it later without depending on the
  // selection still being live (focus moves to the dialog input).
  const handleOpenBuildingBlocks = useCallback(() => {
    const view = getActiveEditorView();
    if (view && !view.state.selection.empty) {
      const { from, to } = view.state.selection;
      const slice = view.state.selection.content();
      const text = view.state.doc.textBetween(from, to, ' ', ' ');
      if (slice.content.size > 0) {
        setPendingBuildingBlock({
          content: slice.toJSON(),
          preview: previewFromText(text) || '(non-text content)',
        });
      } else {
        setPendingBuildingBlock(null);
      }
    } else {
      setPendingBuildingBlock(null);
    }
    setShowBuildingBlocks(true);
  }, [getActiveEditorView]);

  const handleSaveBuildingBlock = useCallback(
    (name: string) => {
      if (!pendingBuildingBlock) return;
      const next = addBuildingBlock({
        name,
        content: pendingBuildingBlock.content,
        preview: pendingBuildingBlock.preview,
      });
      setBuildingBlocks(next);
      setPendingBuildingBlock(null);
    },
    [pendingBuildingBlock]
  );

  const handleInsertBuildingBlock = useCallback(
    (id: string) => {
      const block = buildingBlocks.find((b) => b.id === id);
      if (!block) return;
      const view = getActiveEditorView();
      if (!view) return;
      try {
        const slice = Slice.fromJSON(view.state.schema, block.content as never);
        view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
        view.focus();
      } catch {
        // Schema drift — block was saved against a different schema or the
        // JSON is corrupt. Silently swallow; the row remains in the list.
      }
      setShowBuildingBlocks(false);
    },
    [buildingBlocks, getActiveEditorView]
  );

  const handleDeleteBuildingBlock = useCallback((id: string) => {
    setBuildingBlocks(removeBuildingBlock(id));
  }, []);

  // Convert selection to table (B8) — wraps the utility for the
  // Insert-menu callback. Returns `false` silently if there's nothing
  // convertible at the current selection.
  const handleConvertSelectionToTable = useCallback(() => {
    const view = getActiveEditorView();
    if (!view) return;
    convertSelectionToTable(view);
  }, [getActiveEditorView]);

  const handleConvertTableToText = useCallback(() => {
    const view = getActiveEditorView();
    if (!view) return;
    convertTableToText(view);
  }, [getActiveEditorView]);

  // A6 — citations manager handlers. Local-only storage; the Insert
  // action writes formatted text at the cursor and wraps the URL
  // substring (if present) in a hyperlink mark so the link is clickable.
  const handleOpenCitations = useCallback(() => {
    setShowCitations(true);
  }, []);

  const handleAddCitation = useCallback((input: Omit<Citation, 'id' | 'createdAt'>) => {
    setCitations(addCitation(input));
  }, []);

  const handleDeleteCitation = useCallback((id: string) => {
    setCitations(removeCitation(id));
  }, []);

  // C2 v0 — drop a default-styled SVG primitive at the cursor as an
  // inline image. The user can resize / recolor via the existing image
  // handles + properties dialog.
  const handleInsertShape = useCallback(
    (type: ShapeType) => {
      const view = getActiveEditorView();
      if (!view) return;
      const imageType = view.state.schema.nodes.image;
      if (!imageType) return;
      const shape = generateShape(type);
      const rId = `rId_shape_${Date.now()}`;
      const node = imageType.create({
        src: shape.dataUrl,
        alt: shape.altText,
        width: shape.width,
        height: shape.height,
        rId,
        wrapType: 'inline',
        displayMode: 'inline',
      });
      const { from } = view.state.selection;
      const tr = view.state.tr.insert(from, node);
      view.dispatch(tr.scrollIntoView());
      focusActiveEditor();
    },
    [getActiveEditorView, focusActiveEditor]
  );

  const handleInsertCitation = useCallback(
    (formatted: string, url?: string) => {
      const view = getActiveEditorView();
      if (!view) return;
      const { schema } = view.state;
      // Two-phase insert: drop the citation text, then add a hyperlink
      // mark over the URL substring so clicking it navigates. Keeping
      // the entire citation as a single paragraph lets the user style
      // it (italic title, etc.) without further wrangling.
      const tr = view.state.tr.insertText(formatted);
      if (url) {
        const hyperlinkType = schema.marks.hyperlink;
        const idx = formatted.lastIndexOf(url);
        if (hyperlinkType && idx >= 0) {
          const start = tr.selection.from - (formatted.length - idx);
          const end = start + url.length;
          tr.addMark(start, end, hyperlinkType.create({ href: url }));
        }
      }
      view.dispatch(tr);
      focusActiveEditor();
    },
    [getActiveEditorView, focusActiveEditor]
  );

  // A3 — open the Explore dialog (Wikipedia summary lookup). Seeds the
  // query from the current selection; "Cite this" inserts a hyperlink
  // at the cursor via the existing hyperlink command.
  const handleOpenExplore = useCallback(() => {
    const view = getActiveEditorView();
    if (view) {
      const { from, to } = view.state.selection;
      if (from !== to) {
        const raw = view.state.doc.textBetween(from, to, ' ', ' ').trim();
        setExploreQuery(raw.length > 0 ? raw : null);
      } else {
        setExploreQuery(null);
      }
    } else {
      setExploreQuery(null);
    }
    setShowExplore(true);
  }, [getActiveEditorView]);

  const handleExploreCite = useCallback(
    (title: string, url: string) => {
      const view = getActiveEditorView();
      if (!view) return;
      insertHyperlink(title, url, title)(view.state, view.dispatch);
      focusActiveEditor();
    },
    [getActiveEditorView, focusActiveEditor]
  );

  // Spell-check: flip enabled state, lazy-load dictionary on first
  // enable, and tell the open editor view to repaint. Toast surfaces
  // load / failure since dict download can be 100–1500 ms.
  const handleToggleSpellcheck = useCallback(async () => {
    const next = !isSpellEnabled();
    if (next) {
      try {
        // Pre-warm — block the visible "enabled" flip on the dict so
        // the very first transaction-tick already sees a usable engine.
        const loadingToast = toast.loading('Loading spell-check dictionary…');
        await loadSpellChecker();
        toast.dismiss(loadingToast);
      } catch {
        toast.error("Couldn't load the spell-check dictionary.");
        return;
      }
    }
    setSpellEnabled(next);
    setSpellOn(next);
    try {
      window.localStorage.setItem(SPELLCHECK_KEY, next ? '1' : '0');
    } catch {
      // Storage denied — toggle still takes effect for the session.
    }
    const view = getActiveEditorView();
    if (view) refreshSpellcheckDecorations(view);
  }, [getActiveEditorView]);

  // Restore from localStorage on mount: if persisted "on", quietly load
  // the dictionary in the background and turn the engine on without a
  // visible toast — the user already opted in last session.
  useEffect(() => {
    if (!spellOn) return;
    if (isSpellEnabled()) return;
    void (async () => {
      try {
        await loadSpellChecker();
        setSpellEnabled(true);
        const view = getActiveEditorView();
        if (view) refreshSpellcheckDecorations(view);
      } catch {
        // Silent — the user can re-toggle from the menu.
      }
    })();
  }, [spellOn, getActiveEditorView]);

  // A5 — Replace the selection (captured in `translateRange`) with a
  // per-mark-run translation. Each text node inside the range is
  // translated individually so bold/italic/link/etc boundaries land
  // exactly where the user drew them. Returns void; toasts on failure.
  const handleTranslateReplace = useCallback(
    async (source: string, target: string): Promise<void> => {
      const view = getActiveEditorView();
      if (!view) throw new Error('no-view');
      const range = translateRange;
      if (!range) throw new Error('no-range');
      const { from, to } = range;
      if (from === to) throw new Error('empty-range');
      // Re-resolve against current doc — autosave / other tx may have
      // shifted positions while the dialog was up. Clamp to doc size.
      const docSize = view.state.doc.content.size;
      const clampedFrom = Math.min(Math.max(from, 0), docSize);
      const clampedTo = Math.min(Math.max(to, clampedFrom), docSize);
      const slice = view.state.doc.slice(clampedFrom, clampedTo);
      try {
        const translatedContent = await translateFragment(
          slice.content,
          view.state.schema,
          source,
          target
        );
        const translatedSlice = new Slice(translatedContent, slice.openStart, slice.openEnd);
        // Re-read the live view at dispatch time: the user may have typed
        // or scrolled during the await; another tr may have shifted us.
        const live = getActiveEditorView();
        if (!live) return;
        const tr = live.state.tr.replace(clampedFrom, clampedTo, translatedSlice);
        live.dispatch(tr);
        try {
          window.localStorage.setItem('translate:last-target', target);
        } catch {
          // Storage denied — the right-click quick-translate just won't
          // remember across sessions; nothing else breaks.
        }
        toast.success(`Replaced with ${target.toUpperCase()} translation.`);
      } catch (err) {
        toast.error("Couldn't translate — check your connection and try again.");
        throw err;
      }
    },
    [getActiveEditorView, translateRange]
  );

  // A5 — open the translate dialog. Seeds the original-text box with
  // the current selection; the user can edit it freely once the dialog
  // is up.
  const handleOpenTranslate = useCallback(() => {
    const view = getActiveEditorView();
    if (view) {
      const { from, to } = view.state.selection;
      if (from !== to) {
        const raw = view.state.doc.textBetween(from, to, ' ', ' ').trim();
        setTranslateText(raw.length > 0 ? raw : null);
        setTranslateRange({ from, to });
      } else {
        setTranslateText(null);
        setTranslateRange(null);
      }
    } else {
      setTranslateText(null);
      setTranslateRange(null);
    }
    setShowTranslate(true);
  }, [getActiveEditorView]);

  // A4 — open the dictionary dialog. Seeds the input from the selection
  // (collapsed selection → null, dialog shows the bare input).
  const handleOpenDictionary = useCallback(() => {
    const view = getActiveEditorView();
    if (view) {
      const { from, to } = view.state.selection;
      if (from !== to) {
        const raw = view.state.doc.textBetween(from, to, ' ', ' ').trim();
        // Take just the first whitespace-delimited token — the dictionary
        // endpoint is single-word; multi-word selections would 404.
        const firstWord = raw.split(/\s+/)[0] ?? '';
        setDictionaryWord(firstWord.length > 0 ? firstWord : null);
      } else {
        setDictionaryWord(null);
      }
    } else {
      setDictionaryWord(null);
    }
    setShowDictionary(true);
  }, [getActiveEditorView]);

  // Watermark apply/clear handler (C5) — writes into the doc-level
  // body.watermark slot so the painter draws the overlay on the next
  // render. `undefined` clears it. Round-trip to header XML lands in a
  // separate pass.
  const handleWatermarkChange = useCallback(
    (watermark: { text: string } | undefined) => {
      if (!history.state || readOnly) return;
      const newDoc = {
        ...history.state,
        package: {
          ...history.state.package,
          document: {
            ...history.state.package.document,
            watermark,
          },
        },
      };
      handleDocumentChange(newDoc);
    },
    [history.state, readOnly, handleDocumentChange]
  );

  // Paragraph indent handlers (for ruler)
  const handleIndentLeftChange = useCallback(
    (twips: number) => {
      const view = getActiveEditorView();
      if (!view) return;
      setIndentLeft(twips)(view.state, view.dispatch);
    },
    [getActiveEditorView]
  );

  const handleIndentRightChange = useCallback(
    (twips: number) => {
      const view = getActiveEditorView();
      if (!view) return;
      setIndentRight(twips)(view.state, view.dispatch);
    },
    [getActiveEditorView]
  );

  const handleFirstLineIndentChange = useCallback(
    (twips: number) => {
      const view = getActiveEditorView();
      if (!view) return;
      // If twips is negative, it's a hanging indent
      if (twips < 0) {
        setIndentFirstLine(-twips, true)(view.state, view.dispatch);
      } else {
        setIndentFirstLine(twips, false)(view.state, view.dispatch);
      }
    },
    [getActiveEditorView]
  );

  const handleTabStopRemove = useCallback(
    (positionTwips: number) => {
      const view = getActiveEditorView();
      if (!view) return;
      removeTabStop(positionTwips)(view.state, view.dispatch);
    },
    [getActiveEditorView]
  );

  // Scroll-based page tracking: calculate current page from scroll position.
  // Re-attaches when the scroll container mounts (after loading completes).
  const scrollContainerEl = scrollContainerRef.current;
  useEffect(() => {
    if (!scrollContainerEl) return;

    const handleScroll = () => {
      const layout = pagedEditorRef.current?.getLayout();
      if (!layout || layout.pages.length === 0) return;

      const scrollTop = scrollContainerEl.scrollTop;
      const totalPages = layout.pages.length;
      const pageGap = 24; // DEFAULT_PAGE_GAP from PagedEditor
      const paddingTop = 24; // top padding in paged-editor__pages

      // Calculate which page is visible at the viewport center
      const viewportCenter = scrollTop + scrollContainerEl.clientHeight / 2;
      let accumulatedY = paddingTop;
      let currentPage = 1;

      for (let i = 0; i < layout.pages.length; i++) {
        const pageHeight = layout.pages[i].size.h;
        const pageEnd = accumulatedY + pageHeight;
        if (viewportCenter < pageEnd) {
          currentPage = i + 1;
          break;
        }
        accumulatedY = pageEnd + pageGap;
        currentPage = i + 2; // next page
      }
      currentPage = Math.min(currentPage, totalPages);

      setScrollPageInfo({ currentPage, totalPages, visible: true });

      // Clear existing fade timer
      if (scrollFadeTimerRef.current) {
        clearTimeout(scrollFadeTimerRef.current);
      }
      // Hide after 0.6s of no scrolling
      scrollFadeTimerRef.current = setTimeout(() => {
        setScrollPageInfo((prev) => ({ ...prev, visible: false }));
      }, 600);
    };

    scrollContainerEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      scrollContainerEl.removeEventListener('scroll', handleScroll);
      if (scrollFadeTimerRef.current) {
        clearTimeout(scrollFadeTimerRef.current);
      }
    };
  }, [scrollContainerEl]);

  // Handle save
  const handleSave = useCallback(
    async (options?: { selective?: boolean }): Promise<ArrayBuffer | null> => {
      if (!agentRef.current) return null;

      try {
        const agentDoc = agentRef.current.getDocument();

        // Get the document from the PM editor state — this runs fromProseDoc which
        // converts PM comment marks into commentRangeStart/End in the document body.
        // The agent's internal document has the original parsed content and won't
        // include markers for newly added comments.
        const pmDoc = pagedEditorRef.current?.getDocument();
        if (pmDoc?.package?.document) {
          agentDoc.package.document.content = pmDoc.package.document.content;
        }

        // Sync React comments state (including new replies) back to the document model
        agentDoc.package.document.comments = comments;

        // Inject commentRangeStart/End for reply comments that share the parent's range.
        // Pages/Word require every comment (including replies) to have range markers in document.xml.
        injectReplyRangeMarkers(agentDoc.package.document.content, comments);
        // Also inject range markers for comments that reply to tracked changes.
        injectTCReplyRangeMarkers(agentDoc.package.document.content, comments);

        // Build selective save options from change tracker state
        const useSelective = options?.selective !== false;
        const view = pagedEditorRef.current?.getView();
        let selectiveOptions: Parameters<typeof agentRef.current.toBuffer>[0] = undefined;

        if (useSelective && view) {
          const editorState = view.state;
          // Force full repack if any reply comments exist (both comment replies and
          // tracked-change replies need range markers injected into document.xml,
          // which selective save can't handle since the affected paragraphs may not
          // be in changedParaIds)
          const hasInjectedReplies = comments.some((c) => c.parentId != null);
          // Non-paragraph block changes (textBox / image / shape / table)
          // bypass the paraId-keyed selective path entirely — the
          // changed paraId set is empty for a drawing-only transaction
          // and the round-trip would silently drop the new node. Treat
          // them as untracked so the serializer falls back to a full
          // re-pack. See ParagraphChangeTrackerExtension for the source
          // of this signal.
          selectiveOptions = {
            selective: {
              changedParaIds: getChangedParagraphIds(editorState),
              structuralChange: hasStructuralChanges(editorState) || hasInjectedReplies,
              hasUntrackedChanges:
                hasUntrackedChanges(editorState) || hasNonParagraphBlockChanges(editorState),
            },
          };
        }

        const buffer = await agentRef.current.toBuffer(selectiveOptions);

        // Clear change tracker after successful save
        if (view) {
          view.dispatch(clearTrackedChanges(view.state));
        }

        onSave?.(buffer);
        return buffer;
      } catch (error) {
        onError?.(error instanceof Error ? error : new Error('Failed to save document'));
        return null;
      }
    },
    [onSave, onError, comments]
  );

  // Handle error from editor
  const handleEditorError = useCallback(
    (error: Error) => {
      onError?.(error);
    },
    [onError]
  );

  // `handleDirectPrint` is also the underlying flow for Export as PDF —
  // browsers' "Save as PDF" destination in the print dialog uses the
  // print window's <title> as the default filename, so we let callers
  // pass one. The visible HTML and CSS are identical for print and PDF.
  const triggerPrintFlow = useCallback(
    (windowTitle: string) => {
      const pagesEl = containerRef.current?.querySelector('.paged-editor__pages');
      if (!pagesEl) {
        window.print();
        onPrint?.();
        return;
      }

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        // Popup blocked — fall back to window.print()
        window.print();
        onPrint?.();
        return;
      }

      // Collect all @font-face rules from the current page
      const fontFaceRules: string[] = [];
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            if (rule instanceof CSSFontFaceRule) {
              fontFaceRules.push(rule.cssText);
            }
          }
        } catch {
          // Cross-origin stylesheets can't be read — skip
        }
      }

      // Force-render all virtualized page shells so the clone captures every
      // page's content, not just the pages near the viewport (issue #141).
      forceRenderAllPages(pagesEl as HTMLElement);

      // Clone pages and remove transforms/shadows
      const pagesClone = pagesEl.cloneNode(true) as HTMLElement;
      pagesClone.style.cssText = 'display: block; margin: 0; padding: 0;';
      for (const page of Array.from(pagesClone.querySelectorAll('.layout-page'))) {
        const el = page as HTMLElement;
        el.style.boxShadow = 'none';
        el.style.margin = '0';
      }

      // Restore memory-efficient virtualization after the clone is done.
      requestAnimationFrame(() => {
        restoreVirtualization(pagesEl as HTMLElement);
      });

      const titleEscaped = windowTitle
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      printWindow.document.write(`<!DOCTYPE html>
<html><head><title>${titleEscaped}</title>
<style>
${fontFaceRules.join('\n')}
* { margin: 0; padding: 0; }
body { background: white; }
.layout-page { break-after: page; }
.layout-page:last-child { break-after: auto; }
@page { margin: 0; size: auto; }
</style>
</head><body>${pagesClone.outerHTML}</body></html>`);
      printWindow.document.close();

      // Wait for fonts/images then print. The fallback timeout below
      // covers browsers that never fire onload on a document-written
      // window; we clear it from inside onload so the normal path
      // doesn't double-trigger print() and surface a second print
      // dialog the user already cancelled. Pre-fix the second print
      // fired ~1s after the user dismissed the first.
      let printed = false;
      let fallback: ReturnType<typeof setTimeout> | null = null;
      const runPrint = () => {
        if (printed) return;
        printed = true;
        if (fallback !== null) {
          clearTimeout(fallback);
          fallback = null;
        }
        printWindow.print();
        printWindow.close();
      };
      printWindow.onload = runPrint;
      fallback = setTimeout(() => {
        fallback = null;
        if (!printWindow.closed) runPrint();
      }, 1000);

      onPrint?.();
    },
    [onPrint]
  );

  const handleDirectPrint = useCallback(() => {
    triggerPrintFlow('Print');
  }, [triggerPrintFlow]);

  // Export as PDF reuses the print pipeline — browsers' print dialogs
  // include a "Save as PDF" destination that uses the print window's
  // title as the default filename. We pass the current document name
  // (or a sensible default) so the saved file is `<doc>.pdf` rather
  // than `Print.pdf`. There is no JS API to preselect the PDF
  // destination — the user picks it once in the print dialog.
  const handleExportPdf = useCallback(() => {
    const base = (documentName?.trim() || 'Document').replace(/\.docx$/i, '');
    triggerPrintFlow(base);
  }, [triggerPrintFlow, documentName]);

  const handleDownloadDocument = useCallback(async () => {
    setIsSaving(true);
    try {
      const buffer = await handleSave();
      if (!buffer) return;
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      const fileName = `${(documentName?.trim() || 'document').replace(/\.docx$/i, '')}.docx`;
      a.download = fileName;
      a.click();
      // Defer revoke so Safari has time to start the download.
      setTimeout(() => URL.revokeObjectURL(url), 0);
      markDirty(false);
      toast.success(`Saved ${fileName}`);
    } finally {
      setIsSaving(false);
    }
  }, [handleSave, documentName, markDirty]);

  // Autosave to IndexedDB (sheet parity). A periodic interval polls the
  // dirty flag every 30s; if dirty, it serializes and writes the buffer.
  // The previous one-shot `setTimeout` only fired on the rising edge of
  // `isDirty`, so continuous typing past 30s without an explicit save
  // would never snapshot again. An interval gates on the ref so the
  // serializer (`handleSave` re-walks the PM doc + re-packs the .docx)
  // only runs when there's actually work to do.
  const isDirtyRefAuto = useRef(false);
  isDirtyRefAuto.current = isDirty;
  useEffect(() => {
    const tick = () => {
      if (!isDirtyRefAuto.current) return;
      void (async () => {
        try {
          const buffer = await handleSave();
          if (!buffer) return;
          await writeAutosave({
            name: documentName?.trim() || 'Untitled',
            buffer,
            savedAt: Date.now(),
          });
        } catch {
          // Silent — autosave is best-effort and shouldn't surface
          // errors to the user. The next tick will try again.
        }
      })();
    };
    const interval = window.setInterval(tick, 30_000);
    return () => window.clearInterval(interval);
  }, [handleSave, documentName]);

  // File → Make a copy: download the current content as "Copy of <name>.docx".
  // The original document is unchanged, so we don't touch the dirty flag.
  // F2 — Email as attachment. Browsers can't auto-attach the downloaded
  // file to a mailto draft (security), so the honest version is to do
  // both: trigger the .docx download, then open the user's mail client
  // with subject/body pre-filled. They drag the downloaded file in.
  const handleEmailAsAttachment = useCallback(async () => {
    setIsSaving(true);
    try {
      const buffer = await handleSave();
      if (!buffer) return;
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      const base = (documentName?.trim() || 'document').replace(/\.docx$/i, '');
      const fileName = `${base}.docx`;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);

      const subject = encodeURIComponent(base);
      const body = encodeURIComponent(
        `Attached: ${fileName}\n\n(The file was downloaded to your machine — please attach it to this email.)`
      );
      window.open(`mailto:?subject=${subject}&body=${body}`, '_blank', 'noopener');
      toast.success(`Downloaded ${fileName}. Drag it into the email window to attach.`);
    } finally {
      setIsSaving(false);
    }
  }, [handleSave, documentName]);

  const handleMakeCopy = useCallback(async () => {
    setIsSaving(true);
    try {
      const buffer = await handleSave();
      if (!buffer) return;
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      const base = (documentName?.trim() || 'document').replace(/\.docx$/i, '');
      const fileName = `Copy of ${base}.docx`;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      toast.success(`Downloaded ${fileName}`);
    } finally {
      setIsSaving(false);
    }
  }, [handleSave, documentName]);

  const handleExportAs = useCallback(
    async (target: 'odt' | 'md' | 'txt') => {
      const label = target === 'odt' ? 'ODT' : target === 'md' ? 'Markdown' : 'Plain Text';
      // Loading toast — kept until convert finishes. The first non-DOCX
      // conversion in a session boots the ~7MB WASM bundle so this can
      // take a couple seconds; the toast tells the user it's working.
      const toastId = toast.loading(`Converting to ${label}…`);
      try {
        const buffer = await handleSave();
        if (!buffer) {
          toast.dismiss(toastId);
          return;
        }
        const { exportDocxAs } = await import('../lib/format-converter');
        const out = await exportDocxAs(new Uint8Array(buffer), target);
        const base = (documentName?.trim() || 'document').replace(/\.docx$/i, '');
        const mime =
          target === 'odt'
            ? 'application/vnd.oasis.opendocument.text'
            : target === 'md'
              ? 'text/markdown'
              : 'text/plain';
        const blob =
          typeof out === 'string'
            ? new Blob([out], { type: mime })
            : new Blob([out as BlobPart], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = window.document.createElement('a');
        a.href = url;
        a.download = `${base}.${target}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
        toast.success(`Downloaded ${base}.${target}`, { id: toastId });
      } catch (error) {
        toast.error(`Failed to export as ${label}`, { id: toastId });
        onError?.(error instanceof Error ? error : new Error(`Failed to export as ${target}`));
      }
    },
    [handleSave, documentName, onError]
  );
  const handleExportOdt = useCallback(() => handleExportAs('odt'), [handleExportAs]);
  const handleExportMd = useCallback(() => handleExportAs('md'), [handleExportAs]);
  const handleExportTxt = useCallback(() => handleExportAs('txt'), [handleExportAs]);

  const handleOpenDocument = useCallback(() => {
    docxInputRef.current?.click();
  }, []);

  // Keep the global-keydown handler in sync with the latest file-op
  // callbacks without recreating the listener.
  useEffect(() => {
    shortcutActionsRef.current = {
      save: handleDownloadDocument,
      print: handleDirectPrint,
      new: onNew,
      open: handleOpenDocument,
      zoomIn: () => handleZoomChange(Math.min(state.zoom * 1.1, 4)),
      zoomOut: () => handleZoomChange(Math.max(state.zoom / 1.1, 0.25)),
      zoomReset: () => handleZoomChange(1),
      startComment: handleStartAddComment,
    };
  }, [
    handleDownloadDocument,
    handleDirectPrint,
    onNew,
    handleOpenDocument,
    handleZoomChange,
    state.zoom,
    handleStartAddComment,
  ]);

  const handleDocxFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // Reset so picking the same file twice still fires `change`.
      event.target.value = '';
      if (!file) return;
      try {
        const buffer = await file.arrayBuffer();
        const { formatFromFilename, isForeignFormat, convertToDocx } =
          await import('../lib/format-converter');
        const fmt = formatFromFilename(file.name);
        let docxBuffer: ArrayBuffer = buffer;
        if (fmt && isForeignFormat(fmt)) {
          // .odt / .md / .txt → DOCX via the WASM worker, then feed the
          // existing parser. PDF is intentionally not handled.
          const out = await convertToDocx(new Uint8Array(buffer), fmt);
          // Take ownership of just the populated slice so the buffer
          // passed to loadBuffer is exactly the converter's output.
          docxBuffer = out.buffer.slice(
            out.byteOffset,
            out.byteOffset + out.byteLength
          ) as ArrayBuffer;
        }
        await loadBuffer(docxBuffer);
        const cleanName = file.name.replace(/\.(docx|odt|md|markdown|txt)$/i, '');
        onDocumentNameChange?.(cleanName);
        // Record in the recent-files list so the Home screen can show
        // a one-click reopen tile. Best-effort — failures are logged
        // inside the helper and don't surface to the user.
        void recordRecentFile({
          name: cleanName || file.name,
          buffer: docxBuffer,
          size: docxBuffer.byteLength,
          openedAt: Date.now(),
        });
      } catch (error) {
        onError?.(error instanceof Error ? error : new Error('Failed to open document'));
      }
    },
    [loadBuffer, onDocumentNameChange, onError]
  );

  // ============================================================================
  // FIND/REPLACE HANDLERS
  // ============================================================================

  // Store the current find result for navigation
  const findResultRef = useRef<FindResult | null>(null);
  const getFindDocument = useCallback(
    () => pagedEditorRef.current?.getDocument() ?? history.state,
    [history.state]
  );

  // Handle find operation
  const handleFind = useCallback(
    (searchText: string, options: FindOptions): FindResult | null => {
      const document = getFindDocument();
      if (!document || !searchText.trim()) {
        findResultRef.current = null;
        return null;
      }

      const matches = findInDocument(document, searchText, options);
      const result: FindResult = {
        matches,
        totalCount: matches.length,
        currentIndex: 0,
      };

      findResultRef.current = result;
      findReplace.setMatches(matches, 0);

      // Scroll to first match
      if (matches.length > 0 && containerRef.current) {
        scrollToMatch(containerRef.current, matches[0]);
      }

      return result;
    },
    [getFindDocument, findReplace]
  );

  // Handle find next
  const handleFindNext = useCallback((): FindMatch | null => {
    if (!findResultRef.current || findResultRef.current.matches.length === 0) {
      return null;
    }

    const newIndex = findReplace.goToNextMatch();
    const match = findResultRef.current.matches[newIndex];

    // Scroll to the match
    if (match && containerRef.current) {
      scrollToMatch(containerRef.current, match);
    }

    return match || null;
  }, [findReplace]);

  // Handle find previous
  const handleFindPrevious = useCallback((): FindMatch | null => {
    if (!findResultRef.current || findResultRef.current.matches.length === 0) {
      return null;
    }

    const newIndex = findReplace.goToPreviousMatch();
    const match = findResultRef.current.matches[newIndex];

    // Scroll to the match
    if (match && containerRef.current) {
      scrollToMatch(containerRef.current, match);
    }

    return match || null;
  }, [findReplace]);

  // Handle replace current match
  const handleReplace = useCallback(
    (replaceText: string): boolean => {
      const document = getFindDocument();
      if (!document || !findResultRef.current || findResultRef.current.matches.length === 0) {
        return false;
      }

      const currentMatch = findResultRef.current.matches[findResultRef.current.currentIndex];
      if (!currentMatch) return false;

      // Execute replace command
      try {
        const newDoc = executeCommand(document, {
          type: 'replaceText',
          range: {
            start: {
              paragraphIndex: currentMatch.paragraphIndex,
              offset: currentMatch.startOffset,
            },
            end: {
              paragraphIndex: currentMatch.paragraphIndex,
              offset: currentMatch.endOffset,
            },
          },
          text: replaceText,
        });

        handleDocumentChange(newDoc);
        return true;
      } catch (error) {
        console.error('Replace failed:', error);
        return false;
      }
    },
    [getFindDocument, handleDocumentChange]
  );

  // Handle replace all matches
  const handleReplaceAll = useCallback(
    (searchText: string, replaceText: string, options: FindOptions): number => {
      const document = getFindDocument();
      if (!document || !searchText.trim()) {
        return 0;
      }

      // Find all matches first
      const matches = findInDocument(document, searchText, options);
      if (matches.length === 0) return 0;

      // Replace from end to start to maintain correct indices
      let doc = document;
      const sortedMatches = [...matches].sort((a, b) => {
        if (a.paragraphIndex !== b.paragraphIndex) {
          return b.paragraphIndex - a.paragraphIndex;
        }
        return b.startOffset - a.startOffset;
      });

      for (const match of sortedMatches) {
        try {
          doc = executeCommand(doc, {
            type: 'replaceText',
            range: {
              start: {
                paragraphIndex: match.paragraphIndex,
                offset: match.startOffset,
              },
              end: {
                paragraphIndex: match.paragraphIndex,
                offset: match.endOffset,
              },
            },
            text: replaceText,
          });
        } catch (error) {
          console.error('Replace failed for match:', match, error);
        }
      }

      handleDocumentChange(doc);
      findResultRef.current = null;
      findReplace.setMatches([], 0);

      return matches.length;
    },
    [getFindDocument, handleDocumentChange, findReplace]
  );

  // Expose ref methods
  useImperativeHandle(
    ref,
    () => ({
      getAgent: () => agentRef.current,
      getDocument: () => history.state,
      getEditorRef: () => pagedEditorRef.current,
      save: handleSave,
      setZoom: (zoom: number) => setState((prev) => ({ ...prev, zoom })),
      getZoom: () => state.zoom,
      focus: () => {
        pagedEditorRef.current?.focus();
      },
      getCurrentPage: () => scrollPageInfo.currentPage,
      getTotalPages: () => scrollPageInfo.totalPages,
      scrollToPage: (pageNumber: number) => {
        pagedEditorRef.current?.scrollToPage(pageNumber);
      },
      scrollToPosition: (pmPos: number) => {
        pagedEditorRef.current?.scrollToPosition(pmPos);
      },
      openPrintPreview: handleDirectPrint,
      print: handleDirectPrint,
      loadDocument: loadParsedDocument,
      loadDocumentBuffer: loadBuffer,

      addComment: (options) => {
        const view = pagedEditorRef.current?.getView();
        if (!view) return null;
        const { schema } = view.state;
        if (!schema.marks.comment) return null;

        const range = findParaIdRange(view.state.doc, options.paraId);
        if (!range) return null;

        let from = range.from;
        let to = range.to;

        if (options.search) {
          const textRange = findTextInPmParagraph(
            view.state.doc,
            range.from,
            range.to,
            options.search
          );
          if (!textRange) return null;
          from = textRange.from;
          to = textRange.to;
        }

        const comment = createComment(options.text, options.author);
        const commentMark = schema.marks.comment.create({ commentId: comment.id });
        view.dispatch(view.state.tr.addMark(from, to, commentMark));
        setComments((prev) => [...prev, comment]);
        setShowCommentsSidebar(true);
        return comment.id;
      },

      replyToComment: (commentId, text, authorName) => {
        if (!comments.some((c) => c.id === commentId)) return null;
        const reply = createComment(text, authorName, commentId);
        setComments((prev) => [...prev, reply]);
        return reply.id;
      },

      resolveComment: (commentId) => {
        setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, done: true } : c)));
      },

      proposeChange: (options) => {
        const view = pagedEditorRef.current?.getView();
        if (!view) return false;
        const { schema } = view.state;
        if (!schema.marks.deletion || !schema.marks.insertion) return false;

        const range = findParaIdRange(view.state.doc, options.paraId);
        if (!range) return false;

        const isInsertion = options.search === '';
        const isDeletion = options.replaceWith === '';

        let textFrom: number;
        let textTo: number;

        if (isInsertion) {
          // Insert at end of paragraph (just before closing token).
          textFrom = range.to - 1;
          textTo = range.to - 1;
        } else {
          const textRange = findTextInPmParagraph(
            view.state.doc,
            range.from,
            range.to,
            options.search
          );
          if (!textRange) return false;
          textFrom = textRange.from;
          textTo = textRange.to;
        }

        // Refuse to layer onto an existing tracked change.
        let overlapsTrackedChange = false;
        if (textFrom < textTo) {
          view.state.doc.nodesBetween(textFrom, textTo, (node) => {
            for (const m of node.marks) {
              if (m.type === schema.marks.insertion || m.type === schema.marks.deletion) {
                overlapsTrackedChange = true;
                return false;
              }
            }
            return true;
          });
          if (overlapsTrackedChange) return false;
        }

        const revisionId = nextCommentId++;
        const date = new Date().toISOString();

        const deletionMark = schema.marks.deletion.create({
          revisionId,
          author: options.author,
          date,
        });
        const insertionMark = schema.marks.insertion.create({
          revisionId,
          author: options.author,
          date,
        });

        let tr = view.state.tr;
        if (!isInsertion) {
          tr = tr.addMark(textFrom, textTo, deletionMark);
        }
        if (!isDeletion) {
          const insertedNode = schema.text(options.replaceWith, [insertionMark]);
          tr = tr.insert(textTo, insertedNode);
        }

        if (isInsertion && isDeletion) return false; // nothing to do
        view.dispatch(tr);

        setShowCommentsSidebar(true);
        return true;
      },

      applyFormatting: (options) => {
        const view = pagedEditorRef.current?.getView();
        if (!view) return false;
        const { schema } = view.state;

        const range = findParaIdRange(view.state.doc, options.paraId);
        if (!range) return false;

        // Default range: the paragraph's text content (skip open/close tokens).
        let from = range.from + 1;
        let to = range.to - 1;

        if (options.search) {
          const textRange = findTextInPmParagraph(
            view.state.doc,
            range.from,
            range.to,
            options.search
          );
          if (!textRange) return false;
          from = textRange.from;
          to = textRange.to;
        }

        if (from >= to) return true;

        let tr = view.state.tr;
        const m = options.marks;

        if (m.bold !== undefined && schema.marks.bold) {
          tr = m.bold
            ? tr.addMark(from, to, schema.marks.bold.create())
            : tr.removeMark(from, to, schema.marks.bold);
        }
        if (m.italic !== undefined && schema.marks.italic) {
          tr = m.italic
            ? tr.addMark(from, to, schema.marks.italic.create())
            : tr.removeMark(from, to, schema.marks.italic);
        }
        if (m.underline !== undefined && schema.marks.underline) {
          if (m.underline) {
            const style = typeof m.underline === 'object' ? m.underline.style : undefined;
            tr = tr.addMark(from, to, schema.marks.underline.create({ style: style ?? 'single' }));
          } else {
            tr = tr.removeMark(from, to, schema.marks.underline);
          }
        }
        if (m.strike !== undefined && schema.marks.strike) {
          tr = m.strike
            ? tr.addMark(from, to, schema.marks.strike.create())
            : tr.removeMark(from, to, schema.marks.strike);
        }
        if (m.color !== undefined && schema.marks.textColor) {
          if (m.color && (m.color.rgb || m.color.themeColor)) {
            tr = tr.addMark(
              from,
              to,
              schema.marks.textColor.create({
                rgb: m.color.rgb ?? null,
                themeColor: m.color.themeColor ?? null,
              })
            );
          } else {
            tr = tr.removeMark(from, to, schema.marks.textColor);
          }
        }
        if (m.highlight !== undefined && schema.marks.highlight) {
          if (m.highlight) {
            const name = mapHexToHighlightName(m.highlight);
            tr = tr.addMark(
              from,
              to,
              schema.marks.highlight.create({ color: name || m.highlight })
            );
          } else {
            tr = tr.removeMark(from, to, schema.marks.highlight);
          }
        }
        if (m.fontSize !== undefined && schema.marks.fontSize) {
          if (m.fontSize > 0) {
            tr = tr.addMark(
              from,
              to,
              schema.marks.fontSize.create({ size: pointsToHalfPoints(m.fontSize) })
            );
          } else {
            tr = tr.removeMark(from, to, schema.marks.fontSize);
          }
        }
        if (m.fontFamily !== undefined && schema.marks.fontFamily) {
          if (m.fontFamily && (m.fontFamily.ascii || m.fontFamily.hAnsi)) {
            tr = tr.addMark(
              from,
              to,
              schema.marks.fontFamily.create({
                ascii: m.fontFamily.ascii ?? null,
                hAnsi: m.fontFamily.hAnsi ?? m.fontFamily.ascii ?? null,
              })
            );
          } else {
            tr = tr.removeMark(from, to, schema.marks.fontFamily);
          }
        }

        view.dispatch(tr);
        return true;
      },

      setParagraphStyle: (options) => {
        const view = pagedEditorRef.current?.getView();
        if (!view) return false;

        const range = findParaIdRange(view.state.doc, options.paraId);
        if (!range) return false;

        const currentDoc = historyStateRef.current;
        const styleResolver = currentDoc?.package?.styles
          ? getCachedStyleResolver(currentDoc.package.styles)
          : null;

        // Refuse unknown styleIds so the agent gets a clear error
        // instead of silently writing `<w:pStyle w:val="NoSuchStyle"/>`.
        // We only enforce this when we have a resolver — without one,
        // we can't know which styles are defined, so fall through.
        if (styleResolver && !styleResolver.hasParagraphStyle(options.styleId)) {
          return false;
        }

        // Build a synthetic state with selection inside the target paragraph
        // so applyStyle's cursor-driven walk lands on it. We restore the
        // original selection on the dispatched transaction.
        const $from = view.state.doc.resolve(range.from + 1);
        const $to = view.state.doc.resolve(range.to - 1);
        const paraSelection = TextSelection.between($from, $to);
        const stateWithSel = view.state.apply(view.state.tr.setSelection(paraSelection));

        const cmd = styleResolver
          ? (() => {
              const r = styleResolver.resolveParagraphStyle(options.styleId);
              return applyStyle(options.styleId, {
                paragraphFormatting: r.paragraphFormatting,
                runFormatting: r.runFormatting,
              });
            })()
          : applyStyle(options.styleId);

        let didApply = false;
        cmd(stateWithSel, (newTr) => {
          didApply = true;
          newTr.setSelection(view.state.selection.map(newTr.doc, newTr.mapping));
          view.dispatch(newTr);
        });

        return didApply;
      },

      getPageContent: (pageNumber) => {
        const layout = pagedEditorRef.current?.getLayout();
        if (!layout) return null;
        const page = layout.pages[pageNumber - 1];
        if (!page) return null;
        const view = pagedEditorRef.current?.getView();
        if (!view) return null;
        const doc = view.state.doc;

        const seen = new Set<string>();
        const paragraphs: Array<{ paraId: string; text: string; styleId?: string }> = [];

        for (const frag of page.fragments) {
          if (frag.kind !== 'paragraph') continue;
          // `pmStart` is the position immediately before the paragraph node;
          // `doc.nodeAt(pmStart)` resolves to the paragraph itself.
          const pmStart = frag.pmStart;
          if (pmStart == null) continue;
          const node = doc.nodeAt(pmStart);
          if (!node || !node.isTextblock) continue;

          const paraId = node.attrs?.paraId as string | undefined;
          if (!paraId || seen.has(paraId)) continue;
          seen.add(paraId);
          paragraphs.push({
            paraId,
            text: getVanillaNodeText(node),
            styleId: (node.attrs?.styleId as string | undefined) ?? undefined,
          });
        }

        const text = paragraphs.map((p) => `[${p.paraId}] ${p.text}`).join('\n');
        return { pageNumber, text, paragraphs };
      },

      scrollToParaId: (paraId) => pagedEditorRef.current?.scrollToParaId(paraId) ?? false,

      findInDocument: (query, opts) => {
        const view = pagedEditorRef.current?.getView();
        if (!view || !query) return [];
        const caseSensitive = opts?.caseSensitive ?? false;
        const limit = opts?.limit ?? 20;
        const needle = caseSensitive ? query : query.toLowerCase();
        const results: Array<{
          paraId: string;
          match: string;
          before: string;
          after: string;
        }> = [];

        view.state.doc.descendants((node) => {
          if (results.length >= limit) return false;
          if (!node.isTextblock) return true;
          const paraId = node.attrs?.paraId as string | undefined;
          if (!paraId) return false;
          const text = getVanillaNodeText(node);
          const haystack = caseSensitive ? text : text.toLowerCase();
          const at = haystack.indexOf(needle);
          if (at === -1) return false;

          // Reject ambiguous matches in the same paragraph — agent should narrow query.
          if (haystack.indexOf(needle, at + 1) !== -1) return false;

          const match = text.slice(at, at + query.length);
          const CONTEXT = 40;
          results.push({
            paraId,
            match,
            before: text.slice(Math.max(0, at - CONTEXT), at),
            after: text.slice(at + query.length, at + query.length + CONTEXT),
          });
          return false;
        });

        return results;
      },

      getSelectionInfo: () => {
        const view = pagedEditorRef.current?.getView();
        if (!view) return null;
        const { selection, doc } = view.state;
        const $from = selection.$from;
        // Walk up to nearest textblock
        let depth = $from.depth;
        while (depth > 0 && !$from.node(depth).isTextblock) depth--;
        const para = depth > 0 ? $from.node(depth) : null;
        if (!para) return null;
        const paraId = (para.attrs?.paraId as string | undefined) ?? null;
        const paraStart = $from.start(depth);
        const paraEnd = paraStart + para.content.size;
        // Vanilla view: build before/selectedText/after independently from the
        // doc so the result matches what the agent reads via read_document and
        // can anchor via add_comment. Insertion-marked text never appears.
        const before = getVanillaTextBetween(doc, paraStart, selection.from);
        const selectedText = getVanillaTextBetween(doc, selection.from, selection.to);
        const after = getVanillaTextBetween(doc, selection.to, paraEnd);
        return {
          paraId,
          selectedText,
          paragraphText: before + selectedText + after,
          before,
          after,
        };
      },

      getComments: () => comments,

      onContentChange: (listener) => {
        contentChangeSubscribersRef.current.add(listener);
        return () => {
          contentChangeSubscribersRef.current.delete(listener);
        };
      },

      onSelectionChange: (listener) => {
        selectionChangeSubscribersRef.current.add(listener);
        return () => {
          selectionChangeSubscribersRef.current.delete(listener);
        };
      },
    }),
    [
      history.state,
      state.zoom,
      scrollPageInfo,
      handleSave,
      handleDirectPrint,
      loadParsedDocument,
      loadBuffer,
      comments,
    ]
  );

  const initialSectionProperties = useMemo(
    () => getInitialSectionProperties(history.state),
    [history.state]
  );
  const finalSectionProperties = history.state?.package.document?.finalSectionProperties;

  // Get header and footer content from document
  const { headerContent, footerContent, firstPageHeaderContent, firstPageFooterContent } = useMemo<{
    headerContent: HeaderFooter | null;
    footerContent: HeaderFooter | null;
    firstPageHeaderContent: HeaderFooter | null;
    firstPageFooterContent: HeaderFooter | null;
  }>(() => {
    if (!history.state?.package) {
      return {
        headerContent: null,
        footerContent: null,
        firstPageHeaderContent: null,
        firstPageFooterContent: null,
      };
    }

    const pkg = history.state.package;
    const sectionProps = finalSectionProperties ?? initialSectionProperties;
    const headers = pkg.headers;
    const footers = pkg.footers;

    let header: HeaderFooter | null = null;
    let footer: HeaderFooter | null = null;
    let firstHeader: HeaderFooter | null = null;
    let firstFooter: HeaderFooter | null = null;

    // Per OOXML §17.6.21, a `<w:sectPr>` that omits a `<w:headerReference>`
    // or `<w:footerReference>` for a given type INHERITS that reference
    // from the most recent preceding section that defined it. Multi-section
    // documents (e.g. the SDS template the user supplied — 30 sections,
    // header refs only on sections[0]) need this walk; the last section's
    // properties alone don't carry the reference forward to the renderer.
    const findInheritedRefs = (
      kind: 'headerReferences' | 'footerReferences'
    ): HeaderReference[] | FooterReference[] | undefined => {
      const own = sectionProps?.[kind];
      if (own && own.length > 0) return own;
      const sections = pkg.document?.sections;
      if (!Array.isArray(sections)) return undefined;
      for (let i = sections.length - 1; i >= 0; i--) {
        const refs = sections[i]?.properties?.[kind];
        if (refs && refs.length > 0) return refs;
      }
      return undefined;
    };

    const effHeaderRefs = findInheritedRefs('headerReferences') as HeaderReference[] | undefined;
    const effFooterRefs = findInheritedRefs('footerReferences') as FooterReference[] | undefined;

    if (headers && effHeaderRefs) {
      const defaultRef = effHeaderRefs.find((r) => r.type === 'default');
      if (defaultRef?.rId) {
        header = headers.get(defaultRef.rId) ?? null;
      }
      const firstRef = effHeaderRefs.find((r) => r.type === 'first');
      if (firstRef?.rId) {
        firstHeader = headers.get(firstRef.rId) ?? null;
      }
    }

    if (footers && effFooterRefs) {
      const defaultRef = effFooterRefs.find((r) => r.type === 'default');
      if (defaultRef?.rId) {
        footer = footers.get(defaultRef.rId) ?? null;
      }
      const firstRef = effFooterRefs.find((r) => r.type === 'first');
      if (firstRef?.rId) {
        firstFooter = footers.get(firstRef.rId) ?? null;
      }
    }

    // When titlePg is not set but only 'first' headers exist, use them as default
    if (!sectionProps?.titlePg) {
      if (!header && firstHeader) header = firstHeader;
      if (!footer && firstFooter) footer = firstFooter;
    }

    return {
      headerContent: header,
      footerContent: footer,
      firstPageHeaderContent: firstHeader,
      firstPageFooterContent: firstFooter,
    };
  }, [history.state, initialSectionProperties, finalSectionProperties]);

  // Handle header/footer double-click — open editing overlay
  // If no header/footer exists, create an empty one so the user can add content
  const handleHeaderFooterDoubleClick = useCallback(
    (position: 'header' | 'footer', pageNumber?: number) => {
      const sectProps = history.state?.package?.document?.finalSectionProperties;
      const isFirstPage = sectProps?.titlePg === true && (pageNumber ?? 1) === 1;
      const hf = isFirstPage
        ? position === 'header'
          ? firstPageHeaderContent
          : firstPageFooterContent
        : position === 'header'
          ? headerContent
          : footerContent;
      setHfEditIsFirstPage(isFirstPage);
      if (hf) {
        setHfEditPosition(position);
        return;
      }

      // Create empty header/footer for docs that don't have one yet
      if (!history.state?.package) return;
      const pkg = history.state.package;
      const sectionProps = pkg.document?.finalSectionProperties;
      if (!sectionProps) return;

      const hdrFtrType = isFirstPage ? 'first' : 'default';
      const rId = `rId_new_${position}_${hdrFtrType}`;
      const emptyHf: HeaderFooter = {
        type: position === 'header' ? 'header' : 'footer',
        hdrFtrType,
        content: [{ type: 'paragraph', content: [] }],
      };

      const mapKey = position === 'header' ? 'headers' : 'footers';
      const newMap = new Map(pkg[mapKey] ?? []);
      newMap.set(rId, emptyHf);

      const refKey = position === 'header' ? 'headerReferences' : 'footerReferences';
      const existingRefs = sectionProps[refKey] ?? [];
      const newRef = { type: hdrFtrType as 'default' | 'first', rId };

      // Register the rel so the serializer wires up content types + doc rels (#274).
      const existingRels = pkg.relationships;
      const usedTargets = new Set<string>();
      for (const rel of existingRels?.values() ?? []) {
        if (rel.target) usedTargets.add(rel.target);
      }
      let targetNum = 1;
      while (usedTargets.has(`${position}${targetNum}.xml`)) targetNum++;
      const relType =
        position === 'header'
          ? 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header'
          : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer';
      const newRelationships = new Map(existingRels);
      newRelationships.set(rId, {
        id: rId,
        type: relType,
        target: `${position}${targetNum}.xml`,
      });

      const newDoc: Document = {
        ...history.state,
        package: {
          ...pkg,
          [mapKey]: newMap,
          relationships: newRelationships,
          document: pkg.document
            ? {
                ...pkg.document,
                finalSectionProperties: {
                  ...sectionProps,
                  [refKey]: [...existingRefs, newRef],
                },
              }
            : pkg.document,
        },
      };
      pushDocument(newDoc);
      setHfEditPosition(position);
    },
    [
      headerContent,
      footerContent,
      firstPageHeaderContent,
      firstPageFooterContent,
      history,
      pushDocument,
    ]
  );

  // Handle header/footer save — update document package with edited content
  const handleHeaderFooterSave = useCallback(
    (
      content: (
        | import('@eigenpal/docx-core/types/document').Paragraph
        | import('@eigenpal/docx-core/types/document').Table
      )[]
    ) => {
      if (!hfEditPosition || !history.state?.package) {
        setHfEditPosition(null);
        return;
      }

      const pkg = history.state.package;
      const sectionProps = pkg.document?.finalSectionProperties;
      const refs =
        hfEditPosition === 'header'
          ? sectionProps?.headerReferences
          : sectionProps?.footerReferences;
      const targetType = hfEditIsFirstPage ? 'first' : 'default';
      const activeRef =
        refs?.find((r) => r.type === targetType) ??
        refs?.find((r) => r.type === 'default') ??
        refs?.find((r) => r.type === 'first') ??
        refs?.[0];
      const mapKey = hfEditPosition === 'header' ? 'headers' : 'footers';
      const map = pkg[mapKey];

      if (activeRef?.rId && map) {
        const existing = map.get(activeRef.rId);
        const updated: HeaderFooter = {
          type: hfEditPosition,
          hdrFtrType: activeRef.type as 'default' | 'first' | 'even',
          ...existing,
          content,
        };
        const newMap = new Map(map);
        newMap.set(activeRef.rId, updated);

        const newDoc: Document = {
          ...history.state,
          package: {
            ...pkg,
            [mapKey]: newMap,
          },
        };
        pushDocument(newDoc);
      }

      setHfEditPosition(null);
    },
    [hfEditPosition, history, pushDocument]
  );

  // Handle body click while in HF editing mode — save + close
  const handleBodyClick = useCallback(() => {
    if (!hfEditPosition) return;
    // Save if dirty, then close
    const view = hfEditorRef.current?.getView();
    if (view) {
      const blocks = proseDocToBlocks(view.state.doc);
      handleHeaderFooterSave(blocks);
    } else {
      setHfEditPosition(null);
    }
  }, [hfEditPosition, handleHeaderFooterSave]);

  // Toggle the OOXML `w:titlePg` flag on the document's section
  // properties. When on, page 1 renders its own header/footer slot;
  // off restores the unified header/footer behaviour. The layout
  // engine already honours the flag; this just wires the on/off
  // mutation behind the HF options dropdown.
  const handleToggleTitlePg = useCallback(
    (value: boolean) => {
      if (!history.state?.package?.document) return;
      const pkg = history.state.package;
      const sectionProps = pkg.document.finalSectionProperties;
      pushDocument({
        ...history.state,
        package: {
          ...pkg,
          document: {
            ...pkg.document,
            finalSectionProperties: {
              ...sectionProps,
              titlePg: value,
            },
          },
        },
      });
    },
    [history, pushDocument]
  );

  // Toggle `w:evenAndOddHeaders` (lives on settings.xml in OOXML, but
  // exposed here off the document object alongside titlePg). Painter
  // reads this flag to render an alternate even-page H/F.
  const handleToggleEvenAndOddHeaders = useCallback(
    (value: boolean) => {
      if (!history.state?.package?.document) return;
      const pkg = history.state.package;
      const sectionProps = pkg.document.finalSectionProperties;
      pushDocument({
        ...history.state,
        package: {
          ...pkg,
          document: {
            ...pkg.document,
            finalSectionProperties: {
              ...sectionProps,
              evenAndOddHeaders: value,
            },
          },
        },
      });
    },
    [history, pushDocument]
  );

  // Handle removing the header/footer entirely
  const handleRemoveHeaderFooter = useCallback(() => {
    if (!hfEditPosition || !history.state?.package) {
      setHfEditPosition(null);
      return;
    }

    const pkg = history.state.package;
    const sectionProps = pkg.document?.finalSectionProperties;
    const refKey = hfEditPosition === 'header' ? 'headerReferences' : 'footerReferences';
    const mapKey = hfEditPosition === 'header' ? 'headers' : 'footers';
    const refs = sectionProps?.[refKey];
    const delTargetType = hfEditIsFirstPage ? 'first' : 'default';
    const activeRef =
      refs?.find((r) => r.type === delTargetType) ??
      refs?.find((r) => r.type === 'default') ??
      refs?.find((r) => r.type === 'first') ??
      refs?.[0];

    if (activeRef?.rId) {
      const newMap = new Map(pkg[mapKey] ?? []);
      newMap.delete(activeRef.rId);

      const newRefs = (refs ?? []).filter((r) => r.rId !== activeRef.rId);

      const newDoc: Document = {
        ...history.state,
        package: {
          ...pkg,
          [mapKey]: newMap,
          document: pkg.document
            ? {
                ...pkg.document,
                finalSectionProperties: {
                  ...sectionProps,
                  [refKey]: newRefs,
                },
              }
            : pkg.document,
        },
      };
      pushDocument(newDoc);
    }

    setHfEditPosition(null);
  }, [hfEditPosition, history, pushDocument]);

  // Get the DOM element for the header/footer area on the first page
  const getHfTargetElement = useCallback((pos: 'header' | 'footer'): HTMLElement | null => {
    const pagesContainer = containerRef.current?.querySelector('.paged-editor__pages');
    if (!pagesContainer) return null;
    const className = pos === 'header' ? '.layout-page-header' : '.layout-page-footer';
    return pagesContainer.querySelector(className);
  }, []);

  // Container styles - using overflow: auto so sticky toolbar works
  const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%',
    backgroundColor: 'var(--doc-bg)',
    ...style,
  };

  const mainContentStyle: CSSProperties = {
    display: 'flex',
    flex: 1,
    minHeight: 0, // Allow flex item to shrink below content size
    minWidth: 0, // Allow flex item to shrink below content width on narrow viewports
    flexDirection: 'row',
  };

  // --- Unified sidebar items ---
  const commentCallbacksRef = useRef<CommentCallbacks>({});
  commentCallbacksRef.current = {
    onCommentReply: (id, text) => {
      const reply = createComment(text, author, id);
      const parent = comments.find((c) => c.id === id);
      setComments((prev) => [...prev, reply]);
      if (parent) onCommentReply?.(reply, parent);
    },
    onCommentResolve: (id) => {
      const target = comments.find((c) => c.id === id);
      setComments((prev) => prev.map((c) => (c.id === id ? { ...c, done: true } : c)));
      // Collapse the card to its checkmark marker immediately. Resolving
      // doesn't go through a PM transaction, so the cursor-based collapse
      // path wouldn't fire; do it explicitly. Cascades into the highlight
      // hide via resolvedIdsForRender.
      if (expandedSidebarItem === `comment-${id}`) {
        setExpandedSidebarItem(null);
      }
      if (target) onCommentResolve?.({ ...target, done: true });
    },
    onCommentUnresolve: (id) => {
      setComments((prev) => prev.map((c) => (c.id === id ? { ...c, done: undefined } : c)));
    },
    onCommentDelete: (id) => {
      const target = comments.find((c) => c.id === id);
      setComments((prev) => prev.filter((c) => c.id !== id && c.parentId !== id));
      // Remove the comment mark from PM to clear the yellow highlight
      const view = pagedEditorRef.current?.getView();
      if (view) {
        const mark = view.state.schema.marks.comment?.create({ commentId: id });
        if (mark) {
          const tr = view.state.tr.removeMark(0, view.state.doc.content.size, mark);
          if (tr.docChanged) view.dispatch(tr);
        }
      }
      if (target) onCommentDelete?.(target);
    },
    onAddComment: (addText) => {
      const comment = createComment(addText, author);
      const view = pagedEditorRef.current?.getView();
      if (view && commentSelectionRange) {
        const { from, to } = commentSelectionRange;
        const pendingMark = view.state.schema.marks.comment.create({
          commentId: PENDING_COMMENT_ID,
        });
        const realMark = view.state.schema.marks.comment.create({
          commentId: comment.id,
        });
        const tr = view.state.tr.removeMark(from, to, pendingMark).addMark(from, to, realMark);
        view.dispatch(tr);
      }
      setComments((prev) => [...prev, comment]);
      setIsAddingComment(false);
      setCommentSelectionRange(null);
      setAddCommentYPosition(null);
      onCommentAdd?.(comment);
    },
    onCancelAddComment: () => {
      const view = pagedEditorRef.current?.getView();
      if (view && commentSelectionRange) {
        const { from, to } = commentSelectionRange;
        const pendingMark = view.state.schema.marks.comment.create({
          commentId: PENDING_COMMENT_ID,
        });
        view.dispatch(view.state.tr.removeMark(from, to, pendingMark));
      }
      setIsAddingComment(false);
      setCommentSelectionRange(null);
      setAddCommentYPosition(null);
    },
    onAcceptChange: (from, to) => {
      const view = pagedEditorRef.current?.getView();
      if (view) acceptChange(from, to)(view.state, view.dispatch);
      // No explicit re-extract: the dispatch fires `handleDocumentChange`,
      // which mirrors the new PM state into `pmState` and `useTrackedChanges`
      // re-derives.
    },
    onRejectChange: (from, to) => {
      const view = pagedEditorRef.current?.getView();
      if (view) rejectChange(from, to)(view.state, view.dispatch);
    },
    onTrackedChangeReply: (revisionId, text) => {
      setComments((prev) => [...prev, createComment(text, author, revisionId)]);
    },
  };

  // Bulk tracked-change actions used by the suggesting-mode sidebar
  // header bar. Each command lives in @eigenpal/docx-core; this is just
  // a focus + scroll convenience wrapper.
  const handleAcceptAllChanges = useCallback(() => {
    const view = pagedEditorRef.current?.getView();
    if (!view) return;
    acceptAllChanges()(view.state, view.dispatch);
  }, []);
  const handleRejectAllChanges = useCallback(() => {
    const view = pagedEditorRef.current?.getView();
    if (!view) return;
    rejectAllChanges()(view.state, view.dispatch);
  }, []);
  const handleNextChange = useCallback(() => {
    const view = pagedEditorRef.current?.getView();
    if (!view) return;
    const cursor = view.state.selection.from;
    const next = findNextChange(view.state, cursor);
    if (next) {
      view.dispatch(
        view.state.tr
          .setSelection(TextSelection.create(view.state.doc, next.from, next.to))
          .scrollIntoView()
      );
      view.focus();
    }
  }, []);
  const handlePreviousChange = useCallback(() => {
    const view = pagedEditorRef.current?.getView();
    if (!view) return;
    const cursor = view.state.selection.from;
    const prev = findPreviousChange(view.state, cursor);
    if (prev) {
      view.dispatch(
        view.state.tr
          .setSelection(TextSelection.create(view.state.doc, prev.from, prev.to))
          .scrollIntoView()
      );
      view.focus();
    }
  }, []);

  // Stable callbacks wrapper that delegates to ref (avoids recreating items on every render)
  const stableCallbacks = useMemo<CommentCallbacks>(
    () => ({
      onCommentReply: (...args) => commentCallbacksRef.current.onCommentReply?.(...args),
      onCommentResolve: (...args) => commentCallbacksRef.current.onCommentResolve?.(...args),
      onCommentUnresolve: (...args) => commentCallbacksRef.current.onCommentUnresolve?.(...args),
      onCommentDelete: (...args) => commentCallbacksRef.current.onCommentDelete?.(...args),
      onAddComment: (...args) => commentCallbacksRef.current.onAddComment?.(...args),
      onCancelAddComment: (...args) => commentCallbacksRef.current.onCancelAddComment?.(...args),
      onAcceptChange: (...args) => commentCallbacksRef.current.onAcceptChange?.(...args),
      onRejectChange: (...args) => commentCallbacksRef.current.onRejectChange?.(...args),
      onTrackedChangeReply: (...args) =>
        commentCallbacksRef.current.onTrackedChangeReply?.(...args),
    }),
    []
  );

  const commentSidebarItems = useCommentSidebarItems({
    comments,
    trackedChanges,
    callbacks: stableCallbacks,
    showResolved: showCommentsSidebar,
    isAddingComment: showCommentsSidebar ? isAddingComment : false,
    addCommentYPosition,
    currentAuthor: author,
  });

  const allSidebarItems = useMemo(() => {
    const items: ReactSidebarItem[] = [];
    if (showCommentsSidebar) items.push(...commentSidebarItems);
    if (pluginSidebarItems) items.push(...pluginSidebarItems);
    return items;
  }, [showCommentsSidebar, commentSidebarItems, pluginSidebarItems]);

  // Build a map from insertion revisionIds to sidebar item IDs for replacement tracked changes.
  // This allows clicking the insertion part of a replacement to activate the same sidebar card.
  const revisionIdAliases = useMemo(() => {
    const map = new Map<string, string>();
    trackedChanges.forEach((change, idx) => {
      if (change.type === 'replacement' && change.insertionRevisionId != null) {
        map.set(String(change.insertionRevisionId), `tc-${change.revisionId}-${idx}`);
      }
    });
    return map;
  }, [trackedChanges]);

  // "Sidebar open" drives PagedEditor's left-translate so the centered
  // page makes horizontal room for Comments and per-anchor plugin
  // items, which both live inside PagedEditor's sidebarOverlay. Version
  // history is a flex sibling of the scroll container (see below) so
  // it reserves real horizontal space via the flex layout and doesn't
  // need the translate hack.
  const sidebarOpen = showCommentsSidebar || allSidebarItems.length > 0;
  // Reserve 2× the left-edge allowance so the centered page clears whatever
  // outline UI is showing, without forcing a shift on wide viewports.
  const outlineLeftAllowance = showOutline
    ? OUTLINE_RESERVED_SPACE
    : showOutlineButton
      ? OUTLINE_BUTTON_RESERVED_SPACE
      : 20;
  const minLayoutWidth =
    2 * outlineLeftAllowance + DEFAULT_PAGE_WIDTH + (sidebarOpen ? SIDEBAR_DOCUMENT_SHIFT * 2 : 0);

  const sectionPropsPageWidth = history.state?.package?.document?.finalSectionProperties?.pageWidth;
  const pageWidthPx = sectionPropsPageWidth
    ? Math.round(sectionPropsPageWidth / 15)
    : DEFAULT_PAGE_WIDTH;

  const resolvedCommentIds = useMemo(() => {
    const ids = new Set<number>();
    for (const c of comments) {
      if (c.done && c.parentId == null) ids.add(c.id);
    }
    return ids;
  }, [comments]);

  // Exclude expanded resolved comment from hide-set so its text gets highlighted
  const resolvedIdsForRender = useMemo(() => {
    if (!expandedSidebarItem?.startsWith('comment-')) return resolvedCommentIds;
    const expandedId = parseInt(expandedSidebarItem.slice(8), 10);
    if (isNaN(expandedId) || !resolvedCommentIds.has(expandedId)) return resolvedCommentIds;
    const ids = new Set(resolvedCommentIds);
    ids.delete(expandedId);
    return ids;
  }, [resolvedCommentIds, expandedSidebarItem]);

  const editorContainerStyle: CSSProperties = {
    flex: 1,
    minHeight: 0,
    minWidth: 0, // Allow flex item to shrink below content width on narrow viewports
    overflow: 'auto', // Sole scroll container — PagedEditor sizes to content
    position: 'relative',
    overflowAnchor: 'none',
  };

  // Render loading state
  if (state.isLoading) {
    return (
      <div
        className={`ep-root docx-editor docx-editor-loading ${className}`}
        style={containerStyle}
        data-testid="docx-editor"
      >
        {loadingIndicator || <DefaultLoadingIndicator />}
      </div>
    );
  }

  // Render error state
  if (state.parseError) {
    return (
      <div
        className={`ep-root docx-editor docx-editor-error ${className}`}
        style={containerStyle}
        data-testid="docx-editor"
      >
        <ParseError message={state.parseError} />
      </div>
    );
  }

  // Render placeholder when no document
  if (!history.state) {
    return (
      <div
        className={`ep-root docx-editor docx-editor-empty ${className}`}
        style={containerStyle}
        data-testid="docx-editor"
      >
        {placeholder || <DefaultPlaceholder />}
      </div>
    );
  }

  const toolbarChildren = (
    <>
      {/* Comments + Version-history toggles moved into the right-edge
          PanelRail (sheet parity). The formatting toolbar keeps only
          the mode-dropdown affordance on this trailing edge. */}
      <ToolbarSeparator />
      <EditingModeDropdown
        mode={editingMode}
        onModeChange={(mode) => {
          setEditingMode(mode);
          if (mode === 'suggesting') setShowCommentsSidebar(true);
        }}
      />
      {agentPanel && agentPanel.showToolbarButton !== false && (
        <>
          <ToolbarSeparator />
          <AgentPanelToggle
            active={agentPanelOpen}
            badge={agentPanel.toolbarBadge}
            onClick={() => setAgentPanelOpen(!agentPanelOpen)}
          />
        </>
      )}
      {toolbarExtra}
    </>
  );

  return (
    <LocaleProvider i18n={i18n}>
      <ErrorProvider>
        <ErrorBoundary onError={handleEditorError}>
          <div
            ref={containerRef}
            className={`ep-root docx-editor ${className}`}
            style={containerStyle}
            data-testid="docx-editor"
          >
            {/* Main content area */}
            <div style={mainContentStyle}>
              {/* Wrapper for toolbar + scroll container + outline overlay */}
              <div
                style={{
                  position: 'relative',
                  flex: 1,
                  minHeight: 0,
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* Toolbar - above the scroll container so scrollbar doesn't extend behind it */}
                {/* Hide toolbar only when readOnly prop is explicitly set (not from viewing mode) */}
                {showToolbar && !readOnlyProp && (
                  <div ref={toolbarRefCallback} className="z-50 flex flex-col gap-0 flex-shrink-0">
                    <EditorToolbar
                      // When the agent panel is open, round the toolbar's
                      // bottom-right corner so it mirrors the panel's top-left.
                      // The radius transition (inline style on the inner div)
                      // makes opening / closing ease instead of snap.
                      className={agentPanelOpen ? 'rounded-br-2xl' : undefined}
                      style={{
                        transition: 'border-radius 220ms cubic-bezier(0.4, 0, 0.2, 1)',
                      }}
                      currentFormatting={state.selectionFormatting}
                      onFormat={handleFormat}
                      onUndo={undoActiveEditor}
                      onRedo={redoActiveEditor}
                      canUndo={canUndoActiveEditor}
                      canRedo={canRedoActiveEditor}
                      disabled={readOnly}
                      documentStyles={history.state?.package.styles?.styles}
                      theme={history.state?.package.theme || theme}
                      showPrintButton={showPrintButton}
                      fontFamilies={fontFamilies}
                      onPrint={handleDirectPrint}
                      onOpen={handleOpenDocument}
                      onSave={handleDownloadDocument}
                      onMakeCopy={handleMakeCopy}
                      onEmailAsAttachment={handleEmailAsAttachment}
                      onNew={onNew}
                      showZoomControl={showZoomControl}
                      zoom={state.zoom}
                      onZoomChange={handleZoomChange}
                      onRefocusEditor={focusActiveEditor}
                      onInsertTable={handleInsertTable}
                      showTableInsert={true}
                      onInsertImage={handleInsertImageClick}
                      onInsertPageBreak={handleInsertPageBreak}
                      onInsertSectionBreak={handleInsertSectionBreak}
                      onInsertField={handleInsertField}
                      onInsertTOC={handleInsertTOC}
                      onOpenBookmarks={() => setBookmarksDialogOpen(true)}
                      onOpenCharacterSpacing={handleOpenCharacterSpacing}
                      onOpenParagraphDialog={handleOpenParagraphDialog}
                      onOpenBordersShading={handleOpenBordersShading}
                      onAddComment={handleStartAddComment}
                      onPaintFormat={handleTogglePaintFormat}
                      paintFormatArmed={paintFormatMarks != null}
                      onInsertHorizontalRule={handleInsertHorizontalRule}
                      onInsertFootnote={handleInsertFootnote}
                      onOpenInsertSymbol={handleOpenInsertSymbol}
                      onToggleShowRuler={handleToggleShowRuler}
                      rulerVisible={showRulerEffective}
                      onToggleShowFormattingMarks={handleToggleShowFormattingMarks}
                      showFormattingMarks={showFormattingMarks}
                      onToggleOutline={handleToggleOutline}
                      outlineVisible={showOutline}
                      imageContext={state.pmImageContext}
                      onImageWrapType={handleImageWrapType}
                      onImageTransform={handleImageTransform}
                      onOpenImageProperties={handleOpenImageProperties}
                      onPageSetup={handleOpenPageSetup}
                      onFileProperties={handleOpenFileProperties}
                      onOpenWordCount={handleOpenWordCount}
                      onToggleVoiceTyping={
                        voiceTyping.supported ? handleToggleVoiceTyping : undefined
                      }
                      voiceTypingActive={voiceTyping.isListening}
                      onExportPdf={handleExportPdf}
                      onExportOdt={handleExportOdt}
                      onExportMd={handleExportMd}
                      onExportTxt={handleExportTxt}
                      onReportBug={handleReportBug}
                      onShowAbout={handleShowAbout}
                      onOpenCommandPalette={() => setShowCommandPalette(true)}
                      onOpenKeyboardShortcuts={() => setShowKeyboardShortcuts(true)}
                      onOpenPreferences={() => setShowPreferences(true)}
                      onOpenWatermark={() => setShowWatermarkDialog(true)}
                      onOpenAccessibility={handleOpenAccessibility}
                      onOpenBuildingBlocks={handleOpenBuildingBlocks}
                      onConvertSelectionToTable={handleConvertSelectionToTable}
                      onConvertTableToText={
                        state.pmTableContext?.isInTable ? handleConvertTableToText : undefined
                      }
                      onOpenDictionary={handleOpenDictionary}
                      onOpenTranslate={handleOpenTranslate}
                      onTranslateDocument={() => setShowTranslateDocument(true)}
                      onToggleSpellcheck={handleToggleSpellcheck}
                      spellcheckEnabled={spellOn}
                      onOpenWritingAssistant={() => setShowWritingAssistant(true)}
                      onOpenExplore={handleOpenExplore}
                      onOpenCitations={handleOpenCitations}
                      onInsertShape={handleInsertShape}
                      onSetColorTheme={handleSetColorTheme}
                      colorTheme={colorTheme}
                      isDirty={isDirty}
                      isSaving={isSaving}
                      tableContext={state.pmTableContext}
                      onTableAction={handleTableAction}
                    >
                      <EditorToolbar.TitleBar>
                        {renderLogo && <EditorToolbar.Logo>{renderLogo()}</EditorToolbar.Logo>}
                        {documentName !== undefined && (
                          <EditorToolbar.DocumentName
                            value={documentName}
                            onChange={onDocumentNameChange}
                            editable={documentNameEditable}
                          />
                        )}
                        {renderTitleBarRight && (
                          <EditorToolbar.TitleBarRight>
                            {renderTitleBarRight()}
                          </EditorToolbar.TitleBarRight>
                        )}
                        <EditorToolbar.MenuBar />
                      </EditorToolbar.TitleBar>
                      <EditorToolbar.FormattingBar>{toolbarChildren}</EditorToolbar.FormattingBar>
                    </EditorToolbar>
                  </div>
                )}

                {editingMode === 'suggesting' && (
                  <SuggestingModeBanner onSwitchToEditing={() => setEditingMode('editing')} />
                )}

                {/* Autosave restore prompt — shown at mount when an autosave
                    record exists from the last session. The Restore handler
                    routes the saved buffer through the same `loadBuffer` path
                    File → Open uses, so PM + UI state reset cleanly. */}
                <AutosaveRestoreBanner
                  onRestore={(buf, name) => {
                    void loadBuffer(buf);
                    onDocumentNameChange?.(name);
                  }}
                />

                {/* Below-toolbar horizontal row: scroll container + right-edge
                    PanelRail. The rail sits inside this wrapper so it spans
                    only the editor body's height, not the toolbar's. */}
                <div
                  style={{
                    display: 'flex',
                    flex: 1,
                    minHeight: 0,
                    minWidth: 0,
                    flexDirection: 'row',
                  }}
                >
                  {/* Editor container - this is the scroll container (toolbar is above, not inside) */}
                  <div
                    ref={scrollContainerRef}
                    style={editorContainerStyle}
                    onMouseDown={(e) => {
                      // Click in the grey gutter around the page → collapse any
                      // expanded sidebar card. Clicks on the doc body already
                      // collapse via the cursor-mark detector; clicks inside the
                      // sidebar are user interactions with the card itself.
                      const target = e.target as HTMLElement;
                      if (
                        target.closest('.paged-editor__pages') ||
                        target.closest('.docx-unified-sidebar') ||
                        target.closest('.docx-comment-margin-markers')
                      ) {
                        return;
                      }
                      setExpandedSidebarItem(null);
                    }}
                  >
                    {/* Horizontal Ruler - inside the scroll container so it
                      scrolls horizontally with the doc, sticky-top so it stays
                      visible during vertical scroll. min-width keeps the ruler
                      and the page area on the same horizontal axis when the
                      viewport is too narrow to fit page + outline + sidebar. */}
                    {showRulerEffective && (
                      <div
                        className="flex justify-center py-1 flex-shrink-0 bg-doc-bg"
                        style={{
                          position: 'sticky',
                          top: 0,
                          // Must sit above the inline header/footer editor
                          // (Z_INDEX.hfInlineEditor) so the ruler stays readable
                          // when the HF editor is active near the viewport top.
                          zIndex: Z_INDEX.ruler,
                          // paddingRight biases the centered ruler so it tracks
                          // the page when the comments sidebar (translateX)
                          // shifts the page left. Outline doesn't bias here —
                          // the page stays centered until minLayoutWidth forces
                          // horizontal scroll, and the ruler centers with it.
                          paddingLeft: 20,
                          paddingRight: 20 + (sidebarOpen ? SIDEBAR_DOCUMENT_SHIFT * 2 : 0),
                          minWidth: minLayoutWidth,
                          transition: 'padding 0.2s ease',
                        }}
                      >
                        <HorizontalRuler
                          sectionProps={history.state?.package.document?.finalSectionProperties}
                          zoom={state.zoom}
                          unit={rulerUnit}
                          editable={!readOnly}
                          onLeftMarginChange={handleLeftMarginChange}
                          onRightMarginChange={handleRightMarginChange}
                          indentLeft={state.paragraphIndentLeft}
                          indentRight={state.paragraphIndentRight}
                          onIndentLeftChange={handleIndentLeftChange}
                          onIndentRightChange={handleIndentRightChange}
                          showFirstLineIndent={true}
                          firstLineIndent={state.paragraphFirstLineIndent}
                          hangingIndent={state.paragraphHangingIndent}
                          onFirstLineIndentChange={handleFirstLineIndentChange}
                          tabStops={state.paragraphTabs}
                          onTabStopRemove={handleTabStopRemove}
                        />
                      </div>
                    )}
                    {/* Editor content wrapper. min-width matches the ruler so
                      the page and ruler scroll horizontally as a single unit
                      when the viewport is too narrow to fit them. When the
                      outline is open, min-width grows to keep the centered
                      page clear of the panel — but on wide viewports the
                      page stays put (centered, or translated left by the
                      comments sidebar) instead of shifting. */}
                    <div
                      style={{
                        display: 'flex',
                        flex: 1,
                        minHeight: 0,
                        position: 'relative',
                        minWidth: minLayoutWidth,
                      }}
                    >
                      {/* Editor content area */}
                      <div
                        ref={editorContentRef}
                        style={{
                          position: 'relative',
                          flex: 1,
                          minWidth: 0,
                        }}
                        onMouseDown={(e) => {
                          // Focus editor when clicking on the background area (not the editor itself)
                          // Using mouseDown for immediate response before focus can be lost
                          if (e.target === e.currentTarget) {
                            e.preventDefault();
                            pagedEditorRef.current?.focus();
                          }
                        }}
                        onContextMenu={handleEditorContextMenu}
                      >
                        {/* Vertical Ruler - sits at the editor content's left
                          edge so it scrolls horizontally with the page instead
                          of pinning to the viewport (which would lay over the
                          doc when the user scrolls right). */}
                        {showRulerEffective && !readOnlyProp && (
                          <div
                            style={{
                              position: 'absolute',
                              left: 0,
                              top: 0,
                              // Above the inline HF editor (Z_INDEX.hfInlineEditor)
                              // so it stays readable on horizontal scroll.
                              zIndex: Z_INDEX.ruler,
                              // Must match `.paged-editor__pages` padding-top in
                              // editor.css (24 viewport + 24 pages container);
                              // update both together or the ruler misaligns.
                              paddingTop: 48,
                            }}
                          >
                            <VerticalRuler
                              sectionProps={initialSectionProperties}
                              zoom={state.zoom}
                              unit={rulerUnit}
                              editable={!readOnly}
                              onTopMarginChange={handleTopMarginChange}
                              onBottomMarginChange={handleBottomMarginChange}
                            />
                          </div>
                        )}
                        {/* Brighten highlight for the focused/expanded sidebar item */}
                        {expandedSidebarItem && expandedSidebarItem.startsWith('comment-') && (
                          <style>{`.paged-editor__pages [data-comment-id="${expandedSidebarItem.replace('comment-', '')}"] { background-color: rgba(255, 212, 0, 0.35) !important; border-bottom: 2px solid rgba(255, 212, 0, 0.7) !important; }`}</style>
                        )}
                        {expandedSidebarItem?.startsWith('tc-') &&
                          (() => {
                            const revId = expandedSidebarItem.split('-')[1];
                            const tc = trackedChanges.find((c) => String(c.revisionId) === revId);
                            const insRevId = tc?.insertionRevisionId;
                            return (
                              <style>{`
                            .paged-editor__pages .docx-insertion[data-revision-id="${insRevId ?? revId}"] { background-color: rgba(52, 168, 83, 0.2) !important; border-bottom: 2px solid #2e7d32 !important; }
                            .paged-editor__pages .docx-deletion[data-revision-id="${revId}"] { background-color: rgba(211, 47, 47, 0.2) !important; text-decoration-thickness: 2px !important; }
                          `}</style>
                            );
                          })()}
                        <PagedEditor
                          ref={pagedEditorRef}
                          document={history.state}
                          styles={history.state?.package.styles}
                          theme={history.state?.package.theme || theme}
                          sectionProperties={initialSectionProperties}
                          finalSectionProperties={finalSectionProperties}
                          headerContent={headerContent}
                          footerContent={footerContent}
                          firstPageHeaderContent={firstPageHeaderContent}
                          firstPageFooterContent={firstPageFooterContent}
                          onHeaderFooterDoubleClick={handleHeaderFooterDoubleClick}
                          hfEditMode={hfEditPosition}
                          onBodyClick={handleBodyClick}
                          zoom={state.zoom}
                          wordCompat={wordCompat}
                          showFormattingMarks={showFormattingMarks}
                          readOnly={readOnly}
                          extensionManager={extensionManager}
                          selectionFormatting={state.selectionFormatting}
                          onFormat={handleFormat}
                          onZoomChange={handleZoomChange}
                          onDocumentChange={handleDocumentChange}
                          onSelectionChange={(_from, _to) => {
                            // Extract full selection state from PM and use the standard handler
                            const view = pagedEditorRef.current?.getView();
                            if (view) {
                              const selectionState = extractSelectionState(view.state);
                              handleSelectionChange(selectionState);

                              // Detect comment/tracked-change marks at cursor to open sidebar card.
                              // Collect marks from all sources — inclusive:false marks aren't
                              // reported by $from.marks() at boundaries, and empty arrays are
                              // truthy so an OR chain would short-circuit.
                              const $from = view.state.selection.$from;
                              const marks = [
                                ...(view.state.storedMarks ?? []),
                                ...($from.nodeAfter?.marks ?? []),
                                ...($from.nodeBefore?.marks ?? []),
                                ...$from.marks(),
                              ];
                              let cursorSidebarItem: string | null = null;
                              for (const mark of marks) {
                                if (mark.type.name === 'comment' && mark.attrs.commentId != null) {
                                  // Skip resolved comments — they stay collapsed as a checkmark
                                  // marker unless the user explicitly clicks it. Otherwise the
                                  // sidebar fills up with old threads every time the cursor
                                  // passes through commented text.
                                  const commentId = mark.attrs.commentId as number;
                                  if (resolvedCommentIds.has(commentId)) continue;
                                  cursorSidebarItem = `comment-${commentId}`;
                                  break;
                                }
                                if (
                                  (mark.type.name === 'insertion' ||
                                    mark.type.name === 'deletion') &&
                                  mark.attrs.revisionId != null
                                ) {
                                  const revId = String(mark.attrs.revisionId);
                                  const prefix = `tc-${revId}-`;
                                  let match = commentSidebarItems.find((i) =>
                                    i.id.startsWith(prefix)
                                  );
                                  // Insertion side of a replacement has a different revisionId;
                                  // check alias map to find the correct sidebar card.
                                  if (!match && revisionIdAliases) {
                                    const aliasedId = revisionIdAliases.get(revId);
                                    if (aliasedId) {
                                      match = commentSidebarItems.find((i) => i.id === aliasedId);
                                    }
                                  }
                                  if (match) {
                                    cursorSidebarItem = match.id;
                                    break;
                                  }
                                }
                              }
                              if (cursorSidebarItem) {
                                setShowCommentsSidebar(true);
                              }
                              setExpandedSidebarItem(cursorSidebarItem);
                            } else {
                              handleSelectionChange(null);
                            }
                          }}
                          externalPlugins={allExternalPlugins}
                          onReady={(ref) => {
                            const view = ref.getView();
                            if (view) setPmState(view.state);
                            if (view) onEditorViewReady?.(view);
                          }}
                          onRenderedDomContextReady={onRenderedDomContextReady}
                          pluginOverlays={pluginOverlays}
                          onHyperlinkClick={handleHyperlinkClick}
                          onContextMenu={handleContextMenu}
                          commentsSidebarOpen={sidebarOpen}
                          onAnchorPositionsChange={setAnchorPositions}
                          onTotalPagesChange={(totalPages) => {
                            setScrollPageInfo((prev) =>
                              prev.totalPages === totalPages ? prev : { ...prev, totalPages }
                            );
                          }}
                          resolvedCommentIds={resolvedIdsForRender}
                          scrollContainerRef={scrollContainerRef}
                          sidebarOverlay={
                            <>
                              {editingMode === 'suggesting' && trackedChanges.length > 0 && (
                                <div
                                  style={{
                                    position: 'absolute',
                                    top: 6,
                                    right: 12,
                                    display: 'flex',
                                    gap: 4,
                                    padding: '4px 6px',
                                    background: 'var(--doc-surface, white)',
                                    border: '1px solid var(--doc-border)',
                                    borderRadius: 6,
                                    boxShadow: 'var(--doc-shadow, 0 2px 6px rgba(0,0,0,0.1))',
                                    zIndex: 50,
                                    fontSize: 12,
                                  }}
                                  data-testid="tracked-changes-action-bar"
                                >
                                  <Tooltip content={t('trackedChanges.previous')}>
                                    <button
                                      type="button"
                                      onClick={handlePreviousChange}
                                      style={trackedChangesActionBtnStyle}
                                      aria-label={t('trackedChanges.previous')}
                                    >
                                      <MaterialSymbol name="navigate_before" size={16} />
                                    </button>
                                  </Tooltip>
                                  <Tooltip content={t('trackedChanges.next')}>
                                    <button
                                      type="button"
                                      onClick={handleNextChange}
                                      style={trackedChangesActionBtnStyle}
                                      aria-label={t('trackedChanges.next')}
                                    >
                                      <MaterialSymbol name="navigate_next" size={16} />
                                    </button>
                                  </Tooltip>
                                  <span
                                    style={{
                                      width: 1,
                                      background: 'var(--doc-border)',
                                      margin: '0 2px',
                                    }}
                                  />
                                  <Tooltip content={t('trackedChanges.acceptAll')}>
                                    <button
                                      type="button"
                                      onClick={handleAcceptAllChanges}
                                      style={trackedChangesActionBtnStyle}
                                      aria-label={t('trackedChanges.acceptAll')}
                                      data-testid="tracked-changes-accept-all"
                                    >
                                      <MaterialSymbol name="done_all" size={16} />
                                    </button>
                                  </Tooltip>
                                  <Tooltip content={t('trackedChanges.rejectAll')}>
                                    <button
                                      type="button"
                                      onClick={handleRejectAllChanges}
                                      style={trackedChangesActionBtnStyle}
                                      aria-label={t('trackedChanges.rejectAll')}
                                      data-testid="tracked-changes-reject-all"
                                    >
                                      <MaterialSymbol name="block" size={16} />
                                    </button>
                                  </Tooltip>
                                </div>
                              )}
                              {allSidebarItems.length > 0 && (
                                <UnifiedSidebar
                                  items={allSidebarItems}
                                  anchorPositions={anchorPositions}
                                  renderedDomContext={pluginRenderedDomContext ?? null}
                                  pageWidth={pageWidthPx}
                                  zoom={state.zoom}
                                  editorContainerRef={scrollContainerRef}
                                  onExpandedItemChange={setExpandedSidebarItem}
                                  activeItemId={expandedSidebarItem}
                                />
                              )}
                              <CommentMarginMarkers
                                comments={comments}
                                anchorPositions={anchorPositions}
                                zoom={state.zoom}
                                pageWidth={pageWidthPx}
                                sidebarOpen={sidebarOpen}
                                resolvedCommentIds={resolvedCommentIds}
                                onMarkerClick={() => {
                                  setShowCommentsSidebar(true);
                                }}
                              />
                              {/* Version history is mounted as a flex sibling
                                  of the scroll container (below this block),
                                  not here — keeping it outside the scrolling
                                  area means it stays pinned to the viewport
                                  instead of riding along with document scroll. */}
                            </>
                          }
                        />

                        {/* Floating "add comment" button — appears on right edge of page at selection */}
                        {floatingCommentBtn != null && !isAddingComment && !readOnly && (
                          <Tooltip content="Add comment" side="bottom" delayMs={300}>
                            <button
                              type="button"
                              data-testid="floating-add-comment-button"
                              aria-label="Add comment"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const view = pagedEditorRef.current?.getView();
                                if (view) {
                                  const { from, to } = view.state.selection;
                                  if (from !== to) {
                                    setCommentSelectionRange({ from, to });
                                    const pendingMark = view.state.schema.marks.comment.create({
                                      commentId: PENDING_COMMENT_ID,
                                    });
                                    const tr = view.state.tr.addMark(from, to, pendingMark);
                                    tr.setSelection(TextSelection.create(tr.doc, to));
                                    view.dispatch(tr);
                                  }
                                }
                                setAddCommentYPosition(floatingCommentBtn.top);
                                setShowCommentsSidebar(true);
                                setIsAddingComment(true);
                                setFloatingCommentBtn(null);
                              }}
                              style={{
                                position: 'absolute',
                                top: floatingCommentBtn.top,
                                left: floatingCommentBtn.left,
                                transform: 'translate(-50%, -50%)',
                                zIndex: 50,
                                width: 28,
                                height: 28,
                                borderRadius: 6,
                                border: '1px solid rgba(26, 115, 232, 0.3)',
                                backgroundColor: 'var(--doc-surface, #fff)',
                                color: 'var(--doc-primary)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: '0 1px 3px rgba(60,64,67,0.2)',
                                transition: 'background-color 0.15s ease, box-shadow 0.15s ease',
                              }}
                              onMouseOver={(e) => {
                                (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                                  'rgba(26, 115, 232, 0.08)';
                                (e.currentTarget as HTMLButtonElement).style.boxShadow =
                                  '0 1px 4px rgba(26, 115, 232, 0.3)';
                              }}
                              onMouseOut={(e) => {
                                (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                                  'var(--doc-surface, #fff)';
                                (e.currentTarget as HTMLButtonElement).style.boxShadow =
                                  '0 1px 3px rgba(60,64,67,0.2)';
                              }}
                            >
                              <MaterialSymbol name="add_comment" size={16} />
                            </button>
                          </Tooltip>
                        )}

                        {/* Inline Header/Footer Editor — positioned over the target area */}
                        {hfEditPosition &&
                          (() => {
                            const activeHf = hfEditIsFirstPage
                              ? hfEditPosition === 'header'
                                ? firstPageHeaderContent
                                : firstPageFooterContent
                              : hfEditPosition === 'header'
                                ? headerContent
                                : footerContent;
                            if (!activeHf) return null;
                            const targetEl = getHfTargetElement(hfEditPosition);
                            const parentEl = editorContentRef.current;
                            if (!targetEl || !parentEl) return null;
                            return (
                              <InlineHeaderFooterEditor
                                ref={hfEditorRef}
                                headerFooter={activeHf}
                                position={hfEditPosition}
                                styles={history.state?.package.styles}
                                targetElement={targetEl}
                                parentElement={parentEl}
                                onSave={handleHeaderFooterSave}
                                onClose={() => setHfEditPosition(null)}
                                onSelectionChange={handleSelectionChange}
                                onRemove={handleRemoveHeaderFooter}
                                titlePg={
                                  history.state?.package.document?.finalSectionProperties?.titlePg
                                }
                                evenAndOddHeaders={
                                  history.state?.package.document?.finalSectionProperties
                                    ?.evenAndOddHeaders
                                }
                                onToggleTitlePg={handleToggleTitlePg}
                                onToggleEvenAndOdd={handleToggleEvenAndOddHeaders}
                              />
                            );
                          })()}
                      </div>
                    </div>
                    {/* end editor flex wrapper */}
                  </div>
                  {/* end scroll container */}

                  {/* Version history panel — flex sibling of the scroll
                      container so it stays pinned to the viewport
                      instead of riding along with document scroll. The
                      page area auto-shrinks because the scroll
                      container is `flex: 1` and this column has a
                      fixed width. */}
                  {showVersionHistory && (
                    <div
                      style={{
                        width: 300,
                        flexShrink: 0,
                        borderLeft: '1px solid var(--doc-border, #e0e0e0)',
                        background: 'var(--doc-surface, white)',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                      data-testid="version-history-panel-wrapper"
                    >
                      <VersionHistoryPanel history={editHistory} />
                    </div>
                  )}

                  {/* Right-edge PanelRail (X7) — always-visible activity bar
                    with toggles for Outline / Comments / Version history.
                    Lives inside the below-toolbar flex row so it spans only
                    the editor body's height, not the toolbar's. */}
                  {showPanelRail && (
                    <PanelRail
                      outlineVisible={showOutline}
                      commentsVisible={showCommentsSidebar}
                      historyVisible={showVersionHistory}
                      onToggleOutline={handleToggleOutline}
                      onToggleComments={handleToggleComments}
                      onToggleHistory={handleToggleVersionHistory}
                      writerVisible={showWritingAssistant}
                      onToggleWriter={() => setShowWritingAssistant((v) => !v)}
                      chatVisible={showChatPanel}
                      onToggleChat={() => setShowChatPanel((v) => !v)}
                    />
                  )}
                </div>
                {/* end below-toolbar flex row */}

                {showStatusBar && !readOnlyProp && (
                  <StatusBar
                    currentPage={scrollPageInfo.currentPage}
                    totalPages={scrollPageInfo.totalPages}
                    wordCount={wordCount}
                    charCount={charCount}
                    zoom={state.zoom}
                    onZoomChange={handleZoomChange}
                  />
                )}

                {/* Floating page indicator next to the scrollbar */}
                {scrollPageInfo.totalPages > 1 && (
                  <PageIndicator
                    currentPage={scrollPageInfo.currentPage}
                    totalPages={scrollPageInfo.totalPages}
                    visible={scrollPageInfo.visible}
                  />
                )}

                {/* Document outline sidebar — absolutely positioned, doesn't scroll */}
                {showOutline && (
                  <DocumentOutline
                    headings={outlineHeadings}
                    activeIndex={activeOutlineIndex}
                    onHeadingClick={handleHeadingInfoClick}
                    onClose={() => setShowOutline(false)}
                    topOffset={toolbarHeight}
                    scrollLeft={editorScrollLeft}
                  />
                )}

                {/* Unified sidebar (comments + plugin items) rendered inside PagedEditor via sidebarOverlay prop */}

                {/* Outline now lives in the right-edge PanelRail —
                    the floating button shipped before the rail existed
                    and is redundant. `showOutlineButton` is retained as
                    a prop for hosts that explicitly turn the entire
                    panel system off; the rail respects it via the
                    onToggleOutline plumbing in the host. */}
              </div>
              {/* end wrapper for scroll container + outline */}

              {/* Agent panel (right-side dock) — always mounted when the
                  prop is set so chat state survives close/reopen.
                  `closed={!agentPanelOpen}` triggers the slide / fade. */}
              {agentPanel && (
                <AgentPanel
                  title={agentPanel.title}
                  icon={agentPanel.icon}
                  defaultWidth={agentPanel.defaultWidth}
                  minWidth={agentPanel.minWidth}
                  maxWidth={agentPanel.maxWidth}
                  onClose={() => setAgentPanelOpen(false)}
                  closed={!agentPanelOpen}
                >
                  {agentPanel.render({ close: () => setAgentPanelOpen(false) })}
                </AgentPanel>
              )}
            </div>

            {/* Hyperlink popup (Google Docs-style) */}
            <HyperlinkPopup
              data={hyperlinkPopupData}
              onNavigate={handleHyperlinkPopupNavigate}
              onCopy={handleHyperlinkPopupCopy}
              onEdit={handleHyperlinkPopupEdit}
              onRemove={handleHyperlinkPopupRemove}
              onClose={handleHyperlinkPopupClose}
              readOnly={readOnly}
            />

            {/* Right-click context menu */}
            <TextContextMenu
              isOpen={contextMenu.isOpen}
              position={contextMenu.position}
              hasSelection={contextMenu.hasSelection}
              isEditable={!readOnly}
              items={contextMenuItems}
              onAction={handleContextMenuAction}
              onClose={handleContextMenuClose}
            />

            {/* Spell-check suggestions menu — shown only when the right-
                click landed on a misspelled-word decoration. */}
            {spellMenu && (
              <SpellSuggestionsMenu
                isOpen={true}
                position={{ x: spellMenu.x, y: spellMenu.y }}
                word={spellMenu.word}
                suggestions={spellMenu.suggestions}
                onPick={handlePickSpellSuggestion}
                onIgnore={handleIgnoreSpell}
                onClose={() => setSpellMenu(null)}
              />
            )}

            {/* AI rewrite / summarize suggestion popover — anchored to
                the original selection's bounding rect. Inline UX so
                the user sees the model's output next to the source
                before anything mutates the doc. */}
            {aiSuggestion && (
              <AISuggestionPanel
                mode={aiSuggestion.mode}
                original={aiSuggestion.original}
                suggestion={aiSuggestion.suggestion}
                inferenceMs={aiSuggestion.inferenceMs}
                busy={aiSuggestion.busy}
                error={aiSuggestion.error}
                tones={
                  aiSuggestion.mode === 'rewrite'
                    ? [
                        { id: 'polish', label: 'Polish', active: aiSuggestion.tone === 'polish' },
                        {
                          id: 'concise',
                          label: 'Concise',
                          active: aiSuggestion.tone === 'concise',
                        },
                        { id: 'formal', label: 'Formal', active: aiSuggestion.tone === 'formal' },
                        { id: 'casual', label: 'Casual', active: aiSuggestion.tone === 'casual' },
                        {
                          id: 'shorter',
                          label: 'Shorter',
                          active: aiSuggestion.tone === 'shorter',
                        },
                        { id: 'longer', label: 'Longer', active: aiSuggestion.tone === 'longer' },
                      ]
                    : undefined
                }
                onTone={handleAiTone}
                onAccept={handleAiAccept}
                onReject={handleAiReject}
                onRetry={handleAiRetry}
              />
            )}

            {/* Image-specific right-click menu — layout options + text actions */}
            <ImageContextMenu
              isOpen={imageContextMenu.isOpen}
              position={imageContextMenu.position}
              currentWrapType={imageContextMenu.currentWrapType}
              currentCssFloat={imageContextMenu.currentCssFloat}
              onApplyLayout={handleImageWrapApply}
              textActions={imageContextMenuTextActions}
              onTextAction={handleContextMenuAction}
              onClose={imageContextMenu.closeMenu}
            />

            {/* Toast notifications */}
            <Toaster position="bottom-right" />

            {/* Lazy-loaded dialogs — only fetched when first opened */}
            <Suspense fallback={null}>
              {findReplace.state.isOpen && (
                <FindReplaceDialog
                  isOpen={findReplace.state.isOpen}
                  onClose={findReplace.close}
                  onFind={handleFind}
                  onFindNext={handleFindNext}
                  onFindPrevious={handleFindPrevious}
                  onReplace={handleReplace}
                  onReplaceAll={handleReplaceAll}
                  initialSearchText={findReplace.state.searchText}
                  replaceMode={findReplace.state.replaceMode}
                  currentResult={findResultRef.current}
                />
              )}
              {hyperlinkDialog.state.isOpen && (
                <HyperlinkDialog
                  isOpen={hyperlinkDialog.state.isOpen}
                  onClose={hyperlinkDialog.close}
                  onSubmit={handleHyperlinkSubmit}
                  onRemove={hyperlinkDialog.state.isEditing ? handleHyperlinkRemove : undefined}
                  initialData={hyperlinkDialog.state.initialData}
                  selectedText={hyperlinkDialog.state.selectedText}
                  isEditing={hyperlinkDialog.state.isEditing}
                />
              )}
              {tablePropsOpen && (
                <TablePropertiesDialog
                  isOpen={tablePropsOpen}
                  onClose={() => setTablePropsOpen(false)}
                  onApply={(props) => {
                    const view = getActiveEditorView();
                    if (view) {
                      setTableProperties(props)(view.state, view.dispatch);
                    }
                  }}
                  currentProps={
                    state.pmTableContext?.table?.attrs as Record<string, unknown> | undefined
                  }
                />
              )}
              {bookmarksDialogOpen && (
                <BookmarksDialog
                  isOpen={bookmarksDialogOpen}
                  onClose={() => setBookmarksDialogOpen(false)}
                  bookmarks={(() => {
                    const list: Array<{ paraId: string; name: string }> = [];
                    const view = pagedEditorRef.current?.getView();
                    const doc = view?.state.doc;
                    if (!doc) return list;
                    doc.descendants((node) => {
                      if (node.type.name !== 'paragraph') return;
                      const paraId = node.attrs.paraId as string | undefined;
                      const bms = node.attrs.bookmarks as
                        | Array<{ id: number; name: string }>
                        | undefined;
                      if (!bms || !paraId) return;
                      for (const bm of bms) list.push({ paraId, name: bm.name });
                      return false;
                    });
                    return list;
                  })()}
                  onGoTo={(paraId) => {
                    pagedEditorRef.current?.scrollToParaId(paraId);
                  }}
                  onAdd={(name) => {
                    const view = getActiveEditorView();
                    if (!view) return;
                    const { $from } = view.state.selection;
                    let paraNode = $from.parent;
                    for (let d = $from.depth; d > 0 && paraNode.type.name !== 'paragraph'; d--) {
                      paraNode = $from.node(d - 1);
                    }
                    if (paraNode.type.name !== 'paragraph') return;
                    const existing =
                      (paraNode.attrs.bookmarks as Array<{ id: number; name: string }> | null) ??
                      [];
                    if (existing.some((b) => b.name === name)) return;
                    const nextId =
                      existing.reduce((m, b) => Math.max(m, b.id), 0) +
                      Math.floor(Math.random() * 1000) +
                      1;
                    setParagraphAttrs({
                      bookmarks: [...existing, { id: nextId, name }],
                    })(view.state, view.dispatch);
                    focusActiveEditor();
                  }}
                  onDelete={(entry) => {
                    const view = getActiveEditorView();
                    if (!view) return;
                    let targetPos: number | null = null;
                    let targetNode: ReturnType<typeof view.state.doc.nodeAt> | null = null;
                    view.state.doc.descendants((node, pos) => {
                      if (targetPos !== null) return false;
                      if (node.type.name !== 'paragraph') return;
                      if (node.attrs.paraId === entry.paraId) {
                        targetPos = pos;
                        targetNode = node;
                      }
                      return false;
                    });
                    if (targetPos === null || !targetNode) return;
                    const existing =
                      ((targetNode as { attrs: Record<string, unknown> }).attrs.bookmarks as Array<{
                        id: number;
                        name: string;
                      }> | null) ?? [];
                    const next = existing.filter((b) => b.name !== entry.name);
                    const tr = view.state.tr.setNodeMarkup(targetPos, undefined, {
                      ...(targetNode as { attrs: Record<string, unknown> }).attrs,
                      bookmarks: next.length > 0 ? next : null,
                    });
                    view.dispatch(tr);
                    focusActiveEditor();
                  }}
                />
              )}
              {characterSpacingDialogOpen && (
                <CharacterSpacingDialog
                  isOpen={characterSpacingDialogOpen}
                  onClose={() => setCharacterSpacingDialogOpen(false)}
                  initialValue={characterSpacingInitial}
                  onSubmit={handleSubmitCharacterSpacing}
                />
              )}
              {insertSymbolOpen && (
                <InsertSymbolDialog
                  isOpen={insertSymbolOpen}
                  onClose={() => setInsertSymbolOpen(false)}
                  onInsert={handleInsertSymbol}
                />
              )}
              {bordersShadingOpen && (
                <BordersAndShadingDialog
                  isOpen={bordersShadingOpen}
                  onClose={() => setBordersShadingOpen(false)}
                  initialValue={bordersShadingInitial}
                  onSubmit={handleSubmitBordersShading}
                />
              )}
              {paragraphDialogOpen && (
                <CustomSpacingDialog
                  isOpen={paragraphDialogOpen}
                  onClose={() => setParagraphDialogOpen(false)}
                  initialValue={{
                    lineSpacingRule: 'auto',
                    lineSpacing: state.selectionFormatting.lineSpacing ?? 240,
                    spaceBefore: state.selectionFormatting.spaceBefore ?? 0,
                    spaceAfter: state.selectionFormatting.spaceAfter ?? 0,
                    contextualSpacing: false,
                    keepNext: false,
                    keepLines: false,
                    widowControl: true,
                    pageBreakBefore: false,
                  }}
                  onChange={(v) => {
                    const view = getActiveEditorView();
                    if (!view) return;
                    setParagraphAttrs({
                      lineSpacing: v.lineSpacing || null,
                      lineSpacingRule: v.lineSpacingRule,
                      spaceBefore: v.spaceBefore || null,
                      spaceAfter: v.spaceAfter || null,
                      contextualSpacing: v.contextualSpacing,
                      keepNext: v.keepNext,
                      keepLines: v.keepLines,
                      widowControl: v.widowControl,
                      pageBreakBefore: v.pageBreakBefore,
                    })(view.state, view.dispatch);
                  }}
                />
              )}
              {splitCellDialogState.isOpen && (
                <SplitCellDialog
                  isOpen={splitCellDialogState.isOpen}
                  onClose={handleSplitCellDialogClose}
                  onApply={handleSplitCellDialogApply}
                  initialRows={splitCellDialogState.initialRows}
                  initialCols={splitCellDialogState.initialCols}
                  minRows={splitCellDialogState.minRows}
                  minCols={splitCellDialogState.minCols}
                />
              )}
              {imagePositionOpen && (
                <ImagePositionDialog
                  isOpen={imagePositionOpen}
                  onClose={() => setImagePositionOpen(false)}
                  onApply={handleApplyImagePosition}
                />
              )}
              {imagePropsOpen && (
                <ImagePropertiesDialog
                  isOpen={imagePropsOpen}
                  onClose={() => setImagePropsOpen(false)}
                  onApply={handleApplyImageProperties}
                  currentData={
                    state.pmImageContext
                      ? {
                          alt: state.pmImageContext.alt ?? undefined,
                          borderWidth: state.pmImageContext.borderWidth ?? undefined,
                          borderColor: state.pmImageContext.borderColor ?? undefined,
                          borderStyle: state.pmImageContext.borderStyle ?? undefined,
                        }
                      : undefined
                  }
                />
              )}
              {showPageSetup && (
                <PageSetupDialog
                  isOpen={showPageSetup}
                  onClose={() => setShowPageSetup(false)}
                  onApply={handlePageSetupApply}
                  currentProps={history.state?.package.document?.finalSectionProperties}
                  currentPageColor={
                    history.state?.package.document?.background?.color?.rgb
                      ? `#${history.state.package.document.background.color.rgb}`
                      : undefined
                  }
                  onPageColorChange={handlePageColorChange}
                />
              )}
              {footnotePropsOpen && (
                <FootnotePropertiesDialog
                  isOpen={footnotePropsOpen}
                  onClose={() => setFootnotePropsOpen(false)}
                  onApply={handleApplyFootnoteProperties}
                  footnotePr={history.state?.package.document?.finalSectionProperties?.footnotePr}
                  endnotePr={history.state?.package.document?.finalSectionProperties?.endnotePr}
                />
              )}
              {showFileProperties && (
                <FilePropertiesDialog
                  isOpen={showFileProperties}
                  onClose={() => setShowFileProperties(false)}
                  current={history.state?.package?.properties}
                  onApply={(edits) => {
                    // Push edits onto the current package so the next save
                    // writes them through `applyCorePropertiesToXml`. The
                    // edits land on the live `Document` so the dialog can
                    // re-open against the new values without a save.
                    const pkg = history.state?.package;
                    if (!pkg) return;
                    const next = { ...(pkg.properties ?? {}), ...edits };
                    pkg.properties = next;
                  }}
                />
              )}
              {showWordCount && (
                <WordCountDialog
                  isOpen={showWordCount}
                  onClose={() => setShowWordCount(false)}
                  stats={{
                    words: wordCount ?? 0,
                    characters: charCountWithSpaces ?? 0,
                    charactersNoSpaces: charCount ?? 0,
                    paragraphs: paragraphCount ?? 0,
                    pages: scrollPageInfo.totalPages,
                  }}
                />
              )}
              <VoiceTypingIndicator
                isListening={voiceTyping.isListening}
                interimText={voiceTyping.interimText}
                error={voiceTyping.error}
                onStop={voiceTyping.stop}
              />
              {showAbout && <AboutDialog isOpen={showAbout} onClose={() => setShowAbout(false)} />}
              {showKeyboardShortcuts && (
                <KeyboardShortcutsDialog
                  isOpen={showKeyboardShortcuts}
                  onClose={() => setShowKeyboardShortcuts(false)}
                />
              )}
              {showPreferences && (
                <PreferencesDialog
                  isOpen={showPreferences}
                  onClose={() => setShowPreferences(false)}
                  preferences={preferences}
                  onChange={handlePreferenceChange}
                />
              )}
              {showWatermarkDialog && (
                <WatermarkDialog
                  isOpen={showWatermarkDialog}
                  onClose={() => setShowWatermarkDialog(false)}
                  current={history.state?.package.document.watermark}
                  onApply={handleWatermarkChange}
                />
              )}
              {showAccessibility && (
                <AccessibilityDialog
                  isOpen={showAccessibility}
                  onClose={() => setShowAccessibility(false)}
                  issues={accessibilityIssues}
                  onGoto={handleAccessibilityGoto}
                />
              )}
              {showBuildingBlocks && (
                <BuildingBlocksDialog
                  isOpen={showBuildingBlocks}
                  onClose={() => setShowBuildingBlocks(false)}
                  blocks={buildingBlocks}
                  pendingPreview={pendingBuildingBlock?.preview ?? null}
                  onSaveSelection={handleSaveBuildingBlock}
                  onInsert={handleInsertBuildingBlock}
                  onDelete={handleDeleteBuildingBlock}
                />
              )}
              {showDictionary && (
                <DictionaryDialog
                  isOpen={showDictionary}
                  onClose={() => setShowDictionary(false)}
                  initialWord={dictionaryWord}
                />
              )}
              {showTranslate && (
                <TranslateDialog
                  isOpen={showTranslate}
                  onClose={() => setShowTranslate(false)}
                  initialText={translateText}
                  onReplace={translateRange ? handleTranslateReplace : undefined}
                />
              )}
              {showTranslateDocument && (
                <TranslateDocumentDialog
                  isOpen={showTranslateDocument}
                  onClose={() => setShowTranslateDocument(false)}
                  documentName={documentName ?? 'Untitled'}
                  getView={() => getActiveEditorView() ?? null}
                  onSave={() => handleSave({ selective: false })}
                  renderPreview={(buffer) => (
                    <DocxEditorAsPreview
                      documentBuffer={buffer}
                      readOnly
                      showToolbar={false}
                      showStatusBar={false}
                      showZoomControl={false}
                      showRuler={false}
                      showOutlineButton={false}
                      showPanelRail={false}
                    />
                  )}
                />
              )}
              {showWritingAssistant && (
                <WritingAssistantSheet
                  isOpen={showWritingAssistant}
                  onClose={() => setShowWritingAssistant(false)}
                />
              )}
              {showChatPanel && (
                <ChatPanel
                  isOpen={showChatPanel}
                  onClose={() => setShowChatPanel(false)}
                  getDocText={() => {
                    const view = getActiveEditorView();
                    if (!view) return '';
                    return view.state.doc.textBetween(0, view.state.doc.content.size, '\n', '\n');
                  }}
                  onInsertAtCursor={(text) => {
                    const view = getActiveEditorView();
                    if (!view) return;
                    // Insert at the cursor (selection head). If a range
                    // is selected, the head sits at its right edge, so
                    // the suggestion lands cleanly after the selection
                    // rather than overwriting it.
                    const at = view.state.selection.head;
                    applyInsertAsSuggestion({ view, at, text });
                  }}
                />
              )}
              {showExplore && (
                <ExploreDialog
                  isOpen={showExplore}
                  onClose={() => setShowExplore(false)}
                  initialQuery={exploreQuery}
                  onCite={handleExploreCite}
                />
              )}
              {showCitations && (
                <CitationsDialog
                  isOpen={showCitations}
                  onClose={() => setShowCitations(false)}
                  citations={citations}
                  onAdd={handleAddCitation}
                  onDelete={handleDeleteCitation}
                  onInsert={handleInsertCitation}
                />
              )}
              {showCommandPalette && (
                <CommandPaletteDialog
                  isOpen={showCommandPalette}
                  onClose={() => setShowCommandPalette(false)}
                  items={[
                    ...(onNew
                      ? [
                          {
                            id: 'file.new',
                            label: 'New document',
                            path: 'File',
                            shortcut: '⌘N',
                            run: onNew,
                          },
                        ]
                      : []),
                    {
                      id: 'file.open',
                      label: 'Open…',
                      path: 'File',
                      shortcut: '⌘O',
                      run: handleOpenDocument,
                    },
                    {
                      id: 'file.save',
                      label: 'Save (download .docx)',
                      path: 'File',
                      shortcut: '⌘S',
                      run: handleDownloadDocument,
                    },
                    {
                      id: 'file.print',
                      label: 'Print',
                      path: 'File',
                      shortcut: '⌘P',
                      run: handleDirectPrint,
                    },
                    {
                      id: 'file.export.pdf',
                      label: 'Export as PDF',
                      path: 'File · Export',
                      run: handleExportPdf,
                    },
                    {
                      id: 'file.export.odt',
                      label: 'Export as ODT',
                      path: 'File · Export',
                      run: handleExportOdt,
                    },
                    {
                      id: 'file.export.md',
                      label: 'Export as Markdown',
                      path: 'File · Export',
                      run: handleExportMd,
                    },
                    {
                      id: 'file.export.txt',
                      label: 'Export as Plain Text',
                      path: 'File · Export',
                      run: handleExportTxt,
                    },
                    {
                      id: 'file.pageSetup',
                      label: 'Page Setup…',
                      path: 'File',
                      run: handleOpenPageSetup,
                    },
                    {
                      id: 'file.properties',
                      label: 'Properties…',
                      path: 'File',
                      run: handleOpenFileProperties,
                    },
                    {
                      id: 'file.makeCopy',
                      label: 'Make a copy',
                      path: 'File',
                      run: handleMakeCopy,
                    },
                    {
                      id: 'file.email',
                      label: 'Email as attachment…',
                      path: 'File',
                      run: handleEmailAsAttachment,
                    },

                    {
                      id: 'edit.find',
                      label: 'Find',
                      path: 'Edit',
                      shortcut: '⌘F',
                      run: () => findReplace.openFind(''),
                    },
                    {
                      id: 'edit.findReplace',
                      label: 'Find and Replace',
                      path: 'Edit',
                      shortcut: '⌘H',
                      run: () => findReplace.openReplace(''),
                    },
                    {
                      id: 'edit.hyperlink',
                      label: 'Insert link',
                      path: 'Edit',
                      shortcut: '⌘K',
                      run: () => handleFormat('insertLink'),
                    },
                    {
                      id: 'edit.selectAll',
                      label: 'Select All',
                      path: 'Edit',
                      shortcut: '⌘A',
                      run: () => handleFormat('selectAll'),
                    },

                    {
                      id: 'format.bold',
                      label: 'Bold',
                      path: 'Format',
                      shortcut: '⌘B',
                      run: () => handleFormat('bold'),
                    },
                    {
                      id: 'format.italic',
                      label: 'Italic',
                      path: 'Format',
                      shortcut: '⌘I',
                      run: () => handleFormat('italic'),
                    },
                    {
                      id: 'format.underline',
                      label: 'Underline',
                      path: 'Format',
                      shortcut: '⌘U',
                      run: () => handleFormat('underline'),
                    },
                    {
                      id: 'format.strike',
                      label: 'Strikethrough',
                      path: 'Format',
                      shortcut: '⌘⇧X',
                      run: () => handleFormat('strikethrough'),
                    },
                    {
                      id: 'format.super',
                      label: 'Superscript',
                      path: 'Format',
                      shortcut: '⌘.',
                      run: () => handleFormat('superscript'),
                    },
                    {
                      id: 'format.sub',
                      label: 'Subscript',
                      path: 'Format',
                      shortcut: '⌘,',
                      run: () => handleFormat('subscript'),
                    },
                    {
                      id: 'format.smallCaps',
                      label: 'Small Caps',
                      path: 'Format',
                      run: () => handleFormat('toggleSmallCaps'),
                    },
                    {
                      id: 'format.allCaps',
                      label: 'All Caps',
                      path: 'Format',
                      run: () => handleFormat('toggleAllCaps'),
                    },
                    {
                      id: 'format.clear',
                      label: 'Clear formatting',
                      path: 'Format',
                      shortcut: '⌘\\',
                      run: () => handleFormat('clearFormatting'),
                    },
                    {
                      id: 'format.ltr',
                      label: 'Left-to-right text',
                      path: 'Format',
                      run: () => handleFormat('setLtr'),
                    },
                    {
                      id: 'format.rtl',
                      label: 'Right-to-left text',
                      path: 'Format',
                      run: () => handleFormat('setRtl'),
                    },

                    {
                      id: 'view.zoomIn',
                      label: 'Zoom in',
                      path: 'View',
                      shortcut: '⌘=',
                      run: () => handleZoomChange(Math.min(state.zoom * 1.1, 4)),
                    },
                    {
                      id: 'view.zoomOut',
                      label: 'Zoom out',
                      path: 'View',
                      shortcut: '⌘−',
                      run: () => handleZoomChange(Math.max(state.zoom / 1.1, 0.25)),
                    },
                    {
                      id: 'view.zoomReset',
                      label: 'Reset zoom to 100%',
                      path: 'View',
                      shortcut: '⌘0',
                      run: () => handleZoomChange(1),
                    },
                    {
                      id: 'view.themeAuto',
                      label: 'Theme: match system',
                      path: 'View',
                      run: () => handleSetColorTheme('auto'),
                    },
                    {
                      id: 'view.themeLight',
                      label: 'Theme: light',
                      path: 'View',
                      run: () => handleSetColorTheme('light'),
                    },
                    {
                      id: 'view.themeDark',
                      label: 'Theme: dark',
                      path: 'View',
                      run: () => handleSetColorTheme('dark'),
                    },

                    {
                      id: 'insert.pageBreak',
                      label: 'Insert page break',
                      path: 'Insert',
                      shortcut: '⌘↵',
                      run: () => handleInsertPageBreak(),
                    },
                    {
                      id: 'insert.toc',
                      label: 'Insert table of contents',
                      path: 'Insert',
                      run: () => handleInsertTOC(),
                    },
                    {
                      id: 'insert.image',
                      label: 'Insert image',
                      path: 'Insert',
                      run: handleInsertImageClick,
                    },
                    {
                      id: 'insert.watermark',
                      label: 'Watermark…',
                      path: 'Insert',
                      run: () => setShowWatermarkDialog(true),
                    },
                    {
                      id: 'insert.buildingBlocks',
                      label: 'Building blocks…',
                      path: 'Insert',
                      run: handleOpenBuildingBlocks,
                    },
                    {
                      id: 'insert.convertToTable',
                      label: 'Convert selection to table',
                      path: 'Insert',
                      run: handleConvertSelectionToTable,
                    },
                    {
                      id: 'insert.shape.rectangle',
                      label: 'Shape · Rectangle',
                      path: 'Insert',
                      run: () => handleInsertShape('rectangle'),
                    },
                    {
                      id: 'insert.shape.ellipse',
                      label: 'Shape · Ellipse',
                      path: 'Insert',
                      run: () => handleInsertShape('ellipse'),
                    },
                    {
                      id: 'insert.shape.line',
                      label: 'Shape · Line',
                      path: 'Insert',
                      run: () => handleInsertShape('line'),
                    },
                    {
                      id: 'insert.shape.arrow',
                      label: 'Shape · Arrow',
                      path: 'Insert',
                      run: () => handleInsertShape('arrow'),
                    },

                    {
                      id: 'tools.wordCount',
                      label: 'Word count',
                      path: 'Tools',
                      shortcut: '⌘⇧C',
                      run: handleOpenWordCount,
                    },
                    {
                      id: 'tools.dictionary',
                      label: 'Dictionary',
                      path: 'Tools',
                      shortcut: '⌘⇧Y',
                      run: handleOpenDictionary,
                    },
                    {
                      id: 'tools.translate',
                      label: 'Translate…',
                      path: 'Tools',
                      run: handleOpenTranslate,
                    },
                    {
                      id: 'tools.explore',
                      label: 'Explore…',
                      path: 'Tools',
                      run: handleOpenExplore,
                    },
                    {
                      id: 'tools.citations',
                      label: 'Citations…',
                      path: 'Tools',
                      run: handleOpenCitations,
                    },
                    {
                      id: 'tools.preferences',
                      label: 'Preferences…',
                      path: 'Tools',
                      run: () => setShowPreferences(true),
                    },
                    {
                      id: 'tools.accessibility',
                      label: 'Accessibility…',
                      path: 'Tools',
                      run: handleOpenAccessibility,
                    },

                    {
                      id: 'view.showFormattingMarks',
                      label: showFormattingMarks
                        ? 'Hide non-printing characters'
                        : 'Show non-printing characters',
                      path: 'View',
                      run: handleToggleShowFormattingMarks,
                    },
                    {
                      id: 'view.showOutline',
                      label: showOutline ? 'Hide document outline' : 'Show document outline',
                      path: 'View',
                      shortcut: '⌘⇧H',
                      run: handleToggleOutline,
                    },
                    {
                      id: 'view.showComments',
                      label: showCommentsSidebar ? 'Hide comments' : 'Show comments',
                      path: 'View',
                      run: handleToggleComments,
                    },
                    {
                      id: 'view.showVersionHistory',
                      label: showVersionHistory ? 'Hide version history' : 'Show version history',
                      path: 'View',
                      run: handleToggleVersionHistory,
                    },

                    {
                      id: 'help.report',
                      label: 'Report a bug',
                      path: 'Help',
                      run: handleReportBug,
                    },
                    {
                      id: 'help.about',
                      label: 'About Casual Editor',
                      path: 'Help',
                      run: handleShowAbout,
                    },
                  ]}
                />
              )}
            </Suspense>
            {/* InlineHeaderFooterEditor is rendered inside the editor content area (position:relative div) */}
            {/* Hidden file input for image insertion */}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleImageFileChange}
            />
            {/* Hidden file input for File → Open */}
            <input
              ref={docxInputRef}
              type="file"
              accept=".docx,.odt,.md,.markdown,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              style={{ display: 'none' }}
              onChange={handleDocxFileChange}
            />
          </div>
        </ErrorBoundary>
      </ErrorProvider>
    </LocaleProvider>
  );
});

// ============================================================================
// EXPORTS
// ============================================================================

export default DocxEditor;

// Type-only re-cast for the same DocxEditor component, suitable for
// JSX use in places (like the Translate-document preview pane) where
// forwardRef's stricter signature trips TypeScript. Renders the exact
// same component — no ref forwarding is needed at the call site.
const DocxEditorAsPreview = DocxEditor as unknown as React.FC<DocxEditorProps>;
