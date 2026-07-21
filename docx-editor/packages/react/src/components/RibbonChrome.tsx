/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * RibbonChrome — the opt-in "new UI" (a modern, Word-2026-style tabbed ribbon).
 *
 * PRESENTATION ONLY. It renders as a child of `<EditorToolbar>` (the context
 * provider) and drives every command through the SAME `useEditorToolbar()` +
 * `useDialogActions()` surface the classic chrome uses — no command logic lives
 * here, so classic and ribbon stay behaviourally identical. Toggle via the View
 * menu ("Ribbon UI (preview)") or the in-ribbon "Classic view" button.
 *
 * Scope (v1): a functional Home + Insert tab covering the core formatting and
 * insert commands. Anything not yet surfaced here remains reachable by toggling
 * back to Classic. Styled with the editor's own `--doc-*` tokens so it themes
 * (light/dark) with the rest of the chrome.
 */

import { useCallback, useMemo, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import type { JSX } from 'react';
import { useEditorToolbar } from './EditorToolbarContext';
import { useDialogActions } from './DialogActionsContext';
import { useRovingTabindex } from '../hooks/useRovingTabindex';
import { MenuDropdown, type MenuEntry } from './ui/MenuDropdown';
import { MenuBarProvider } from './ui/MenuBarContext';
import { ColorPicker } from './ui/ColorPicker';
import type { FormattingAction } from './Toolbar';
import type { ParagraphAlignment, ColorValue } from '@eigenpal/docx-core/types/document';

export interface RibbonChromeProps {
  documentName?: string;
  onDocumentNameChange?: (name: string) => void;
  documentNameEditable?: boolean;
  /** Host slot (presence / share) — reused verbatim from the classic title bar. */
  renderTitleBarRight?: () => ReactNode;
}

type Tab = 'home' | 'insert' | 'view';

const RIBBON_CSS = `
.dcx-rib{display:flex;flex-direction:column;font-family:var(--doc-font-ui,inherit);color:var(--doc-text);
  background:var(--doc-surface,#fff);border-bottom:1px solid var(--doc-border-light,#e5e8ec)}
.dcx-rib *{box-sizing:border-box}
.dcx-rib svg{display:block;width:17px;height:17px;stroke:currentColor;stroke-width:1.7;fill:none;stroke-linecap:round;stroke-linejoin:round}
/* command bar */
.dcx-rib-cmd{display:flex;align-items:center;gap:10px;height:46px;padding:0 12px;
  background:linear-gradient(180deg,var(--doc-primary-light,#eef4fd),var(--doc-surface,#fff) 85%);
  border-bottom:1px solid var(--doc-border-light,#e5e8ec)}
.dcx-rib-name{font-weight:650;font-size:14px;color:var(--doc-text);background:transparent;border:1px solid transparent;
  border-radius:7px;padding:4px 8px;max-width:240px;min-width:60px}
.dcx-rib-name:hover{background:var(--doc-bg-hover,rgba(0,0,0,.04))}
.dcx-rib-name:focus{outline:none;background:var(--doc-surface,#fff);border-color:var(--doc-primary,#1b66c9)}
.dcx-rib-grow{flex:1}
.dcx-rib-classic{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:var(--doc-primary,#1b66c9);
  background:var(--doc-primary-light,#eef4fd);border:1px solid var(--doc-border-light,#cbdef7);
  border-radius:99px;padding:6px 13px;cursor:pointer}
.dcx-rib-classic:hover{filter:brightness(.97)}
/* tabs */
.dcx-rib-tabs{display:flex;align-items:center;gap:2px;height:38px;padding:0 10px;
  background:linear-gradient(180deg,var(--doc-primary-light,#eef4fd),var(--doc-surface,#fff) 90%);
  border-bottom:1px solid var(--doc-border-light,#e5e8ec)}
.dcx-rib-tab{position:relative;height:38px;padding:0 14px;display:flex;align-items:center;font-size:13.5px;
  font-weight:550;color:var(--doc-text-muted,#57606a);background:none;border:0;cursor:pointer}
.dcx-rib-tab:hover{color:var(--doc-text)}
.dcx-rib-tab[aria-selected="true"]{color:var(--doc-primary,#1b66c9);font-weight:650}
.dcx-rib-tab[aria-selected="true"]::after{content:"";position:absolute;left:11px;right:11px;bottom:-1px;height:2.5px;
  background:var(--doc-primary,#1b66c9);border-radius:3px}
/* ribbon body */
.dcx-rib-body{display:flex;align-items:stretch;padding:8px 6px;background:var(--doc-bg-subtle,#fbfcfe);
  min-height:88px;overflow-x:auto}
.dcx-rib-grp{display:flex;flex-direction:column;justify-content:space-between;padding:0 10px;
  border-right:1px solid var(--doc-border-light,#eef1f5)}
.dcx-rib-grp:last-child{border-right:0}
.dcx-rib-row{display:flex;align-items:center;gap:1px}
.dcx-rib-lbl{text-align:center;font-size:10.5px;color:var(--doc-text-subtle,#8b949e);margin-top:6px}
.dcx-rib-btn{height:32px;min-width:32px;padding:0 7px;border:0;background:none;border-radius:7px;cursor:pointer;
  display:flex;align-items:center;justify-content:center;gap:5px;color:var(--doc-text-muted,#57606a);font-size:13px;font-family:inherit}
.dcx-rib-btn:hover:not(:disabled){background:var(--doc-bg-hover,rgba(0,0,0,.05))}
.dcx-rib-btn[aria-pressed="true"]{background:var(--doc-primary-light,#e9f1fd);color:var(--doc-primary,#1b66c9)}
.dcx-rib-btn:disabled{opacity:.4;cursor:default}
.dcx-rib-btn .b{font-weight:800;font-size:15px}.dcx-rib-btn .i{font-style:italic;font-size:15px}
.dcx-rib-btn .u{text-decoration:underline;font-size:15px;text-underline-offset:2px}
.dcx-rib-btn .s{text-decoration:line-through;font-size:15px}
.dcx-rib-sel{height:32px;border:1px solid var(--doc-border,#d5dae0);border-radius:7px;background:var(--doc-surface,#fff);
  color:var(--doc-text);font-size:13px;font-family:inherit;padding:0 6px;cursor:pointer;max-width:140px}
.dcx-rib-sel:focus{outline:2px solid var(--doc-primary,#1b66c9);outline-offset:-1px}
.dcx-rib-zoom{display:flex;align-items:center;gap:2px}
.dcx-rib-zoomval{font-size:12.5px;color:var(--doc-text-muted,#57606a);min-width:38px;text-align:center;font-variant-numeric:tabular-nums}
.dcx-rib-colors{display:inline-flex;align-items:center;gap:1px}
.dcx-rib-gallery{gap:6px}
.dcx-rib-chip{width:78px;height:56px;border:1px solid var(--doc-border,#d5dae0);border-radius:8px;
  background:var(--doc-surface,#fff);display:flex;flex-direction:column;align-items:flex-start;justify-content:space-between;
  padding:8px 9px 6px;cursor:pointer;overflow:hidden;font-family:inherit;flex:none}
.dcx-rib-chip:hover:not(:disabled){border-color:var(--doc-primary,#1b66c9);box-shadow:0 0 0 2px var(--doc-primary-light,#e9f1fd)}
.dcx-rib-chip:disabled{opacity:.5;cursor:default}
.dcx-chip-prev{max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;line-height:1.1}
.dcx-chip-lbl{font-size:9px;color:var(--doc-text-subtle,#8b949e)}
.dcx-rib-search{display:flex;align-items:center;gap:8px;height:32px;width:320px;max-width:34vw;padding:0 12px;
  border:1px solid var(--doc-border,#d5dae0);border-radius:8px;background:var(--doc-surface,#fff);
  color:var(--doc-text-subtle,#8b949e);font-size:12.5px;font-family:inherit;cursor:text}
.dcx-rib-search:hover{border-color:var(--doc-primary,#1b66c9)}
.dcx-rib-search svg{width:14px;height:14px;flex:none}
.dcx-rib-searchtxt{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;flex:1;text-align:left}
.dcx-rib-k{font-family:var(--doc-font-mono,ui-monospace,monospace);font-size:10px;border:1px solid var(--doc-border,#d5dae0);
  border-radius:5px;padding:1px 5px;color:var(--doc-text-subtle,#8b949e);flex:none}
`;

function Icon({ d }: { d: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24">
      {d.split('|').map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
}

// Shown when the document exposes no font table (e.g. a blank doc) so the font
// picker is always usable; a real font list overrides these.
const DEFAULT_FONTS = ['Arial', 'Calibri', 'Times New Roman', 'Georgia', 'Verdana', 'Courier New'];
// The style gallery's curated set (applied by name; the doc's own definition
// wins when present).
const GALLERY_STYLE_NAMES = ['Normal', 'Title', 'Heading 1', 'Heading 2', 'Heading 3'];

function chipPreview(name: string): { text: string; style: CSSProperties } {
  if (name === 'Title')
    return { text: 'Title', style: { fontSize: 13, fontWeight: 700, color: 'var(--doc-text)' } };
  if (name.toLowerCase().startsWith('heading'))
    return {
      text: 'Heading',
      style: { fontSize: 12, fontWeight: 700, color: 'var(--doc-primary, #1b66c9)' },
    };
  return {
    text: 'Normal text',
    style: { fontSize: 10, fontWeight: 400, color: 'var(--doc-text-muted, #57606a)' },
  };
}

export function RibbonChrome({
  documentName,
  onDocumentNameChange,
  documentNameEditable = true,
  renderTitleBarRight,
}: RibbonChromeProps): JSX.Element {
  const ctx = useEditorToolbar();
  const dialogs = useDialogActions();
  const [tab, setTab] = useState<Tab>('home');
  const barRef = useRef<HTMLDivElement>(null);
  useRovingTabindex(barRef, true);

  const {
    currentFormatting: fmt,
    onFormat,
    onRefocusEditor,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    disabled,
    documentStyles,
    fontFamilies,
    theme,
    onToggleUiMode,
    onInsertImage,
    onInsertTable,
    onInsertPageBreak,
    onInsertHorizontalRule,
    onInsertFootnote,
    onInsertTOC,
    // File ops + view controls — surfaced so ribbon mode is self-sufficient
    // (it hides the classic menu bar).
    onNew,
    onOpen,
    onSave,
    onMakeCopy,
    onPrint,
    onOpenVersionHistory,
    onExportPdf,
    onExportOdt,
    onExportMd,
    zoom,
    onZoomChange,
    onToggleShowRuler,
    rulerVisible,
    onToggleShowFormattingMarks,
    showFormattingMarks,
  } = ctx;

  // Every command re-focuses the hidden editor next frame (mirrors FormattingBar),
  // so a toolbar click never strands focus away from ProseMirror.
  const run = useCallback(
    (action: FormattingAction) => {
      if (disabled || !onFormat) return;
      onFormat(action);
      requestAnimationFrame(() => onRefocusEditor?.());
    },
    [disabled, onFormat, onRefocusEditor]
  );

  const fontNames = useMemo(
    () => (fontFamilies ?? []).map((f) => (typeof f === 'string' ? f : f.fontFamily)),
    [fontFamilies]
  );
  const fontList = fontNames.length > 0 ? fontNames : DEFAULT_FONTS;
  const galleryChips = useMemo(
    () =>
      GALLERY_STYLE_NAMES.map((name) => {
        const match = (documentStyles ?? []).find(
          (s) => (s.name ?? s.styleId)?.toLowerCase() === name.toLowerCase()
        );
        // applyStyle expects the styleId (e.g. "Heading1"), not the display name.
        return { name, apply: match?.styleId ?? name.replace(/\s+/g, '') };
      }),
    [documentStyles]
  );

  const btn = (
    key: string,
    label: string,
    content: ReactNode,
    onClick: () => void,
    opts?: { pressed?: boolean; disabled?: boolean }
  ): JSX.Element => (
    <button
      type="button"
      className="dcx-rib-btn"
      title={label}
      aria-label={label}
      data-testid={`ribbon-${key}`}
      aria-pressed={opts?.pressed ? true : undefined}
      disabled={opts?.disabled ?? disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {content}
    </button>
  );

  const align = (v: ParagraphAlignment) => run({ type: 'alignment', value: v });

  const setTextColor = useCallback(
    (color: ColorValue | string) => {
      onFormat?.({ type: 'textColor', value: color });
      requestAnimationFrame(() => onRefocusEditor?.());
    },
    [onFormat, onRefocusEditor]
  );
  const setHighlight = useCallback(
    (color: ColorValue | string) => {
      onFormat?.({ type: 'highlightColor', value: typeof color === 'string' ? color : '' });
      requestAnimationFrame(() => onRefocusEditor?.());
    },
    [onFormat, onRefocusEditor]
  );

  // File menu — reuses the shared MenuDropdown so ribbon mode keeps file ops
  // (the classic menu bar is hidden in ribbon mode). Icons omitted to avoid
  // Material-Symbol name coupling; presence-gated on the handlers.
  const fileItems = useMemo<MenuEntry[]>(() => {
    const items: MenuEntry[] = [];
    if (onNew) items.push({ label: 'New', shortcut: 'Ctrl+N', onClick: onNew });
    if (onOpen) items.push({ label: 'Open', shortcut: 'Ctrl+O', onClick: onOpen });
    if (onSave) items.push({ label: 'Save', shortcut: 'Ctrl+S', onClick: onSave });
    if (onMakeCopy) items.push({ label: 'Make a copy', onClick: onMakeCopy });
    if (onOpenVersionHistory)
      items.push({ label: 'Version history', onClick: onOpenVersionHistory });
    if (onPrint || onExportPdf || onExportOdt || onExportMd) items.push({ type: 'separator' });
    if (onPrint) items.push({ label: 'Print', shortcut: 'Ctrl+P', onClick: onPrint });
    if (onExportPdf) items.push({ label: 'Export as PDF', onClick: onExportPdf });
    if (onExportOdt) items.push({ label: 'Export as ODT', onClick: onExportOdt });
    if (onExportMd) items.push({ label: 'Export as Markdown', onClick: onExportMd });
    if (dialogs.openPageSetup || dialogs.openFileProperties) items.push({ type: 'separator' });
    if (dialogs.openPageSetup) items.push({ label: 'Page setup', onClick: dialogs.openPageSetup });
    if (dialogs.openFileProperties)
      items.push({ label: 'Properties', onClick: dialogs.openFileProperties });
    return items;
  }, [
    onNew,
    onOpen,
    onSave,
    onMakeCopy,
    onOpenVersionHistory,
    onPrint,
    onExportPdf,
    onExportOdt,
    onExportMd,
    dialogs,
  ]);

  const zoomPct = Math.round((zoom ?? 1) * 100);

  return (
    <div className="dcx-rib" data-testid="ribbon-chrome">
      <style>{RIBBON_CSS}</style>

      {/* command bar */}
      <div className="dcx-rib-cmd">
        {fileItems.length > 0 && (
          <MenuBarProvider>
            <MenuDropdown label="File" items={fileItems} disabled={disabled} />
          </MenuBarProvider>
        )}
        {documentName !== undefined &&
          (documentNameEditable && onDocumentNameChange ? (
            <input
              className="dcx-rib-name"
              value={documentName}
              aria-label="Document name"
              onChange={(e) => onDocumentNameChange(e.target.value)}
            />
          ) : (
            <span className="dcx-rib-name" style={{ cursor: 'default' }}>
              {documentName}
            </span>
          ))}
        <button
          className="dcx-rib-btn"
          title="Undo"
          aria-label="Undo"
          disabled={!canUndo}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onUndo?.()}
        >
          <Icon d="M9 14 4 9l5-5|M4 9h11a5 5 0 0 1 0 10h-3" />
        </button>
        <button
          className="dcx-rib-btn"
          title="Redo"
          aria-label="Redo"
          disabled={!canRedo}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onRedo?.()}
        >
          <Icon d="m15 14 5-5-5-5|M20 9H9a5 5 0 0 0 0 10h3" />
        </button>
        <span className="dcx-rib-grow" />
        {dialogs.openCommandPalette && (
          <button
            className="dcx-rib-search"
            data-testid="ribbon-search"
            title="Search or run a command"
            onClick={() => dialogs.openCommandPalette?.()}
          >
            <Icon d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z|M21 21l-4-4" />
            <span className="dcx-rib-searchtxt">Search or run a command</span>
            <span className="dcx-rib-k">⌘K</span>
          </button>
        )}
        <span className="dcx-rib-grow" />
        {renderTitleBarRight?.()}
        {onZoomChange && (
          <span className="dcx-rib-zoom">
            <button
              className="dcx-rib-btn"
              title="Zoom out"
              aria-label="Zoom out"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onZoomChange(Math.max((zoom ?? 1) / 1.1, 0.25))}
            >
              −
            </button>
            <span className="dcx-rib-zoomval" data-testid="ribbon-zoom">
              {zoomPct}%
            </span>
            <button
              className="dcx-rib-btn"
              title="Zoom in"
              aria-label="Zoom in"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onZoomChange(Math.min((zoom ?? 1) * 1.1, 4))}
            >
              +
            </button>
          </span>
        )}
        <button
          className="dcx-rib-classic"
          data-testid="ribbon-exit"
          onClick={() => onToggleUiMode?.()}
          title="Switch back to the classic toolbar"
        >
          <Icon d="M4 6h16|M4 12h16|M4 18h10" />
          Classic view
        </button>
      </div>

      {/* tabs */}
      <div className="dcx-rib-tabs" role="tablist">
        <button
          className="dcx-rib-tab"
          role="tab"
          aria-selected={tab === 'home'}
          data-testid="ribbon-tab-home"
          onClick={() => setTab('home')}
        >
          Home
        </button>
        <button
          className="dcx-rib-tab"
          role="tab"
          aria-selected={tab === 'insert'}
          data-testid="ribbon-tab-insert"
          onClick={() => setTab('insert')}
        >
          Insert
        </button>
        <button
          className="dcx-rib-tab"
          role="tab"
          aria-selected={tab === 'view'}
          data-testid="ribbon-tab-view"
          onClick={() => setTab('view')}
        >
          View
        </button>
      </div>

      {/* body */}
      <div className="dcx-rib-body" ref={barRef}>
        {tab === 'home' && (
          <>
            <div className="dcx-rib-grp">
              <div className="dcx-rib-row dcx-rib-gallery" data-testid="ribbon-style-gallery">
                {galleryChips.map((c) => {
                  const p = chipPreview(c.name);
                  return (
                    <button
                      key={c.name}
                      type="button"
                      className="dcx-rib-chip"
                      data-testid={`ribbon-style-${c.name.replace(/\s+/g, '-').toLowerCase()}`}
                      title={`Apply ${c.name}`}
                      disabled={disabled}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => run({ type: 'applyStyle', value: c.apply })}
                    >
                      <span className="dcx-chip-prev" style={p.style}>
                        {p.text}
                      </span>
                      <span className="dcx-chip-lbl">{c.name}</span>
                    </button>
                  );
                })}
              </div>
              <div className="dcx-rib-lbl">Styles</div>
            </div>

            <div className="dcx-rib-grp">
              <div className="dcx-rib-row" style={{ marginBottom: 4 }}>
                <select
                  className="dcx-rib-sel"
                  aria-label="Font"
                  data-testid="ribbon-font"
                  disabled={disabled}
                  value={fmt?.fontFamily ?? ''}
                  onChange={(e) => run({ type: 'fontFamily', value: e.target.value })}
                >
                  <option value="">Font</option>
                  {fontList.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
                <select
                  className="dcx-rib-sel"
                  style={{ maxWidth: 60 }}
                  aria-label="Font size"
                  data-testid="ribbon-size"
                  disabled={disabled}
                  value={fmt?.fontSize ?? ''}
                  onChange={(e) => run({ type: 'fontSize', value: Number(e.target.value) })}
                >
                  <option value="">Size</option>
                  {[8, 9, 10, 11, 12, 14, 16, 18, 24, 36, 48, 72].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="dcx-rib-row">
                {btn('bold', 'Bold', <span className="b">B</span>, () => run('bold'), {
                  pressed: fmt?.bold,
                })}
                {btn('italic', 'Italic', <span className="i">I</span>, () => run('italic'), {
                  pressed: fmt?.italic,
                })}
                {btn(
                  'underline',
                  'Underline',
                  <span className="u">U</span>,
                  () => run('underline'),
                  {
                    pressed: fmt?.underline,
                  }
                )}
                {btn(
                  'strike',
                  'Strikethrough',
                  <span className="s">S</span>,
                  () => run('strikethrough'),
                  { pressed: fmt?.strike }
                )}
                {onFormat && (
                  <span className="dcx-rib-colors" data-testid="ribbon-colors">
                    <ColorPicker
                      mode="text"
                      value={fmt?.color?.replace(/^#/, '')}
                      onChange={setTextColor}
                      theme={theme}
                      disabled={disabled}
                      title="Text color"
                    />
                    <ColorPicker
                      mode="highlight"
                      value={fmt?.highlight}
                      onChange={setHighlight}
                      theme={theme}
                      disabled={disabled}
                      title="Highlight color"
                    />
                  </span>
                )}
                {btn(
                  'clear',
                  'Clear formatting',
                  <Icon d="M6 4h12M9 4l-2 16M15 20l1-8|M4 20l16-16" />,
                  () => run('clearFormatting')
                )}
              </div>
              <div className="dcx-rib-lbl">Font</div>
            </div>

            <div className="dcx-rib-grp">
              <div className="dcx-rib-row" style={{ marginBottom: 4 }}>
                {btn(
                  'bullet',
                  'Bulleted list',
                  <Icon d="M8 6h12|M8 12h12|M8 18h12|M3.5 6h.01|M3.5 12h.01|M3.5 18h.01" />,
                  () => run('bulletList'),
                  { pressed: fmt?.listState?.type === 'bullet' }
                )}
                {btn(
                  'numbered',
                  'Numbered list',
                  <Icon d="M9 6h11|M9 12h11|M9 18h11|M4 5h1v4|M4 9h2" />,
                  () => run('numberedList'),
                  { pressed: fmt?.listState?.type === 'numbered' }
                )}
                {btn(
                  'outdent',
                  'Decrease indent',
                  <Icon d="M8 8h12|M8 16h12|M4 12h8m0 0-3-3m3 3-3 3" />,
                  () => run('outdent')
                )}
                {btn(
                  'indent',
                  'Increase indent',
                  <Icon d="M8 8h12|M8 16h12|M12 12h8m-8 0 3-3m-3 3 3 3" />,
                  () => run('indent')
                )}
              </div>
              <div className="dcx-rib-row">
                {btn(
                  'align-left',
                  'Align left',
                  <Icon d="M4 6h16|M4 12h11|M4 18h16" />,
                  () => align('left'),
                  {
                    pressed: fmt?.alignment === 'left',
                  }
                )}
                {btn(
                  'align-center',
                  'Center',
                  <Icon d="M4 6h16|M6 12h12|M4 18h16" />,
                  () => align('center'),
                  {
                    pressed: fmt?.alignment === 'center',
                  }
                )}
                {btn(
                  'align-right',
                  'Align right',
                  <Icon d="M4 6h16|M9 12h11|M4 18h16" />,
                  () => align('right'),
                  {
                    pressed: fmt?.alignment === 'right',
                  }
                )}
                {btn(
                  'align-justify',
                  'Justify',
                  <Icon d="M4 6h16|M4 12h16|M4 18h16" />,
                  () => align('both'),
                  {
                    pressed: fmt?.alignment === 'both',
                  }
                )}
              </div>
              <div className="dcx-rib-lbl">Paragraph</div>
            </div>
          </>
        )}

        {tab === 'insert' && (
          <>
            <div className="dcx-rib-grp">
              <div className="dcx-rib-row">
                {onInsertImage &&
                  btn(
                    'insert-image',
                    'Image',
                    <Icon d="M3 5h18v14H3z|m3 15 5-5 4 4 3-3 5 5" />,
                    () => onInsertImage()
                  )}
                {onInsertTable &&
                  btn(
                    'insert-table',
                    'Table',
                    <Icon d="M3 4h18v16H3z|M3 10h18|M3 15h18|M9 4v16|M15 4v16" />,
                    () => onInsertTable(2, 2)
                  )}
              </div>
              <div className="dcx-rib-lbl">Tables &amp; media</div>
            </div>
            <div className="dcx-rib-grp">
              <div className="dcx-rib-row">
                {btn(
                  'insert-link',
                  'Link',
                  <Icon d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1|M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" />,
                  () => run('insertLink')
                )}
                {onInsertPageBreak &&
                  btn(
                    'insert-pagebreak',
                    'Page break',
                    <Icon d="M4 4h16v6H4z|M4 14h16v6H4z|M2 12h20" />,
                    () => onInsertPageBreak()
                  )}
                {onInsertHorizontalRule &&
                  btn('insert-hr', 'Horizontal rule', <Icon d="M3 12h18" />, () =>
                    onInsertHorizontalRule()
                  )}
              </div>
              <div className="dcx-rib-lbl">Links &amp; breaks</div>
            </div>
            <div className="dcx-rib-grp">
              <div className="dcx-rib-row">
                {onInsertFootnote &&
                  btn(
                    'insert-footnote',
                    'Footnote',
                    <Icon d="M6 4h9l3 3v13H6z|M9 20l2-4h2l-2 4" />,
                    () => onInsertFootnote()
                  )}
                {onInsertTOC &&
                  btn(
                    'insert-toc',
                    'Table of contents',
                    <Icon d="M4 6h6|M4 12h6|M4 18h6|M14 6h6|M14 12h6|M14 18h6" />,
                    () => onInsertTOC()
                  )}
                {dialogs.openInsertSymbol &&
                  btn(
                    'insert-symbol',
                    'Symbol',
                    <Icon d="M8 20c4-4 4-9 0-13a4 4 0 1 1 8 0|M6 20h12" />,
                    () => dialogs.openInsertSymbol?.()
                  )}
              </div>
              <div className="dcx-rib-lbl">References</div>
            </div>
          </>
        )}

        {tab === 'view' && (
          <>
            {onZoomChange && (
              <div className="dcx-rib-grp">
                <div className="dcx-rib-row">
                  {btn('zoom-out', 'Zoom out', <Icon d="M5 12h14" />, () =>
                    onZoomChange(Math.max((zoom ?? 1) / 1.1, 0.25))
                  )}
                  {btn(
                    'zoom-reset',
                    'Reset zoom',
                    <span style={{ fontSize: 12 }}>{zoomPct}%</span>,
                    () => onZoomChange(1)
                  )}
                  {btn('zoom-in', 'Zoom in', <Icon d="M12 5v14|M5 12h14" />, () =>
                    onZoomChange(Math.min((zoom ?? 1) * 1.1, 4))
                  )}
                </div>
                <div className="dcx-rib-lbl">Zoom</div>
              </div>
            )}
            <div className="dcx-rib-grp">
              <div className="dcx-rib-row">
                {onToggleShowRuler &&
                  btn(
                    'toggle-ruler',
                    'Show ruler',
                    <Icon d="M3 8h18v8H3z|M7 8v3|M11 8v4|M15 8v3|M19 8v4" />,
                    () => onToggleShowRuler(),
                    { pressed: rulerVisible }
                  )}
                {onToggleShowFormattingMarks &&
                  btn(
                    'toggle-marks',
                    'Formatting marks',
                    <Icon d="M9 4h9|M13 4v16|M9 4a4 4 0 0 0 0 8h4" />,
                    () => onToggleShowFormattingMarks(),
                    { pressed: showFormattingMarks }
                  )}
              </div>
              <div className="dcx-rib-lbl">Show</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default RibbonChrome;
