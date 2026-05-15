/**
 * HiddenProseMirror Component
 *
 * Off-screen ProseMirror instance that owns all keyboard input and state
 * while the paginated layout engine handles visual output. Responsibilities:
 *
 * - Keyboard input handling
 * - Selection state management
 * - Accessibility (semantic document structure for screen readers)
 * - ProseMirror transaction processing
 *
 * Visibility approach: The editor is moved off-viewport with position:fixed
 * and rendered transparent so it can still receive focus and remain part of
 * the accessibility tree. Content width is kept in sync with the document
 * so that ProseMirror's internal measurements stay valid.
 */

import { useRef, useEffect, useCallback, useImperativeHandle, forwardRef, memo } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  EditorState,
  Transaction,
  TextSelection,
  NodeSelection,
  type Command,
  type Plugin,
} from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';
import { EditorView, type DirectEditorProps } from 'prosemirror-view';
import { undo, redo } from 'prosemirror-history';
import { schema } from '@eigenpal/docx-core/prosemirror';
import { toProseDoc, createEmptyDoc } from '@eigenpal/docx-core/prosemirror/conversion';
import { fromProseDoc } from '@eigenpal/docx-core/prosemirror/conversion';
import type { ExtensionManager } from '@eigenpal/docx-core/prosemirror/extensions';
import type { Document, Theme, StyleDefinitions } from '@eigenpal/docx-core/types/document';

// Import ProseMirror CSS
import 'prosemirror-view/style/prosemirror.css';
import '@eigenpal/docx-core/prosemirror/editor.css';

/**
 * `Transaction.updated` is an internal bitfield in `prosemirror-state` whose
 * `UPDATED_SCROLL` flag is not exported. Bit value is 4 in current PM
 * (state/src/transaction.ts). We strip it because the paginated layer owns
 * scroll — without this PM's `updateState` would force-scroll our hidden
 * off-screen view's ancestors.
 *
 * If a future PM release adds new flag bits before SCROLL, this constant
 * goes stale silently. The `assertScrollFlagShape()` runtime check below
 * is a one-shot canary: it dispatches a synthetic scrollIntoView() tr and
 * asserts the bit shape matches expectations. Failures get logged once.
 */
const PM_UPDATED_SCROLL = 4;
let pmScrollFlagAsserted = false;
function assertScrollFlagShape(emptyTr: Transaction): void {
  if (pmScrollFlagAsserted) return;
  pmScrollFlagAsserted = true;
  try {
    const probe = emptyTr.scrollIntoView() as unknown as { updated?: number };
    if (typeof probe.updated !== 'number' || (probe.updated & PM_UPDATED_SCROLL) === 0) {
      console.warn(
        '[HiddenProseMirror] prosemirror-state UPDATED_SCROLL bit shape changed; ' +
          'paginated scroll suppression may be stale. Update PM_UPDATED_SCROLL.'
      );
    }
  } catch {
    // Probe failed (e.g. PM mocked in tests) — skip silently.
  }
}

// ============================================================================
// TYPES
// ============================================================================

export interface HiddenProseMirrorProps {
  /** The document to edit */
  document: Document | null;
  /** Document styles for style resolution */
  styles?: StyleDefinitions | null;
  /** Theme for styling */
  theme?: Theme | null;
  /** Width in pixels (should match document content width) */
  widthPx?: number;
  /** Whether the editor is read-only */
  readOnly?: boolean;
  /** Callback when document changes via transaction */
  onTransaction?: (transaction: Transaction, newState: EditorState) => void;
  /** Callback when selection changes */
  onSelectionChange?: (state: EditorState) => void;
  /** External ProseMirror plugins */
  externalPlugins?: Plugin[];
  /** Extension manager for plugins/schema/commands (optional — falls back to default) */
  extensionManager?: ExtensionManager;
  /** Callback when EditorView is ready */
  onEditorViewReady?: (view: EditorView) => void;
  /** Callback when EditorView is destroyed */
  onEditorViewDestroy?: () => void;
  /** Intercept key events before ProseMirror processes them. Return true to prevent PM handling. */
  onKeyDown?: (view: EditorView, event: KeyboardEvent) => boolean;
}

