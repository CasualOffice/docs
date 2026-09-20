/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * InlineHeaderFooterEditor — inline overlay editor for header/footer content
 *
 * Renders a ProseMirror EditorView positioned over the header/footer area
 * on the page, Google Docs style. The main body is dimmed and the toolbar
 * routes formatting commands to this editor while it's active.
 *
 * Interaction model (Phase 2b / Phase 3):
 *  - Text in positioned boxes is editable directly.
 *  - Positioned boxes and floating images show grab handles on hover.
 *  - Drag the grip (top-left blue square) to move a box; PM posOffsetH/V attrs
 *    are updated on drop so the new position survives save.
 *  - 4-corner resize handles let the user change width/height; attrs are updated
 *    the same way.
 *  - Right-click in the editor shows a slim context menu.
 *  - Options dropdown now uses a capture-phase click-outside listener so it
 *    closes even when hf-inline-editor's stopPropagation is active.
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
import { EditorState, TextSelection, Selection, type Plugin } from 'prosemirror-state';
import { keymap } from 'prosemirror-keymap';
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
  /**
   * The Find & Replace highlight plugin, shared from DocxEditor so match
   * decorations paint inside this header/footer's editor when Find/Replace
   * runs against the open HF (the HF view is blurred while the find box has
   * focus, so native selection alone wouldn't show the current match).
   */
  findHighlightPlugin?: Plugin;
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

/** A positioned box (textbox or floating image) tracked for drag/resize handles. */
interface BoxRect {
  /** data-textbox-id for textboxes; '__img_0__' for the single-image case */
  id: string;
  kind: 'textbox' | 'image';
  /** Pixel position relative to editorContainerRef (the hf-editor-pm div) */
  left: number;
  top: number;
  width: number;
  height: number;
}

type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

