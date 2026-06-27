/**
 * InlineHeaderFooterEditor — inline overlay editor for header/footer content
 *
 * Renders a ProseMirror EditorView positioned over the header/footer area
 * on the page, Google Docs style. The main body is dimmed and the toolbar
 * routes formatting commands to this editor while it's active.
 */

import React, {
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useState,
  useImperativeHandle,
  useLayoutEffect,
  forwardRef,
} from 'react';
import type { CSSProperties } from 'react';
import { EditorState } from 'prosemirror-state';
import { useTranslation } from '../i18n';
import { EditorView } from 'prosemirror-view';
import { undo, redo } from 'prosemirror-history';

import { schema } from '@eigenpal/docx-core/prosemirror';
import { headerFooterToProseDoc } from '@eigenpal/docx-core/prosemirror/conversion';
import { proseDocToBlocks } from '@eigenpal/docx-core/prosemirror/conversion';
import { Z_INDEX } from '../styles/zIndex';
import { extractSelectionState, type SelectionState } from '@eigenpal/docx-core/prosemirror';
import { createStarterKit } from '@eigenpal/docx-core/prosemirror/extensions';
import { ExtensionManager } from '@eigenpal/docx-core/prosemirror/extensions';
import { createStyleResolver } from '@eigenpal/docx-core/prosemirror';
import type {
  HeaderFooter,
  Paragraph,
  Table,
  StyleDefinitions,
} from '@eigenpal/docx-core/types/document';

import 'prosemirror-view/style/prosemirror.css';

// ============================================================================
// TYPES
// ============================================================================

export interface InlineHeaderFooterEditorProps {
  /** The header or footer being edited */
  headerFooter: HeaderFooter;
  /** Whether editing header or footer */
  position: 'header' | 'footer';
  /** Document styles for style resolution */
  styles?: StyleDefinitions | null;
  /** The DOM element to overlay (the .layout-page-header / .layout-page-footer) */
  targetElement: HTMLElement;
  /** The positioning parent element (the div wrapping PagedEditor) */
  parentElement: HTMLElement;
  /** Callback when editing is complete — receives updated content blocks */
  onSave: (content: Array<Paragraph | Table>) => void;
  /** Callback when editing is cancelled */
  onClose: () => void;
  /** Callback when selection changes in the HF editor (for toolbar sync) */
  onSelectionChange?: (state: SelectionState | null) => void;
  /** Callback to remove the header/footer entirely */
  onRemove?: () => void;
  /** Current OOXML `w:titlePg` flag on the section (= "Different first page"). */
  titlePg?: boolean;
  /** Current OOXML `w:evenAndOddHeaders` flag on settings.xml (= "Different odd & even pages"). */
  evenAndOddHeaders?: boolean;
  /** Toggle `w:titlePg` on the active section. */
  onToggleTitlePg?: (value: boolean) => void;
  /** Toggle `w:evenAndOddHeaders` on settings.xml. */
  onToggleEvenAndOdd?: (value: boolean) => void;
}

export interface InlineHeaderFooterEditorRef {
  /** Get the ProseMirror EditorView */
  getView(): EditorView | null;
  /** Focus the editor */
  focus(): void;
  /** Undo */
  undo(): boolean;
  /** Redo */
  redo(): boolean;
}

// ============================================================================
// STYLES
// ============================================================================

const separatorBarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '2px 0',
  fontSize: 11,
  color: 'var(--doc-primary)',
  userSelect: 'none',
};

const labelStyle: CSSProperties = {
  fontWeight: 500,
  letterSpacing: 0.3,
};

const optionsButtonStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--doc-primary)',
  cursor: 'pointer',
  fontSize: 11,
  padding: '2px 6px',
  borderRadius: 3,
};

const dropdownStyle: CSSProperties = {
  position: 'absolute',
  right: 0,
  top: '100%',
  background: 'var(--doc-surface, white)',
  border: '1px solid var(--doc-border)',
  borderRadius: 4,
  boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
  zIndex: Z_INDEX.dropdown,
  minWidth: 160,
  padding: '4px 0',
};

const dropdownItemStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '6px 12px',
  border: 'none',
  background: 'none',
  textAlign: 'left',
  cursor: 'pointer',
  fontSize: 12,
  color: 'var(--doc-text-on-surface)',
};

// ============================================================================
// COMPONENT
// ============================================================================

export const InlineHeaderFooterEditor = forwardRef<
  InlineHeaderFooterEditorRef,
  InlineHeaderFooterEditorProps