export interface HiddenProseMirrorRef {
  /** Get the ProseMirror EditorState */
  getState(): EditorState | null;
  /** Get the ProseMirror EditorView */
  getView(): EditorView | null;
  /** Get the current Document from PM state */
  getDocument(): Document | null;
  /** Focus the hidden editor */
  focus(): void;
  /** Blur the hidden editor */
  blur(): void;
  /** Check if focused */
  isFocused(): boolean;
  /** Dispatch a transaction */
  dispatch(tr: Transaction): void;
  /** Execute a ProseMirror command */
  executeCommand(command: Command): boolean;
  /** Undo */
  undo(): boolean;
  /** Redo */
  redo(): boolean;
  /** Check if undo is available */
  canUndo(): boolean;
  /** Check if redo is available */
  canRedo(): boolean;
  /** Set selection by PM position */
  setSelection(anchor: number, head?: number): void;
  /** Set node selection at a PM position (for images, etc.) */
  setNodeSelection(pos: number): void;
  /** Set cell selection between two positions inside table cells */
  setCellSelection(anchorCellPos: number, headCellPos: number): void;
  /** Scroll the PM view to selection (no-op since hidden) */
  scrollToSelection(): void;
}

// ============================================================================
// STYLES
// ============================================================================

/**
 * Hidden host styles - visually hidden but focusable
 */