interface ContextMenuState {
  x: number;
  y: number;
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
// DRAG-MOVE ICON
// ============================================================================

const MoveIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="white" aria-hidden="true">
    <path d="M13 6v5h5l-6-6-6 6h5v-5z" transform="translate(0,-2)" />
    <path d="M11 18v-5H6l6 6 6-6h-5v5z" transform="translate(0,2)" />
    <path d="M6 13h-5l6-6 6 6h-5z" transform="translate(-2,0) rotate(90,12,12)" />
    <path d="M18 11h5l-6 6-6-6h5z" transform="translate(2,0) rotate(90,12,12)" />
    <circle cx="12" cy="12" r="1.5" />
  </svg>
);

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
    findHighlightPlugin,
  },
  ref
) {
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const hfOuterRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Stylesheet that carries the faithful positions for the overlay's text
  // boxes (see syncBoxPositions). Kept in <head> — appending it inside the PM
  // contentDOM would make ProseMirror revert it.
  const posStyleRef = useRef<HTMLStyleElement | null>(null);
  // Second stylesheet for in-progress drag/resize visual feedback — appended
  // after posStyleRef so its !important rules win in cascade during interaction.
  const dragStyleRef = useRef<HTMLStyleElement | null>(null);
  useEffect(() => {
    const pos = document.createElement('style');
    pos.setAttribute('data-hf-pos', '');
    document.head.appendChild(pos);
    posStyleRef.current = pos;
    const drag = document.createElement('style');
    drag.setAttribute('data-hf-drag', '');
    document.head.appendChild(drag);
    dragStyleRef.current = drag;
    return () => {
      pos.remove();
      posStyleRef.current = null;
      drag.remove();
      dragStyleRef.current = null;
    };
  }, []);

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

  // --- Drag / resize / hover state -----------------------------------------
  /** Rects of all positioned boxes (textboxes + floating image) in the overlay */
  const [boxRects, setBoxRects] = useState<BoxRect[]>([]);
  /** Offset of hf-editor-pm inside hf-inline-editor (updated by syncBoxPositions) */
  const [pmEditorOffset, setPmEditorOffset] = useState({ top: 0, left: 0 });
  /** User-dragged positions — override painted rects so syncBoxPositions won't revert */
  const dragOverridesRef = useRef(new Map<string, { left: number; top: number }>());
  /** Which box ID is currently hovered (shows border + handles) */
  const [hoveredBoxId, setHoveredBoxId] = useState<string | null>(null);
  /** Handle DOM elements keyed by box ID — updated during drag via style.transform */
  const handleElsRef = useRef(new Map<string, HTMLDivElement>());

  // --- Context menu ---------------------------------------------------------
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Compute overlay position relative to the parent element
  const [overlayPos, setOverlayPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  // Stable ref so the scroll/resize listener can call syncBoxPositions without
  // being declared after it (syncBoxPositions is a useCallback declared below).
  const syncBoxPositionsRef = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    const computePosition = () => {
      const parentRect = parentElement.getBoundingClientRect();
      const targetRect = targetElement.getBoundingClientRect();
      setOverlayPos({
        top: targetRect.top - parentRect.top + parentElement.scrollTop,
        left: targetRect.left - parentRect.left + parentElement.scrollLeft,
        width: targetRect.width,
      });
      // Keep drag/resize handle overlay in sync with the new container position.
      requestAnimationFrame(() => syncBoxPositionsRef.current());
    };
    computePosition();

    // Recompute on scroll/resize
    const scrollParent = parentElement.closest('[style*="overflow"]') || parentElement;
    scrollParent.addEventListener('scroll', computePosition);
    window.addEventListener('resize', computePosition);

    // Recompute when the parent element resizes — covers flex reflow when a
    // right-dock panel opens or closes (no scroll/resize event fires for that).
    const ro = new ResizeObserver(computePosition);
    ro.observe(parentElement);

    return () => {
      scrollParent.removeEventListener('scroll', computePosition);
      window.removeEventListener('resize', computePosition);
      ro.disconnect();
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

  // Phase 2b (docs/internal/30): place positioned text boxes faithfully in the
  // edit overlay. Also populates boxRects for the drag/resize handle overlay.
  // dragOverridesRef entries override the painted rect so user moves persist
  // across PM transactions without reverting to the pre-edit painted position.
  const syncBoxPositions = useCallback(() => {
    const container = editorContainerRef.current;
    const styleEl = posStyleRef.current;
    if (!container || !styleEl) return;
    const containerRect = container.getBoundingClientRect();
    const targetRect = targetElement.getBoundingClientRect();
    const rel = (r: DOMRect) => ({
      left: Math.round(r.left - containerRect.left),
      top: Math.round(r.top - containerRect.top),
      width: Math.round(r.width),
      height: Math.round(r.height),
    });
    const rules: string[] = [];
    const newRects: BoxRect[] = [];

    // Text boxes — matched 1:1 by order. dragOverrides take precedence over the
    // hidden painted position so a user-moved box stays put after PM transactions.
    const viewBoxes = Array.from(targetElement.querySelectorAll<HTMLElement>('.layout-textbox'));
    const overlayBoxes = Array.from(container.querySelectorAll<HTMLElement>('.docx-textbox'));
    if (viewBoxes.length > 0 && viewBoxes.length === overlayBoxes.length) {
      viewBoxes.forEach((vb, i) => {
        const id = overlayBoxes[i].dataset.textboxId;
        if (!id) return;
        const painted = rel(vb.getBoundingClientRect());
        const override = dragOverridesRef.current.get(id);
        const p = override
          ? { left: override.left, top: override.top, width: painted.width, height: painted.height }
          : painted;
        rules.push(
          `.hf-editor-pm .docx-textbox[data-textbox-id="${CSS.escape(id)}"]` +
            `{position:absolute!important;left:${p.left}px!important;top:${p.top}px!important;` +
            `width:${p.width}px!important;margin:0!important;}`
        );
        newRects.push({
          id,
          kind: 'textbox',
          left: p.left,
          top: p.top,
          width: p.width,
          height: p.height,
        });
      });
    }

    // Floating image (header logo) — single-image case.
    const viewImgs = Array.from(targetElement.querySelectorAll<HTMLImageElement>('img')).filter(
      (i) => i.getBoundingClientRect().width > 0
    );
    const ovImgs = Array.from(container.querySelectorAll<HTMLImageElement>('img.docx-image'));
    if (viewImgs.length === 1 && ovImgs.length === 1) {
      const painted = rel(viewImgs[0].getBoundingClientRect());
      const override = dragOverridesRef.current.get('__img_0__');
      const p = override
        ? { left: override.left, top: override.top, width: painted.width, height: painted.height }
        : painted;
      rules.push(
        `.hf-editor-pm img.docx-image{position:absolute!important;` +
          `left:${p.left}px!important;top:${p.top}px!important;margin:0!important;}`
      );
      newRects.push({
        id: '__img_0__',
        kind: 'image',
        left: p.left,
        top: p.top,
        width: p.width,
        height: p.height,
      });
    }

    // Positioned content is out of flow, so the editable in-flow text collapses;
    // keep the overlay as tall as the header so the boxes stay visible.
    if (rules.length > 0) {
      container.style.position = 'relative';
      container.style.minHeight = `${targetRect.height}px`;
    }
    styleEl.textContent = rules.join('\n');
    setBoxRects(newRects);
    // Track hf-editor-pm offset within hf-inline-editor for handle positioning
    setPmEditorOffset({ top: container.offsetTop, left: container.offsetLeft });
  }, [targetElement]);

  // Keep the ref up-to-date so the scroll/resize listener (declared above) can
  // always call the latest version of syncBoxPositions.
  useEffect(() => {
    syncBoxPositionsRef.current = syncBoxPositions;
  }, [syncBoxPositions]);

  // ── Drag to move ──────────────────────────────────────────────────────────
  const startDrag = useCallback(
    (e: React.MouseEvent, rect: BoxRect) => {
      e.preventDefault();
      e.stopPropagation();

      const startClientX = e.clientX;
      const startClientY = e.clientY;
      const handleEl = handleElsRef.current.get(rect.id);

      const onMove = (me: MouseEvent) => {
        const dx = me.clientX - startClientX;
        const dy = me.clientY - startClientY;
        // Move the handle overlay visually without React re-renders
        if (handleEl) handleEl.style.transform = `translate(${dx}px, ${dy}px)`;
        // Also move the actual box via the drag-override stylesheet
        const sl = dragStyleRef.current;
        if (!sl) return;
        const nl = rect.left + dx;
        const nt = rect.top + dy;
        if (rect.kind === 'textbox') {
          sl.textContent =
            `.hf-editor-pm .docx-textbox[data-textbox-id="${CSS.escape(rect.id)}"]` +
            `{position:absolute!important;left:${nl}px!important;top:${nt}px!important;` +
            `width:${rect.width}px!important;margin:0!important;}`;
        } else {
          sl.textContent =
            `.hf-editor-pm img.docx-image{position:absolute!important;` +
            `left:${nl}px!important;top:${nt}px!important;margin:0!important;}`;
        }
      };

      const onUp = (me: MouseEvent) => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (handleEl) handleEl.style.transform = '';
        if (dragStyleRef.current) dragStyleRef.current.textContent = '';

        const dx = me.clientX - startClientX;
        const dy = me.clientY - startClientY;
        if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return; // click, not drag

        const newLeft = rect.left + dx;
        const newTop = rect.top + dy;
        // Persist override so syncBoxPositions() keeps the new position
        dragOverridesRef.current.set(rect.id, { left: newLeft, top: newTop });

        // Dispatch PM transaction to persist the new position.
        const view = viewRef.current;
        if (view && rect.kind === 'textbox') {
          let foundPos = -1;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let foundNode: any = null;
          view.state.doc.descendants((node, pos) => {
            if (node.type.name === 'textBox' && node.attrs.textBoxId === rect.id && !foundNode) {
              foundPos = pos;
              foundNode = node;
              return false;
            }
          });
          if (foundNode && foundPos >= 0) {
            const tr = view.state.tr.setNodeMarkup(foundPos, null, {
              ...foundNode.attrs,
              posOffsetH: (foundNode.attrs.posOffsetH ?? 0) + dx,
              posOffsetV: (foundNode.attrs.posOffsetV ?? 0) + dy,
              displayMode: 'float',
            });
            view.dispatch(tr);
          }
        } else if (view && rect.kind === 'image') {
          // Image position is stored in EMU (914400 per inch at 96 DPI → 9525 per pixel).
          const PIXELS_TO_EMU = 9525;
          let foundPos = -1;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let foundNode: any = null;
          view.state.doc.descendants((node, pos) => {
            if (node.type.name === 'image' && !foundNode) {
              foundPos = pos;
              foundNode = node;
              return false;
            }
          });
          if (foundNode && foundPos >= 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const existingPos = (foundNode.attrs.position as any) ?? null;
            const newPosition = {
              horizontal: {
                relativeTo: existingPos?.horizontal?.relativeTo ?? 'column',
                posOffset:
                  (existingPos?.horizontal?.posOffset ?? 0) + Math.round(dx * PIXELS_TO_EMU),
              },
              vertical: {
                relativeTo: existingPos?.vertical?.relativeTo ?? 'paragraph',
                posOffset: (existingPos?.vertical?.posOffset ?? 0) + Math.round(dy * PIXELS_TO_EMU),
              },
            };
            const tr = view.state.tr.setNodeMarkup(foundPos, null, {
              ...foundNode.attrs,
              position: newPosition,
              displayMode: 'float',
            });
            view.dispatch(tr);
          }
        }
        syncBoxPositions();
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [syncBoxPositions]
  );

  // ── Resize ────────────────────────────────────────────────────────────────
  const startResize = useCallback(
    (e: React.MouseEvent, rect: BoxRect, corner: ResizeCorner) => {
      e.preventDefault();
      e.stopPropagation();

      const startClientX = e.clientX;
      const startClientY = e.clientY;
      const handleEl = handleElsRef.current.get(rect.id);

      const compute = (dx: number, dy: number) => {
        let nl = rect.left,
          nt = rect.top,
          nw = rect.width,
          nh = rect.height;
        if (corner.includes('e')) nw = Math.max(50, rect.width + dx);
        if (corner.includes('s')) nh = Math.max(20, rect.height + dy);
        if (corner.includes('w')) {
          nl = rect.left + dx;
          nw = Math.max(50, rect.width - dx);
        }
        if (corner.includes('n')) {
          nt = rect.top + dy;
          nh = Math.max(20, rect.height - dy);
        }
        return { nl, nt, nw, nh };
      };

      const onMove = (me: MouseEvent) => {
        const dx = me.clientX - startClientX;
        const dy = me.clientY - startClientY;
        const { nl, nt, nw, nh } = compute(dx, dy);
        const sl = dragStyleRef.current;
        if (sl && rect.kind === 'textbox') {
          sl.textContent =
            `.hf-editor-pm .docx-textbox[data-textbox-id="${CSS.escape(rect.id)}"]` +
            `{position:absolute!important;left:${nl}px!important;top:${nt}px!important;` +
            `width:${nw}px!important;height:${nh}px!important;margin:0!important;}`;
        } else if (sl && rect.kind === 'image') {
          sl.textContent =
            `.hf-editor-pm img.docx-image{position:absolute!important;` +
            `left:${nl}px!important;top:${nt}px!important;` +
            `width:${nw}px!important;height:${nh}px!important;margin:0!important;}`;
        }
        if (handleEl) {
          handleEl.style.width = `${nw}px`;
          handleEl.style.height = `${nh}px`;
          if (corner.includes('w')) handleEl.style.left = `${nl + (pmEditorOffset?.left ?? 0)}px`;
          if (corner.includes('n')) handleEl.style.top = `${nt + (pmEditorOffset?.top ?? 0)}px`;
        }
      };

      const onUp = (me: MouseEvent) => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (dragStyleRef.current) dragStyleRef.current.textContent = '';

        const dx = me.clientX - startClientX;
        const dy = me.clientY - startClientY;
        if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;

        const { nl, nt, nw, nh } = compute(dx, dy);
        dragOverridesRef.current.set(rect.id, { left: nl, top: nt });

        const view = viewRef.current;
        if (view && rect.kind === 'textbox') {
          let foundPos = -1;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let foundNode: any = null;
          view.state.doc.descendants((node, pos) => {
            if (node.type.name === 'textBox' && node.attrs.textBoxId === rect.id && !foundNode) {
              foundPos = pos;
              foundNode = node;
              return false;
            }
          });
          if (foundNode && foundPos >= 0) {
            const tr = view.state.tr.setNodeMarkup(foundPos, null, {
              ...foundNode.attrs,
              width: nw,
              height: nh,
              posOffsetH: (foundNode.attrs.posOffsetH ?? 0) + (nl - rect.left),
              posOffsetV: (foundNode.attrs.posOffsetV ?? 0) + (nt - rect.top),
              displayMode: 'float',
            });
            view.dispatch(tr);
          }
        } else if (view && rect.kind === 'image') {
          // Persist resized dimensions to the PM image node so they survive save.
          let foundPos = -1;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let foundNode: any = null;
          view.state.doc.descendants((node, pos) => {
            if (node.type.name === 'image' && !foundNode) {
              foundPos = pos;
              foundNode = node;
              return false;
            }
          });
          if (foundNode && foundPos >= 0) {
            const tr = view.state.tr.setNodeMarkup(foundPos, null, {
              ...foundNode.attrs,
              width: nw,
              height: nh,
            });
            view.dispatch(tr);
          }
        }
        syncBoxPositions();
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [syncBoxPositions, pmEditorOffset]
  );

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
    // Take the viewport-relative forward-navigation keys over from the browser.
    // Native `End` / `PageDown` in this clipped/positioned overlay computed a
    // caret target against the clipped viewport, desynced ProseMirror's
    // selection from the DOM, and then silently swallowed the following
    // keystrokes (Home / PageUp / arrows / Shift-variants were unaffected). Map
    // them to real PM commands that land a valid selection. There's no "page" in
    // a header, so PageUp/PageDown go to the start/end of the header content.
    // `keymap` is prepended so it wins over PM's built-in key capture.
    const navKeymap = keymap({
      End: (state, dispatch) => {
        const { $head, empty } = state.selection;
        if (!empty) return false; // let the browser extend/collapse a range
        const pos = $head.end();
        if (dispatch) {
          dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos)).scrollIntoView());
        }
        return true;
      },
      PageDown: (state, dispatch) => {
        if (!state.selection.empty) return false;
        if (dispatch) dispatch(state.tr.setSelection(Selection.atEnd(state.doc)).scrollIntoView());
        return true;
      },
      PageUp: (state, dispatch) => {
        if (!state.selection.empty) return false;
        if (dispatch)
          dispatch(state.tr.setSelection(Selection.atStart(state.doc)).scrollIntoView());
        return true;
      },
    });
    // Append the shared Find & Replace highlight plugin last so its match
    // decorations render in this HF view. Its state is keyed and per-EditorState,
    // so reusing the one DocxEditor instance across the main + HF views is safe.
    const plugins = [
      navKeymap,
      ...hfMgr.getPlugins(),
      ...(findHighlightPlugin ? [findHighlightPlugin] : []),
    ];

    const state = EditorState.create({
      doc: pmDoc,
      schema,
      plugins,
    });

    const view = new EditorView(editorContainerRef.current, {
      state,
      // The overlay owns its own layout; never let ProseMirror scroll the
      // viewport/ancestors to reveal the selection. Without this, `End` (which
      // requests a scroll-to-selection) desynced the selection in this
      // clipped/positioned overlay and silently swallowed the next keystrokes.
      // The body editor (HiddenProseMirror) suppresses this for the same reason.
      handleScrollToSelection: () => true,
      dispatchTransaction(tr) {
        const newState = view.state.apply(tr);
        view.updateState(newState);
        if (tr.docChanged) {
          setIsDirty(true);
          // The box set (count/order/ids) can change on edit — recompute the
          // position rules after the DOM settles.
          requestAnimationFrame(() => syncBoxPositions());
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
      syncBoxPositions();
      // Report initial selection state
      const selState = extractSelectionState(view.state);
      onSelectionChangeRef.current?.(selState);
    });

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!overlayPos]); // Only fire when container transitions from unavailable→available, not on every scroll/resize recompute

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
    // Use capture phase so e.stopPropagation() on hf-inline-editor doesn't
    // swallow the event before our outside-click check can see it.
    document.addEventListener('mousedown', handleClick, true);
    return () => document.removeEventListener('mousedown', handleClick, true);
  }, [showOptions]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    function handleClick(e: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    }
    document.addEventListener('mousedown', handleClick, true);
    return () => document.removeEventListener('mousedown', handleClick, true);
  }, [contextMenu]);

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

  const insertField = (fieldType: 'PAGE' | 'NUMPAGES') => {
    const view = viewRef.current;
    if (!view) return;
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
    setContextMenu(null);
  };

  return (
    <div
      ref={hfOuterRef}
      className="hf-inline-editor"
      style={containerStyle}
      onMouseDown={(e) => {
        // Prevent clicks from bubbling to pages container / body click handler
        e.stopPropagation();
      }}
      onMouseMove={(e) => {
        const outer = hfOuterRef.current;
        if (!outer || boxRects.length === 0) return;
        const r = outer.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        const hit = boxRects.find((b) => {
          const bx = b.left + pmEditorOffset.left;
          const by = b.top + pmEditorOffset.top;
          return x >= bx && x <= bx + b.width && y >= by && y <= by + b.height;
        });
        setHoveredBoxId(hit?.id ?? null);
      }}
      onMouseLeave={() => setHoveredBoxId(null)}
      onContextMenu={(e) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest('td, th')) {
          // Table cell right-click: bubble to DocxEditor's handleEditorContextMenu
          // so the "Insert row / Delete row / …" menu appears.
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      {/* Separator bar — shown above for footer */}
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

      {/* ── Drag / resize handle overlay ─────────────────────────────────── */}
      {boxRects.map((rect) => {
        const isHovered = hoveredBoxId === rect.id;
        return (
          <div
            key={rect.id}
            ref={(el) => {
              if (el) handleElsRef.current.set(rect.id, el);
              else handleElsRef.current.delete(rect.id);
            }}
            style={{
              position: 'absolute',
              left: rect.left + pmEditorOffset.left,
              top: rect.top + pmEditorOffset.top,
              width: rect.width,
              height: rect.height,
              zIndex: Z_INDEX.hfInlineEditor + 1,
              boxSizing: 'border-box',
              border: isHovered ? '2px solid #2563eb' : '2px solid transparent',
              pointerEvents: 'none',
              // Don't block click-through to the PM editor
              borderRadius: 1,
            }}
          >
            {/* Drag grip — top-left blue square, only when hovered */}
            {isHovered && (
              <div
                title={t('headerFooter.dragToMove')}
                onMouseDown={(e) => startDrag(e, rect)}
                style={{
                  position: 'absolute',
                  top: -2,
                  left: -2,
                  width: 20,
                  height: 20,
                  background: '#2563eb',
                  cursor: 'move',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'all',
                  borderRadius: '0 0 4px 0',
                  zIndex: 2,
                }}
              >
                <MoveIcon />
              </div>
            )}
            {/* 4-corner resize handles */}
            {isHovered &&
              (['nw', 'ne', 'sw', 'se'] as ResizeCorner[]).map((corner) => {
                const isNorth = corner[0] === 'n';
                const isWest = corner[1] === 'w';
                return (
                  <div
                    key={corner}
                    onMouseDown={(e) => startResize(e, rect, corner)}
                    style={{
                      position: 'absolute',
                      width: 8,
                      height: 8,
                      background: '#2563eb',
                      border: '1.5px solid #ffffff',
                      borderRadius: 1,
                      cursor: `${corner}-resize`,
                      pointerEvents: 'all',
                      zIndex: 2,
                      ...(isNorth ? { top: -4 } : { bottom: -4 }),
                      ...(isWest ? { left: -4 } : { right: -4 }),
                    }}
                  />
                );
              })}
          </div>
        );
      })}

      {/* ── Context menu ─────────────────────────────────────────────────── */}
      {contextMenu && (
        <ContextMenuPanel
          x={contextMenu.x}
          y={contextMenu.y}
          menuRef={contextMenuRef}
          onClose={() => setContextMenu(null)}
          onCopy={() => {
            document.execCommand('copy');
            setContextMenu(null);
          }}
          onPaste={() => {
            document.execCommand('paste');
            setContextMenu(null);
          }}
          onSelectAll={() => {
            const view = viewRef.current;
            if (!view) return;
            const tr = view.state.tr.setSelection(
              TextSelection.create(view.state.doc, 0, view.state.doc.content.size)
            );
            view.dispatch(tr);
            setContextMenu(null);
          }}
          onInsertPageNumber={() => insertField('PAGE')}
          onInsertTotalPages={() => insertField('NUMPAGES')}
        />
      )}

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
// CONTEXT MENU SUB-COMPONENT
// ============================================================================

interface ContextMenuPanelProps {
  x: number;
  y: number;
  menuRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onSelectAll: () => void;
  onInsertPageNumber: () => void;
  onInsertTotalPages: () => void;
}

function ContextMenuPanel({
  x,
  y,
  menuRef,
  onClose,
  onCopy,
  onPaste,
  onSelectAll,
  onInsertPageNumber,
  onInsertTotalPages,
}: ContextMenuPanelProps) {
  const { t } = useTranslation();
  const menuWidth = 190;
  const menuHeight = 190;
  const cx = x + menuWidth > window.innerWidth - 8 ? x - menuWidth : x;
  const cy = y + menuHeight > window.innerHeight - 8 ? y - menuHeight : y;

  const itemStyle: CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '6px 14px',
    border: 'none',
    background: 'transparent',
    textAlign: 'left',
    cursor: 'pointer',
    fontSize: 12,
    color: 'var(--doc-text-on-surface)',
    font: 'inherit',
  };
  const divStyle: CSSProperties = {
    height: 1,
    background: 'var(--doc-border, #e2e8f0)',
    margin: '3px 0',
  };

  return (
    <div
      ref={menuRef}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        left: cx,
        top: cy,
        background: 'var(--doc-surface, #fff)',
        border: '1px solid var(--doc-border, #e2e8f0)',
        borderRadius: 6,
        boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
        zIndex: Z_INDEX.contextMenu,
        minWidth: menuWidth,
        padding: '4px 0',
        userSelect: 'none',
      }}
    >
      <button
        type="button"
        style={itemStyle}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--doc-bg-hover,#f1f5f9)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        onClick={onCopy}
      >
        {t('contextMenu.copy')}
      </button>
      <button
        type="button"
        style={itemStyle}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--doc-bg-hover,#f1f5f9)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        onClick={onPaste}
      >
        {t('contextMenu.paste')}
      </button>
      <button
        type="button"
        style={itemStyle}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--doc-bg-hover,#f1f5f9)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        onClick={onSelectAll}
      >
        {t('contextMenu.selectAll')}
      </button>
      <div style={divStyle} />
      <button
        type="button"
        style={itemStyle}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--doc-bg-hover,#f1f5f9)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        onClick={onInsertPageNumber}
      >
        {t('headerFooter.insertPageNumber')}
      </button>
      <button
        type="button"
        style={itemStyle}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--doc-bg-hover,#f1f5f9)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        onClick={onInsertTotalPages}
      >
        {t('headerFooter.insertTotalPages')}
      </button>
      <div style={divStyle} />
      <button
        type="button"
        style={{ ...itemStyle, color: 'var(--doc-text-muted, #888)' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--doc-bg-hover,#f1f5f9)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        onClick={onClose}
      >
        {t('headerFooter.closeContextMenu')}
      </button>
    </div>
  );
}

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
