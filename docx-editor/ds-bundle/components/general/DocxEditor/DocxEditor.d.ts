import * as React from 'react';

/**
 * DocxEditor — from @casualoffice/docs@1.1.7.
 */
export interface DocxEditorProps {
  /** Document data — ArrayBuffer, Uint8Array, Blob, or File */
  documentBuffer?: ArrayBuffer | Uint8Array<ArrayBufferLike> | Blob | File;
  /** Pre-parsed document (alternative to documentBuffer) */
  document?: Document;
  /** Callback when document is saved */
  onSave?: (buffer: ArrayBuffer) => void;
  /** Callback invoked when the user picks File → New. Host should replace the loaded document with a blank one. */
  onNew?: () => void;
  /** Author name used for comments and track changes */
  author?: string;
  /** Callback when document changes */
  onChange?: (document: Document) => void;
  /** Callback when selection changes */
  onSelectionChange?: (state: SelectionState | null) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** When set, the Version-history panel lists the host's server-persisted revision chain (`/history`) and restores by downlo */
  versionBackend?: ServerVersionBackend;
  /** Callback when fonts are loaded */
  onFontsLoaded?: () => void;
  /** External ProseMirror plugins (from PluginHost) */
  externalPlugins?: prosemirror_state.Plugin<any>[];
  /** When true, the editor treats the `document` prop as a schema seed only and does not load it into ProseMirror on mount. C */
  externalContent?: boolean;
  /** Collab transport for footnote-text edits. Footnotes aren't in the ProseMirror document, so they don't ride ySyncPlugin;  */
  footnoteSync?: { set: (id: number, text: string) => void; observe: (cb: (id: number, text: string) => void) => () => void; };
  /** Collab transport for endnote-text edits (mirror of `footnoteSync`). */
  endnoteSync?: { set: (id: number, text: string) => void; observe: (cb: (id: number, text: string) => void) => () => void; };
  /** Collab transport for core document properties (File → Properties). */
  propsSync?: { set: (edits: Record<string, string>) => void; observe: (cb: (props: Record<string, string>) => void) => () => void; };
  /** Starting offset for comment/tracked-change IDs. Default 0. Comments and tracked-change revisions share a single numeric  */
  commentIdBase?: number;
  /** Callback when editor view is ready (for PluginHost) */
  onEditorViewReady?: (view: prosemirror_view.EditorView) => void;
  /** Theme for styling */
  theme?: Theme;
  /** Built-in chrome preset — a shortcut for the individual `show*` flags so hosts pick a UI level the way the sister sheet S */
  chrome?: "none" | "minimal" | "full";
  /** Called once, after the editor mounts and finishes loading its initial document, with the imperative API (the same object */
  onReady?: (api: DocxEditorRef) => void;
  /** Whether to show toolbar (default: true, or per `chrome` preset) */
  showToolbar?: boolean;
  /** Whether to show the right-edge PanelRail (default: true). Set to `false` when embedding the editor as a read-only previe */
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
  rulerUnit?: "inch" | "cm";
  /** Initial zoom level (default: 1.0) */
  initialZoom?: number;
  /** Whether the editor is read-only. When true, hides toolbar and rulers */
  readOnly?: boolean;
  /** When true, the editor does not intercept Cmd/Ctrl+F or Cmd/Ctrl+H. This lets the browser or host app handle native find/ */
  disableFindReplaceShortcuts?: boolean;
  /** Custom toolbar actions */
  toolbarExtra?: React.ReactNode;
  /** Additional CSS class name */
  className?: string;
  /** Additional inline styles */
  style?: React$1.CSSProperties;
  /** Placeholder when no document */
  placeholder?: React.ReactNode;
  /** Loading indicator */
  loadingIndicator?: React.ReactNode;
  /** Whether to show the document outline sidebar (default: false) */
  showOutline?: boolean;
  /** Whether to show the floating outline toggle button (default: true) */
  showOutlineButton?: boolean;
  /** Custom list of fonts shown in the toolbar's font-family dropdown. Strings render in the "Other" group; pass `FontOption[ */
  fontFamilies?: readonly (string | FontOption)[];
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
  mode?: "editing" | "suggesting" | "viewing";
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
  /** Controlled comments array. When provided, the editor reads comment thread metadata (text, author, replies, resolved stat */
  comments?: Comment[];
  /** Fires whenever the comments array changes (controlled mode). */
  onCommentsChange?: (comments: Comment[]) => void;
  /** Callback when rendered DOM context is ready (for plugin overlays). Used by PluginHost to get access to the rendered page */
  onRenderedDomContextReady?: (context: RenderedDomContext) => void;
  /** Plugin overlays to render inside the editor viewport. Passed from PluginHost to render plugin-specific overlays. */
  pluginOverlays?: React.ReactNode;
  /** Sidebar items from plugins (passed from PluginHost). */
  pluginSidebarItems?: ReactSidebarItem[];
  /** Rendered DOM context from PluginHost (for sidebar position resolution). */
  pluginRenderedDomContext?: RenderedDomContext;
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
  i18n?: unknown;
  /** Mount a controllable agent panel on the right side of the editor. The panel is the chrome (header, close button, drag-re */
  agentPanel?: unknown;
  /** Opt-in Word-style rendering quirks (#395). Off by default. When set, the painter emulates Word's "firstRow-only borders  */
  wordCompat?: boolean;
}

export declare const DocxEditor: React.ComponentType<DocxEditorProps>;