const HIDDEN_HOST_STYLES: CSSProperties = {
  // Position off-screen but in document flow for accessibility
  position: 'fixed',
  left: '-9999px',
  top: '0',
  // Hide visually but keep focusable (NOT visibility:hidden!)
  opacity: 0,
  zIndex: -1,
  // Prevent interaction with visual layer
  pointerEvents: 'none',
  // Prevent text selection in hidden area
  userSelect: 'none',
  // Prevent scroll anchoring issues
  overflowAnchor: 'none',
  // Don't set aria-hidden - editor must remain accessible to screen readers
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create ProseMirror state from document
 *
 * When an ExtensionManager is provided, it supplies the schema and plugins.
 * Otherwise falls back to the default singleton schema with no extension plugins.
 */
function createInitialState(
  document: Document | null,
  styles: StyleDefinitions | null | undefined,
  manager?: ExtensionManager,
  externalPlugins: Plugin[] = []
): EditorState {
  const activeSchema = manager?.getSchema() ?? schema;
  const doc = document ? toProseDoc(document, { styles: styles ?? undefined }) : createEmptyDoc();

  // External plugins go first so they can intercept before extension keymaps
  // (e.g. suggestion mode must handle Backspace/Delete before deleteSelection)
  const plugins: Plugin[] = [...externalPlugins, ...(manager?.getPlugins() ?? [])];

  return EditorState.create({
    doc,
    schema: activeSchema,
    plugins,
  });
}

/**
 * Convert PM state to Document
 */
function stateToDocument(state: EditorState, originalDoc: Document | null): Document | null {
  if (!originalDoc) return null;

  // fromProseDoc preserves the base document structure when provided
  return fromProseDoc(state.doc, originalDoc);
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * HiddenProseMirror - Off-screen ProseMirror editor for keyboard input
 */
const HiddenProseMirrorComponent = forwardRef<HiddenProseMirrorRef, HiddenProseMirrorProps>(
  function HiddenProseMirror(props, ref) {
    const {
      document,
      styles,
      theme: _theme,
      widthPx = 612, // Default Letter width at 72dpi
      readOnly = false,
      onTransaction,
      onSelectionChange,
      externalPlugins = [],
      extensionManager,
      onEditorViewReady,
      onEditorViewDestroy,
      onKeyDown,
    } = props;

    // Refs
    const hostRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const documentRef = useRef<Document | null>(document);
    const isDestroyingRef = useRef(false);
    // Track the document identity to detect truly external changes
    // vs changes that originated from editing (which get passed back through props)
    const lastDocumentIdRef = useRef<string | null>(null);
    // Track if we've initialized - first render needs to set up state
    const isInitializedRef = useRef(false);

    // Store callbacks in refs to avoid dependency array issues that cause infinite loops
    // when the parent component passes unstable callback references
    const onTransactionRef = useRef(onTransaction);
    const onSelectionChangeRef = useRef(onSelectionChange);
    const onEditorViewReadyRef = useRef(onEditorViewReady);
    const onEditorViewDestroyRef = useRef(onEditorViewDestroy);
    const onKeyDownRef = useRef(onKeyDown);

    // Keep refs in sync
    onTransactionRef.current = onTransaction;
    onSelectionChangeRef.current = onSelectionChange;
    onEditorViewReadyRef.current = onEditorViewReady;
    onEditorViewDestroyRef.current = onEditorViewDestroy;
    onKeyDownRef.current = onKeyDown;

    // Keep document ref in sync
    documentRef.current = document;

    // Generate a stable document identity from metadata.
    // Used by both createView() and the document-change effect to track identity.
    const getDocumentId = (doc: Document | null): string => {
      if (!doc) return 'empty';
      const meta = doc.package?.properties;
      return `${meta?.created || ''}-${meta?.modified || ''}-${meta?.title || ''}`;
    };

    // ========================================================================
    // EditorView Lifecycle
    // ========================================================================

    /**
     * Create EditorView with proper dispatch handling
     * Uses refs for callbacks to avoid infinite re-render loops
     */
    const createView = useCallback(() => {
      if (!hostRef.current || isDestroyingRef.current) return;

      const initialState = createInitialState(document, styles, extensionManager, externalPlugins);

      const editorProps: DirectEditorProps = {
        state: initialState,
        editable: () => !readOnly,
        // Keeps `overflow-anchor` on the PM root across outer-deco sync (prosemirror#933).
        attributes: {
          style: 'overflow-anchor: none',
        },
        // Use a regular function (not arrow) so ProseMirror's `.call(this, tr)`
        // binding gives us the EditorView. This is critical: plugins like ySyncPlugin
        // dispatch transactions during EditorView construction (in their `view()`
        // callback), before the constructor returns and viewRef.current is set.
        dispatchTransaction(this: EditorView, transaction: Transaction) {
          if (isDestroyingRef.current) return;

          // Ensure viewRef is set — may be called during construction before
          // the `new EditorView()` assignment on the next line completes.
          if (!viewRef.current) viewRef.current = this;

          // Paginated layer owns scroll; strip PM scroll flag so updateState does not
          // use scroll-to-selection / preserve-path ancestor scroll correction on our scroller.
          // Probe a fresh tr (this.state.tr is a getter — doesn't mutate state) once
          // to verify the PM internal flag shape still matches PM_UPDATED_SCROLL.
          assertScrollFlagShape(this.state.tr);
          // `updated` is `private` on PM's Transaction, so a plain intersection
          // collapses to `never`. The double-cast is the documented escape hatch.
          const trWithUpdated = transaction as unknown as { updated?: number };
          if (typeof trWithUpdated.updated === 'number') {
            trWithUpdated.updated &= ~PM_UPDATED_SCROLL;
          }

          const newState = this.state.apply(transaction);
          this.updateState(newState);

          // Notify about transaction (use ref to avoid dependency issues)
          onTransactionRef.current?.(transaction, newState);

          // Notify about selection changes (use ref to avoid dependency issues)
          if (transaction.selectionSet || transaction.docChanged) {
            onSelectionChangeRef.current?.(newState);
          }
        },
        // Intercept key events before ProseMirror processes them
        handleKeyDown: (view: EditorView, event: KeyboardEvent): boolean => {
          return onKeyDownRef.current?.(view, event) ?? false;
        },
        // Paginated layer owns scroll; never let PM scroll the viewport / ancestors.
        handleScrollToSelection: () => true,
        // Prevent focus handling from interfering with visual layer
        handleDOMEvents: {
          focus: () => {
            // Let focus happen normally
            return false;
          },
          blur: () => {
            // Let blur happen normally
            return false;
          },
        },
      };

      viewRef.current = new EditorView(hostRef.current, editorProps);
      const pmRoot = viewRef.current.dom as HTMLElement;
      // overflow-anchor is also set via the `attributes.style` prop above to
      // survive PM's outer-deco sync (prosemirror#933). Setting it directly
      // on the element covers the brief window before that path applies.
      pmRoot.style.overflowAnchor = 'none';

      // Mark as initialized so the document-change effect skips the redundant
      // first-mount updateState (createView already set the initial state).
      isInitializedRef.current = true;
      lastDocumentIdRef.current = getDocumentId(document);

      // Notify that view is ready (use ref to avoid dependency issues)
      onEditorViewReadyRef.current?.(viewRef.current);
    }, [
      document,
      styles,
      externalPlugins,
      extensionManager,
      readOnly,
      // Callbacks removed from dependencies - accessed via refs
    ]);

    /**
     * Destroy EditorView
     */
    const destroyView = useCallback(() => {
      if (viewRef.current && !isDestroyingRef.current) {
        isDestroyingRef.current = true;

        // Use ref to avoid dependency issues
        onEditorViewDestroyRef.current?.();

        viewRef.current.destroy();
        viewRef.current = null;
        isDestroyingRef.current = false;
      }
    }, []);

    // Mount/unmount
    useEffect(() => {
      createView();
      return () => destroyView();
    }, []); // Only on mount/unmount

    // Update state when document changes externally (e.g., loading a new file)
    // This should NOT run when the document prop changes due to internal edits
    // being passed back through the parent component's state
    useEffect(() => {
      if (!viewRef.current || isDestroyingRef.current) return;

      const currentDocId = getDocumentId(document);

      // Skip if this is the same document (likely passed back after internal edit)
      // Only reset state if:
      // 1. Not yet initialized (first mount)
      // 2. Document identity changed (truly external change like loading a new file)
      if (isInitializedRef.current && currentDocId === lastDocumentIdRef.current) {
        return;
      }

      // Update tracking refs
      isInitializedRef.current = true;
      lastDocumentIdRef.current = currentDocId;

      // Create new state from document
      const newState = createInitialState(document, styles, extensionManager, externalPlugins);
      viewRef.current.updateState(newState);

      // Use ref to avoid infinite loop when callback is unstable
      onSelectionChangeRef.current?.(newState);
    }, [document, styles, extensionManager, externalPlugins]);
    // NOTE: onSelectionChange removed from dependencies - accessed via ref to prevent infinite loops

    // Update editable state
    useEffect(() => {
      if (!viewRef.current) return;
      // EditorView will call editable() on each check, so we don't need to update
    }, [readOnly]);

    // ========================================================================
    // Imperative Handle
    // ========================================================================

    useImperativeHandle(
      ref,
      () => ({
        getState() {
          return viewRef.current?.state ?? null;
        },

        getView() {
          return viewRef.current ?? null;
        },

        getDocument() {
          if (!viewRef.current) return null;
          return stateToDocument(viewRef.current.state, documentRef.current);
        },

        focus() {
          viewRef.current?.focus();
        },

        blur() {
          if (viewRef.current?.hasFocus()) {
            (viewRef.current.dom as HTMLElement).blur();
          }
        },

        isFocused() {
          return viewRef.current?.hasFocus() ?? false;
        },

        dispatch(tr: Transaction) {
          if (viewRef.current && !isDestroyingRef.current) {
            viewRef.current.dispatch(tr);
          }
        },

        executeCommand(command: Command) {
          if (!viewRef.current) return false;
          return command(viewRef.current.state, viewRef.current.dispatch, viewRef.current);
        },

        undo() {
          if (!viewRef.current) return false;
          return undo(viewRef.current.state, viewRef.current.dispatch);
        },

        redo() {
          if (!viewRef.current) return false;
          return redo(viewRef.current.state, viewRef.current.dispatch);
        },

        canUndo() {
          if (!viewRef.current) return false;
          return undo(viewRef.current.state);
        },

        canRedo() {
          if (!viewRef.current) return false;
          return redo(viewRef.current.state);
        },

        setSelection(anchor: number, head?: number) {
          if (!viewRef.current) return;
          const { state, dispatch } = viewRef.current;
          const $anchor = state.doc.resolve(anchor);
          const $head = head !== undefined ? state.doc.resolve(head) : $anchor;
          const selection = TextSelection.between($anchor, $head);
          dispatch(state.tr.setSelection(selection));
        },

        setNodeSelection(pos: number) {
          if (!viewRef.current) return;
          const { state, dispatch } = viewRef.current;
          try {
            const selection = NodeSelection.create(state.doc, pos);
            dispatch(state.tr.setSelection(selection));
          } catch {
            // Fallback to text selection if NodeSelection fails
            this.setSelection(pos);
          }
        },

        setCellSelection(anchorCellPos: number, headCellPos: number) {
          if (!viewRef.current) return;
          const { state, dispatch } = viewRef.current;
          try {
            const cellSel = CellSelection.create(state.doc, anchorCellPos, headCellPos);
            dispatch(state.tr.setSelection(cellSel));
          } catch {
            // Fallback to text selection if positions aren't valid for CellSelection
            this.setSelection(anchorCellPos, headCellPos);
          }
        },

        scrollToSelection() {
          // No-op for hidden editor - visual scrolling handled by PagedEditor
        },
      }),
      []
    );

    // ========================================================================
    // Render
    // ========================================================================

    const host = (
      <div
        ref={hostRef}
        className="paged-editor__hidden-pm"
        style={{
          ...HIDDEN_HOST_STYLES,
          width: widthPx > 0 ? `${widthPx}px` : undefined,
        }}
        // DO NOT set aria-hidden - this editor provides semantic structure
      />
    );

    // Mount off-DOM from the paginated scroll container. Otherwise ProseMirror's
    // preserve-mode selection updates (storeScrollPos / resetScrollStack) walk
    // ancestors and can clobber the document scroller — e.g. ArrowLeft after
    // scrollToParaId. See prosemirror-view updateStateInner (scroll === "preserve").
    const browserDoc = globalThis.document;
    const portalTarget =
      browserDoc && 'body' in browserDoc && browserDoc.body != null ? browserDoc.body : null;
    return portalTarget ? createPortal(host, portalTarget) : host;
  }
);

export const HiddenProseMirror = memo(HiddenProseMirrorComponent);

export default HiddenProseMirror;