>(function InlineHeaderFooterEditor(
  {
    headerFooter,
    position,
    styles,
    targetElement,
    parentElement,
    onSave,
    onClose,
    onSelectionChange,
    onRemove,
    titlePg,
    evenAndOddHeaders,
    onToggleTitlePg,
    onToggleEvenAndOdd,
  },
  ref
) {
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Keep the latest `onSelectionChange` in a ref so `dispatchTransaction`
  // (closed over once when the HF EditorView is created) always calls the
  // current callback. Without this, the parent's `handleSelectionChange`
  // becomes stale as soon as its identity changes (e.g. when theme or
  // hfEditPosition flips), so HF selection events stop landing on the
  // up-to-date toolbar/state.
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  // Resolve default font size from document styles so the PM editor's
  // line-height calculations use the correct base (not browser-default 16px)
  const defaultFontSizePt = useMemo(() => {
    if (!styles) return 11; // Word 2007+ default
    const resolver = createStyleResolver(styles);
    const resolved = resolver.resolveParagraphStyle(undefined);
    // fontSize in document model is in half-points
    return resolved.runFormatting?.fontSize ? (resolved.runFormatting.fontSize as number) / 2 : 11;
  }, [styles]);
  const [showOptions, setShowOptions] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);

  // Compute overlay position relative to the parent element
  const [overlayPos, setOverlayPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  useLayoutEffect(() => {
    const computePosition = () => {
      const parentRect = parentElement.getBoundingClientRect();
      const targetRect = targetElement.getBoundingClientRect();
      setOverlayPos({
        top: targetRect.top - parentRect.top + parentElement.scrollTop,
        left: targetRect.left - parentRect.left + parentElement.scrollLeft,
        width: targetRect.width,
      });
    };
    computePosition();

    // Recompute on scroll/resize
    const scrollParent = parentElement.closest('[style*="overflow"]') || parentElement;
    scrollParent.addEventListener('scroll', computePosition);
    window.addEventListener('resize', computePosition);
    return () => {
      scrollParent.removeEventListener('scroll', computePosition);
      window.removeEventListener('resize', computePosition);
    };
  }, [targetElement, parentElement]);

  // Mark ONLY the header/footer element this overlay covers so the CSS that
  // hides the original layout-painter content (`.hf-edit-target > *`) applies
  // to just this one — not every page's header/footer (which left other pages
  // blank during edit). Cleaned up when the edit session ends.
  useEffect(() => {
    targetElement.classList.add('hf-edit-target');
    return () => targetElement.classList.remove('hf-edit-target');
  }, [targetElement]);

  // Create ProseMirror editor when the container is available
  // (overlayPos starts null → first render returns null → container ref not set)
  useEffect(() => {
    if (!editorContainerRef.current || viewRef.current) return;

    // Convert header/footer content to PM document
    const pmDoc = headerFooterToProseDoc(headerFooter.content, {
      styles: styles || undefined,
    });

    // Create a fresh ExtensionManager to get independent plugin instances
    // (keyed plugins like history$ can't be shared across EditorViews)
    const hfMgr = new ExtensionManager(createStarterKit());
    hfMgr.buildSchema();
    hfMgr.initializeRuntime();
    const plugins = hfMgr.getPlugins();

    const state = EditorState.create({
      doc: pmDoc,
      schema,
      plugins,
    });

    const view = new EditorView(editorContainerRef.current, {
      state,
      dispatchTransaction(tr) {
        const newState = view.state.apply(tr);
        view.updateState(newState);
        if (tr.docChanged) {
          setIsDirty(true);
        }
        // Report selection changes for toolbar sync
        if (tr.selectionSet || tr.docChanged) {
          const selState = extractSelectionState(newState);
          onSelectionChangeRef.current?.(selState);
        }
      },
    });

    viewRef.current = view;

    // Auto-focus
    requestAnimationFrame(() => {
      view.focus();
      // Report initial selection state
      const selState = extractSelectionState(view.state);
      onSelectionChangeRef.current?.(selState);
    });

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayPos]); // Re-run when position is computed (container becomes available)

  // Save current content
  const handleSave = useCallback(() => {
    if (!viewRef.current) return;
    const blocks = proseDocToBlocks(viewRef.current.state.doc);
    onSave(blocks);
  }, [onSave]);

  // Save + close
  const handleSaveAndClose = useCallback(() => {
    if (isDirty) {
      handleSave();
    } else {
      onClose();
    }
  }, [isDirty, handleSave, onClose]);

  // Handle Escape key — save + close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleSaveAndClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [handleSaveAndClose]);

  // Close options dropdown when clicking outside
  useEffect(() => {
    if (!showOptions) return;
    function handleClick(e: MouseEvent) {
      if (optionsRef.current && !optionsRef.current.contains(e.target as Node)) {
        setShowOptions(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showOptions]);

  // Expose ref
  useImperativeHandle(ref, () => ({
    getView: () => viewRef.current,
    focus: () => viewRef.current?.focus(),
    undo: () => {
      const view = viewRef.current;
      if (!view) return false;
      return undo(view.state, view.dispatch);
    },
    redo: () => {
      const view = viewRef.current;
      if (!view) return false;
      return redo(view.state, view.dispatch);
    },
  }));

  const { t } = useTranslation();
  const label = position === 'header' ? t('headerFooter.header') : t('headerFooter.footer');

  if (!overlayPos) return null;

  const containerStyle: CSSProperties = {
    position: 'absolute',
    top: overlayPos.top,
    left: overlayPos.left,
    width: overlayPos.width,
    zIndex: Z_INDEX.hfInlineEditor,
  };

  return (
    <div
      className="hf-inline-editor"
      style={containerStyle}
      onMouseDown={(e) => {
        // Prevent clicks from bubbling to pages container / body click handler
        e.stopPropagation();
      }}
    >
      {/* Separator bar — shown below for header, above for footer */}
      {position === 'footer' && (
        <div className="hf-separator-bar" style={separatorBarStyle}>
          <span style={labelStyle}>{label}</span>
          <OptionsMenu
            label={label}
            showOptions={showOptions}
            setShowOptions={setShowOptions}
            optionsRef={optionsRef}
            onRemove={onRemove}
            onClose={handleSaveAndClose}
            viewRef={viewRef}
            titlePg={titlePg}
            evenAndOddHeaders={evenAndOddHeaders}
            onToggleTitlePg={onToggleTitlePg}
            onToggleEvenAndOdd={onToggleEvenAndOdd}
          />
        </div>
      )}

      {/* ProseMirror editor area. Opaque PAGE-colored background + text so the
          overlay matches the white paper the body renders on — NOT the app
          surface. `--doc-surface` swaps to a dark value under [data-theme=dark],
          which turned the whole header black with white (invisible-on-paper)
          text and made transparent logos show only their opaque pixels. The
          page is always #fff/#000 (see renderPage.ts), so pin those here. The
          opaque background also stops grayed body content behind the overlay
          (a tall SDS letterhead) from bleeding through and reading as broken. */}
      <div
        ref={editorContainerRef}
        className="hf-editor-pm prosemirror-editor"
        style={{
          minHeight: 40,
          outline: 'none',
          fontSize: `${defaultFontSizePt}pt`,
          background: '#ffffff',
          color: '#000000',
        }}
      />

      {/* Separator bar — shown below for header */}
      {position === 'header' && (
        <div className="hf-separator-bar" style={separatorBarStyle}>
          <span style={labelStyle}>{label}</span>
          <OptionsMenu
            label={label}
            showOptions={showOptions}
            setShowOptions={setShowOptions}
            optionsRef={optionsRef}
            onRemove={onRemove}
            onClose={handleSaveAndClose}
            viewRef={viewRef}
            titlePg={titlePg}
            evenAndOddHeaders={evenAndOddHeaders}
            onToggleTitlePg={onToggleTitlePg}
            onToggleEvenAndOdd={onToggleEvenAndOdd}
          />
        </div>
      )}
    </div>
  );
});

// ============================================================================
// OPTIONS MENU SUB-COMPONENT
// ============================================================================

function OptionsMenu({
  label,
  showOptions,
  setShowOptions,
  optionsRef,
  onRemove,
  onClose,
  viewRef,
  titlePg,
  evenAndOddHeaders,
  onToggleTitlePg,
  onToggleEvenAndOdd,
}: {
  label: string;
  showOptions: boolean;
  setShowOptions: (v: boolean | ((prev: boolean) => boolean)) => void;
  optionsRef: React.RefObject<HTMLDivElement | null>;
  onRemove?: () => void;
  onClose: () => void;
  viewRef: React.RefObject<EditorView | null>;
  titlePg?: boolean;
  evenAndOddHeaders?: boolean;
  onToggleTitlePg?: (value: boolean) => void;
  onToggleEvenAndOdd?: (value: boolean) => void;
}) {
  const { t } = useTranslation();
  const insertField = (fieldType: 'PAGE' | 'NUMPAGES') => {
    const view = viewRef.current;
    if (!view) return;
    // Get marks at the current cursor position so the field inherits surrounding styling
    const { $from, from } = view.state.selection;
    const marks = view.state.storedMarks || $from.marks();
    const node = schema.nodes.field.create({
      fieldType,
      instruction: ` ${fieldType} \\* MERGEFORMAT `,
      fieldKind: 'simple',
      dirty: true,
    });
    const tr = view.state.tr.insert(from, node.mark(marks));
    view.dispatch(tr);
    view.focus();
  };

  return (
    <div style={{ position: 'relative' }} ref={optionsRef}>
      <button
        type="button"
        style={optionsButtonStyle}
        onClick={(e) => {
          e.stopPropagation();
          setShowOptions((prev) => !prev);
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {t('headerFooter.options')} ▾
      </button>
      {showOptions && (
        <div style={dropdownStyle}>
          <button
            type="button"
            style={dropdownItemStyle}
            onClick={() => {
              setShowOptions(false);
              insertField('PAGE');
            }}
            onMouseOver={(e) => {
              (e.target as HTMLElement).style.backgroundColor = 'var(--doc-bg-hover, #f1f3f4)';
            }}
            onMouseOut={(e) => {
              (e.target as HTMLElement).style.backgroundColor = 'transparent';
            }}
          >
            {t('headerFooter.insertPageNumber')}
          </button>
          <button
            type="button"
            style={dropdownItemStyle}
            onClick={() => {
              setShowOptions(false);
              insertField('NUMPAGES');
            }}
            onMouseOver={(e) => {
              (e.target as HTMLElement).style.backgroundColor = 'var(--doc-bg-hover, #f1f3f4)';
            }}
            onMouseOut={(e) => {
              (e.target as HTMLElement).style.backgroundColor = 'transparent';
            }}
          >
            {t('headerFooter.insertTotalPages')}
          </button>
          <div style={{ borderTop: '1px solid #e8eaed', margin: '4px 0' }} />
          {/* Different first page (w:titlePg). Toggling on/off updates
              the active section's `titlePg` flag. The host renders
              a separate first-page header/footer when on. */}
          {onToggleTitlePg && (
            <button
              type="button"
              style={dropdownItemStyle}
              onClick={() => {
                setShowOptions(false);
                onToggleTitlePg(!titlePg);
              }}
              data-testid="hf-toggle-titlepg"
              onMouseOver={(e) => {
                (e.target as HTMLElement).style.backgroundColor = 'var(--doc-bg-hover, #f1f3f4)';
              }}
              onMouseOut={(e) => {
                (e.target as HTMLElement).style.backgroundColor = 'transparent';
              }}
            >
              {titlePg ? '✓ ' : ''}
              {t('headerFooter.differentFirstPage')}
            </button>
          )}
          {/* Different odd & even pages (w:evenAndOddHeaders in
              settings.xml). When on, even pages render their own
              header/footer separately from odd pages. */}
          {onToggleEvenAndOdd && (
            <button
              type="button"
              style={dropdownItemStyle}
              onClick={() => {
                setShowOptions(false);
                onToggleEvenAndOdd(!evenAndOddHeaders);
              }}
              data-testid="hf-toggle-evenodd"
              onMouseOver={(e) => {
                (e.target as HTMLElement).style.backgroundColor = 'var(--doc-bg-hover, #f1f3f4)';
              }}
              onMouseOut={(e) => {
                (e.target as HTMLElement).style.backgroundColor = 'transparent';
              }}
            >
              {evenAndOddHeaders ? '✓ ' : ''}
              {t('headerFooter.differentEvenOdd')}
            </button>
          )}
          {(onToggleTitlePg || onToggleEvenAndOdd) && (
            <div style={{ borderTop: '1px solid #e8eaed', margin: '4px 0' }} />
          )}
          {onRemove && (
            <button
              type="button"
              style={dropdownItemStyle}
              onClick={() => {
                setShowOptions(false);
                onRemove();
              }}
              onMouseOver={(e) => {
                (e.target as HTMLElement).style.backgroundColor = 'var(--doc-bg-hover, #f1f3f4)';
              }}
              onMouseOut={(e) => {
                (e.target as HTMLElement).style.backgroundColor = 'transparent';
              }}
            >
              {t('headerFooter.remove', { label: label.toLowerCase() })}
            </button>
          )}
          <button
            type="button"
            style={dropdownItemStyle}
            onClick={() => {
              setShowOptions(false);
              onClose();
            }}
            onMouseOver={(e) => {
              (e.target as HTMLElement).style.backgroundColor = 'var(--doc-bg-hover, #f1f3f4)';
            }}
            onMouseOut={(e) => {
              (e.target as HTMLElement).style.backgroundColor = 'transparent';
            }}
          >
            {t('headerFooter.closeEditing', { label: label.toLowerCase() })}
          </button>
        </div>
      )}
    </div>
  );
}
