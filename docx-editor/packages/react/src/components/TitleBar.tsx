/**
 * TitleBar and sub-components for the Google Docs-style 2-level toolbar.
 *
 * - TitleBar: two-row layout (row 1: logo + doc name + right actions, row 2: menu bar)
 * - Logo: renders custom logo content left-aligned
 * - DocumentName: editable document name input
 * - MenuBar: File/Format/Insert menus (auto-wired from EditorToolbarContext)
 * - TitleBarRight: right-aligned actions slot
 */

import React, { useCallback, Children, isValidElement } from 'react';
import type { ReactNode } from 'react';
import { MenuDropdown, SubMenuItem } from './ui/MenuDropdown';
import type { MenuEntry } from './ui/MenuDropdown';
import { MenuBarProvider } from './ui/MenuBarContext';
import { MaterialSymbol } from './ui/Icons';
import { Tooltip } from './ui/Tooltip';
import { TableGridInline } from './ui/TableGridInline';
import { useEditorToolbar } from './EditorToolbarContext';
import type { FormattingAction } from './Toolbar';
import { useTranslation } from '../i18n';
import { openReportIssue } from './reportIssue';

// ============================================================================
// Default Doc Icon (shown when no Logo is provided)
// ============================================================================

// Casual Editor brand mark — same shape and palette as the About dialog
// logo so the title-bar icon and the About icon are visually identical.
function DefaultDocIcon() {
  return (
    <svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M2 0C0.9 0 0 0.9 0 2V38C0 39.1 0.9 40 2 40H30C31.1 40 32 39.1 32 38V10L22 0H2Z"
        fill="#1a73e8"
      />
      <path d="M22 0L32 10H24C22.9 10 22 9.1 22 8V0Z" fill="#1557b0" />
      <rect x="7" y="18" width="18" height="2" rx="1" fill="#fff" />
      <rect x="7" y="23" width="18" height="2" rx="1" fill="#fff" />
      <rect x="7" y="28" width="12" height="2" rx="1" fill="#fff" />
    </svg>
  );
}

// ============================================================================
// Logo
// ============================================================================

export interface LogoProps {
  children: ReactNode;
}

export function Logo({ children }: LogoProps) {
  return <div className="flex items-center flex-shrink-0">{children}</div>;
}

// ============================================================================
// DocumentName
// ============================================================================

export interface DocumentNameProps {
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  editable?: boolean;
}

function stripExtension(name: string): string {
  return name.replace(/\.docx$/i, '');
}

export function DocumentName({ value, onChange, placeholder, editable = true }: DocumentNameProps) {
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t('titleBar.untitled');
  const displayName = stripExtension(value) ?? '';

  if (!editable) {
    return (
      <span className="text-base font-normal text-[color:var(--doc-text-on-surface,#1f2937)] px-2 py-0 min-w-[100px] max-w-[300px] truncate leading-tight">
        {displayName || resolvedPlaceholder}
      </span>
    );
  }
  return (
    <input
      type="text"
      value={displayName}
      onChange={(e) => {
        const raw = e.target.value;
        onChange?.(raw.endsWith('.docx') ? raw : raw + '.docx');
      }}
      placeholder={resolvedPlaceholder}
      className="text-base font-normal text-[color:var(--doc-text-on-surface,#1f2937)] bg-transparent border-0 outline-none px-2 py-0 rounded hover:bg-[color:var(--doc-bg-hover,#f1f3f4)] focus:bg-[color:var(--doc-surface,white)] focus:ring-1 focus:ring-slate-300 min-w-[100px] max-w-[300px] truncate leading-tight"
      aria-label={t('titleBar.documentNameAriaLabel')}
    />
  );
}

// ============================================================================
// TitleBarRight
// ============================================================================

export interface TitleBarRightProps {
  children: ReactNode;
}

export function TitleBarRight({ children }: TitleBarRightProps) {
  return (
    <div className="flex items-center gap-2 ml-auto flex-shrink-0">
      <SaveStatusIndicator />
      <ThemeToggleButton />
      {children}
    </div>
  );
}

// ============================================================================
// SaveStatusIndicator — shows "Saving…" while a save is in flight, then
// a "•" dot when there are unsaved edits, then nothing when clean.
// Wired from the host through ToolbarProps.isDirty / isSaving via the
// EditorToolbar context.
// ============================================================================

function SaveStatusIndicator() {
  const ctx = useEditorToolbar();
  const { isDirty, isSaving } = ctx;
  if (isSaving) {
    return (
      <span
        className="text-xs text-[color:var(--doc-text-on-surface-muted,#5f6368)] flex items-center gap-1"
        aria-live="polite"
      >
        <span
          aria-hidden="true"
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            border: '1.5px solid currentColor',
            borderTopColor: 'transparent',
            animation: 'docx-spin 0.7s linear infinite',
            display: 'inline-block',
          }}
        />
        Saving…
      </span>
    );
  }
  if (isDirty) {
    return (
      <span
        className="text-xs text-[color:var(--doc-text-on-surface-muted,#5f6368)]"
        title="Unsaved changes"
        aria-label="Unsaved changes"
      >
        Unsaved changes
      </span>
    );
  }
  return (
    <span
      className="text-xs text-[color:var(--doc-text-on-surface-muted,#5f6368)]"
      aria-live="polite"
    >
      All changes saved
    </span>
  );
}

// ============================================================================
// ThemeToggleButton — sun/moon/auto icon in the top-right that cycles
// through auto → light → dark. Hidden when the host doesn't wire
// onSetColorTheme. Renders inside TitleBarRight so it's always visible
// in the same spot as Share / status indicators.
// ============================================================================

function ThemeToggleButton() {
  const ctx = useEditorToolbar();
  const { onSetColorTheme, colorTheme } = ctx;
  if (!onSetColorTheme) return null;
  const current = colorTheme ?? 'auto';
  const next: 'light' | 'dark' | 'auto' =
    current === 'auto' ? 'light' : current === 'light' ? 'dark' : 'auto';
  const icon = current === 'dark' ? 'dark_mode' : current === 'light' ? 'light_mode' : 'contrast';
  const title =
    current === 'auto'
      ? 'Theme: match system (click for light)'
      : current === 'light'
        ? 'Theme: light (click for dark)'
        : 'Theme: dark (click for auto)';
  return (
    <Tooltip content={title}>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onSetColorTheme(next)}
        aria-label={title}
        className="flex items-center justify-center w-8 h-8 rounded hover:bg-[color:var(--doc-bg-hover,#f1f3f4)] text-[color:var(--doc-text-on-surface,#1f2937)]"
      >
        <MaterialSymbol name={icon} size={18} />
      </button>
    </Tooltip>
  );
}

// ============================================================================
// MenuBar
// ============================================================================

export function MenuBar() {
  const { t } = useTranslation();
  const ctx = useEditorToolbar();
  const {
    disabled = false,
    onFormat,
    onPrint,
    showPrintButton = true,
    onNew,
    onOpen,
    onSave,
    onMakeCopy,
    onPageSetup,
    onFileProperties,
    onExportPdf,
    onExportOdt,
    onExportMd,
    onExportTxt,
    onReportBug,
    onShowAbout,
    onOpenCommandPalette,
    onOpenKeyboardShortcuts,
    onOpenPreferences,
    onOpenWatermark,
    onOpenAccessibility,
    onOpenBuildingBlocks,
    onSetColorTheme,
    colorTheme,
    zoom,
    onZoomChange,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    onOpenFind,
    onOpenFindReplace,
    onOpenWordCount,
    onToggleVoiceTyping,
    voiceTypingActive,
    onToggleSpellCheck,
    spellCheckEnabled,
    currentFormatting,
    onInsertImage,
    onInsertTable,
    showTableInsert = true,
    onInsertPageBreak,
    onInsertSectionBreak,
    onInsertField,
    onInsertTOC,
    onOpenBookmarks,
    onOpenParagraphDialog,
    onOpenBordersShading,
    onInsertHorizontalRule,
    onOpenInsertSymbol,
    onInsertFootnote,
    onToggleShowRuler,
    rulerVisible,
    onToggleShowFormattingMarks,
    showFormattingMarks,
    onRefocusEditor,
  } = ctx;

  const handleFormat = useCallback(
    (action: FormattingAction) => {
      if (!disabled && onFormat) {
        onFormat(action);
      }
    },
    [disabled, onFormat]
  );

  const handleTableInsert = useCallback(
    (rows: number, columns: number) => {
      if (!disabled && onInsertTable) {
        onInsertTable(rows, columns);
        requestAnimationFrame(() => onRefocusEditor?.());
      }
    },
    [disabled, onInsertTable, onRefocusEditor]
  );

  const hasPrintOrPageSetup = (showPrintButton && onPrint) || onPageSetup;
  const hasExport = onExportPdf || onExportOdt || onExportMd || onExportTxt;
  const hasFileMenu =
    hasPrintOrPageSetup || onNew || onOpen || onSave || onFileProperties || hasExport;

  return (
    <MenuBarProvider>
      <div
        className="flex items-center overflow-x-auto whitespace-nowrap min-w-0"
        style={{ scrollbarWidth: 'none' }}
        role="menubar"
        aria-label={t('titleBar.menuBarAriaLabel')}
      >
        {/* File Menu */}
        {hasFileMenu && (
          <MenuDropdown
            label={t('toolbar.file')}
            disabled={disabled}
            items={[
              ...(onNew
                ? [
                    {
                      icon: 'note_add',
                      label: 'New',
                      shortcut: '⌘N',
                      onClick: onNew,
                    } as MenuEntry,
                  ]
                : []),
              ...(onOpen
                ? [
                    {
                      icon: 'file_upload',
                      label: t('toolbar.open'),
                      shortcut: t('toolbar.openShortcut'),
                      onClick: onOpen,
                    } as MenuEntry,
                  ]
                : []),
              ...(onSave
                ? [
                    {
                      icon: 'file_download',
                      label: t('toolbar.save'),
                      shortcut: t('toolbar.saveShortcut'),
                      onClick: onSave,
                    } as MenuEntry,
                  ]
                : []),
              ...(onMakeCopy
                ? [
                    {
                      icon: 'content_copy',
                      label: t('toolbar.makeCopy'),
                      onClick: onMakeCopy,
                    } as MenuEntry,
                  ]
                : []),
              ...((onOpen || onSave || onMakeCopy) &&
              (hasPrintOrPageSetup || onFileProperties || hasExport)
                ? [{ type: 'separator' as const } as MenuEntry]
                : []),
              ...(showPrintButton && onPrint
                ? [
                    {
                      icon: 'print',
                      label: t('toolbar.print'),
                      shortcut: t('toolbar.printShortcut'),
                      onClick: onPrint,
                    } as MenuEntry,
                  ]
                : []),
              ...(onExportPdf
                ? [
                    {
                      icon: 'file_download',
                      label: 'Export as PDF',
                      onClick: onExportPdf,
                    } as MenuEntry,
                  ]
                : []),
              ...(onExportOdt
                ? [
                    {
                      icon: 'file_download',
                      label: 'Export as ODT',
                      onClick: onExportOdt,
                    } as MenuEntry,
                  ]
                : []),
              ...(onExportMd
                ? [
                    {
                      icon: 'file_download',
                      label: 'Export as Markdown',
                      onClick: onExportMd,
                    } as MenuEntry,
                  ]
                : []),
              ...(onExportTxt
                ? [
                    {
                      icon: 'file_download',
                      label: 'Export as Plain Text',
                      onClick: onExportTxt,
                    } as MenuEntry,
                  ]
                : []),
              ...(onPageSetup
                ? [
                    {
                      icon: 'settings',
                      label: t('toolbar.pageSetup'),
                      onClick: onPageSetup,
                    } as MenuEntry,
                  ]
                : []),
              ...(onFileProperties
                ? [
                    {
                      icon: 'tune',
                      label: 'Properties',
                      onClick: onFileProperties,
                    } as MenuEntry,
                  ]
                : []),
            ]}
          />
        )}

        {/* Edit Menu */}
        <MenuDropdown
          label="Edit"
          disabled={disabled}
          items={[
            {
              icon: 'undo',
              label: 'Undo',
              shortcut: '⌘Z',
              onClick: onUndo ?? (() => {}),
              disabled: !canUndo,
            } as MenuEntry,
            {
              icon: 'redo',
              label: 'Redo',
              shortcut: '⌘Y',
              onClick: onRedo ?? (() => {}),
              disabled: !canRedo,
            } as MenuEntry,
            { type: 'separator' as const } as MenuEntry,
            // Clipboard ops — execCommand only works while the editor has focus,
            // so refocus first. Modern browsers block JS-initiated paste; the
            // shortcut label educates users to fall back to ⌘V.
            {
              icon: 'content_cut',
              label: 'Cut',
              shortcut: '⌘X',
              onClick: () => {
                onRefocusEditor?.();
                document.execCommand('cut');
              },
            } as MenuEntry,
            {
              icon: 'content_copy',
              label: 'Copy',
              shortcut: '⌘C',
              onClick: () => {
                onRefocusEditor?.();
                document.execCommand('copy');
              },
            } as MenuEntry,
            {
              icon: 'content_paste',
              label: 'Paste',
              shortcut: '⌘V',
              onClick: () => {
                onRefocusEditor?.();
                document.execCommand('paste');
              },
            } as MenuEntry,
            {
              icon: 'content_paste_go',
              label: 'Paste without formatting',
              shortcut: '⌘⇧V',
              onClick: async () => {
                onRefocusEditor?.();
                try {
                  const text = await navigator.clipboard.readText();
                  if (text) document.execCommand('insertText', false, text);
                } catch {
                  // Browser blocked the read; user can fall back to ⌘⇧V.
                }
              },
            } as MenuEntry,
            { type: 'separator' as const } as MenuEntry,
            ...(onOpenFind
              ? [
                  {
                    icon: 'search',
                    label: 'Find',
                    shortcut: '⌘F',
                    onClick: onOpenFind,
                  } as MenuEntry,
                ]
              : []),
            ...(onOpenFindReplace
              ? [
                  {
                    icon: 'find_replace',
                    label: 'Find and Replace',
                    shortcut: '⌘H',
                    onClick: onOpenFindReplace,
                  } as MenuEntry,
                ]
              : []),
            ...(onOpenFind || onOpenFindReplace
              ? [{ type: 'separator' as const } as MenuEntry]
              : []),
            {
              icon: 'select_all',
              label: 'Select All',
              shortcut: '⌘A',
              onClick: () => handleFormat('selectAll'),
            } as MenuEntry,
            ...(onOpenWordCount
              ? [
                  { type: 'separator' as const } as MenuEntry,
                  {
                    icon: 'format_list_numbered',
                    label: 'Word count',
                    shortcut: '⌘⇧C',
                    onClick: onOpenWordCount,
                  } as MenuEntry,
                ]
              : []),
            ...(onToggleVoiceTyping
              ? [
                  {
                    icon: 'mic',
                    label: voiceTypingActive ? '✓ Voice typing' : 'Voice typing',
                    onClick: onToggleVoiceTyping,
                  } as MenuEntry,
                ]
              : []),
            ...(onToggleSpellCheck
              ? [
                  { type: 'separator' as const } as MenuEntry,
                  {
                    icon: 'spellcheck',
                    label: spellCheckEnabled ? '✓ Spelling' : 'Spelling',
                    onClick: onToggleSpellCheck,
                  } as MenuEntry,
                ]
              : []),
          ]}
        />

        {/* Format Menu */}
        <MenuDropdown
          label={t('toolbar.format')}
          disabled={disabled}
          items={[
            {
              label: `${currentFormatting?.bold ? '✓ ' : ''}Bold`,
              shortcut: '⌘B',
              onClick: () => handleFormat('bold'),
            } as MenuEntry,
            {
              label: `${currentFormatting?.italic ? '✓ ' : ''}Italic`,
              shortcut: '⌘I',
              onClick: () => handleFormat('italic'),
            } as MenuEntry,
            {
              label: `${currentFormatting?.underline ? '✓ ' : ''}Underline`,
              shortcut: '⌘U',
              onClick: () => handleFormat('underline'),
            } as MenuEntry,
            {
              label: `${currentFormatting?.strike ? '✓ ' : ''}Strikethrough`,
              onClick: () => handleFormat('strikethrough'),
            } as MenuEntry,
            { type: 'separator' as const } as MenuEntry,
            {
              label: `${currentFormatting?.smallCaps ? '✓ ' : ''}Small Caps`,
              onClick: () => handleFormat('toggleSmallCaps'),
            } as MenuEntry,
            {
              label: `${currentFormatting?.allCaps ? '✓ ' : ''}All Caps`,
              onClick: () => handleFormat('toggleAllCaps'),
            } as MenuEntry,
            { type: 'separator' as const } as MenuEntry,
            {
              icon: 'format_line_spacing',
              label: t('toolbar.customSpacing'),
              onClick: onOpenParagraphDialog,
              disabled: !onOpenParagraphDialog,
            } as MenuEntry,
            {
              icon: 'border_outer',
              label: t('toolbar.bordersAndShading'),
              onClick: onOpenBordersShading,
              disabled: !onOpenBordersShading,
            } as MenuEntry,
            { type: 'separator' as const } as MenuEntry,
            {
              icon: 'format_clear',
              label: 'Clear formatting',
              shortcut: '⌘\\',
              onClick: () => handleFormat('clearFormatting'),
            } as MenuEntry,
            { type: 'separator' as const } as MenuEntry,
            {
              icon: 'format_textdirection_l_to_r',
              label: t('toolbar.leftToRight'),
              onClick: () => handleFormat('setLtr'),
            } as MenuEntry,
            {
              icon: 'format_textdirection_r_to_l',
              label: t('toolbar.rightToLeft'),
              onClick: () => handleFormat('setRtl'),
            } as MenuEntry,
          ]}
        />

        {/* View Menu — zoom + ruler + theme. Shown if any is wired. */}
        {(onZoomChange || onSetColorTheme || onToggleShowRuler || onToggleShowFormattingMarks) && (
          <MenuDropdown
            label="View"
            disabled={disabled}
            items={[
              ...(onZoomChange
                ? [
                    {
                      icon: 'add',
                      label: 'Zoom in',
                      shortcut: '⌘=',
                      onClick: () => onZoomChange(Math.min((zoom ?? 1) * 1.1, 4)),
                    } as MenuEntry,
                    {
                      icon: 'remove',
                      label: 'Zoom out',
                      shortcut: '⌘−',
                      onClick: () => onZoomChange(Math.max((zoom ?? 1) / 1.1, 0.25)),
                    } as MenuEntry,
                    {
                      icon: 'restart_alt',
                      label: 'Reset zoom (100%)',
                      shortcut: '⌘0',
                      onClick: () => onZoomChange(1),
                    } as MenuEntry,
                  ]
                : []),
              ...(onZoomChange && onToggleShowRuler
                ? [{ type: 'separator' as const } as MenuEntry]
                : []),
              ...(onToggleShowRuler
                ? [
                    {
                      icon: 'straighten',
                      label: `${rulerVisible ? '✓ ' : ''}Show ruler`,
                      onClick: onToggleShowRuler,
                    } as MenuEntry,
                  ]
                : []),
              ...(onToggleShowFormattingMarks
                ? [
                    {
                      label: `${showFormattingMarks ? '✓ ' : ''}${t('toolbar.showFormattingMarks')}`,
                      onClick: onToggleShowFormattingMarks,
                    } as MenuEntry,
                  ]
                : []),
              ...((onZoomChange || onToggleShowRuler) && onSetColorTheme
                ? [{ type: 'separator' as const } as MenuEntry]
                : []),
              ...(onSetColorTheme
                ? [
                    {
                      icon: 'contrast',
                      label: `${colorTheme === 'auto' || !colorTheme ? '✓ ' : ''}Theme: match system`,
                      onClick: () => onSetColorTheme('auto'),
                    } as MenuEntry,
                    {
                      icon: 'light_mode',
                      label: `${colorTheme === 'light' ? '✓ ' : ''}Theme: light`,
                      onClick: () => onSetColorTheme('light'),
                    } as MenuEntry,
                    {
                      icon: 'dark_mode',
                      label: `${colorTheme === 'dark' ? '✓ ' : ''}Theme: dark`,
                      onClick: () => onSetColorTheme('dark'),
                    } as MenuEntry,
                  ]
                : []),
            ]}
          />
        )}

        {/* Insert Menu */}
        <MenuDropdown
          label={t('toolbar.insert')}
          disabled={disabled}
          items={[
            ...(onInsertImage
              ? [{ icon: 'image', label: t('toolbar.image'), onClick: onInsertImage } as MenuEntry]
              : []),
            ...(showTableInsert && onInsertTable
              ? [
                  {
                    icon: 'grid_on',
                    label: t('toolbar.table'),
                    submenuContent: (closeMenu: () => void) => (
                      <TableGridInline
                        onInsert={(rows: number, cols: number) => {
                          handleTableInsert(rows, cols);
                          closeMenu();
                        }}
                      />
                    ),
                  } as MenuEntry,
                ]
              : []),
            ...(onInsertImage || (showTableInsert && onInsertTable)
              ? [{ type: 'separator' as const } as MenuEntry]
              : []),
            {
              icon: 'page_break',
              label: t('toolbar.pageBreak'),
              onClick: onInsertPageBreak,
              disabled: !onInsertPageBreak,
            },
            {
              icon: 'horizontal_rule',
              label: t('toolbar.horizontalLine'),
              onClick: onInsertHorizontalRule,
              disabled: !onInsertHorizontalRule,
            },
            {
              icon: 'horizontal_rule',
              label: t('toolbar.sectionBreak'),
              disabled: !onInsertSectionBreak,
              submenuContent: (closeMenu: () => void) => (
                <>
                  {(
                    [
                      { label: t('toolbar.sectionBreakNextPage'), type: 'nextPage' },
                      { label: t('toolbar.sectionBreakContinuous'), type: 'continuous' },
                      { label: t('toolbar.sectionBreakEvenPage'), type: 'evenPage' },
                      { label: t('toolbar.sectionBreakOddPage'), type: 'oddPage' },
                    ] as const
                  ).map((item) => (
                    <SubMenuItem
                      key={item.type}
                      label={item.label}
                      onClick={() => onInsertSectionBreak?.(item.type)}
                      closeMenu={closeMenu}
                    />
                  ))}
                </>
              ),
            },
            {
              icon: 'tag',
              label: t('toolbar.insertField'),
              disabled: !onInsertField,
              submenuContent: (closeMenu: () => void) => (
                <>
                  {(
                    [
                      { label: t('toolbar.fieldPage'), type: 'PAGE' },
                      { label: t('toolbar.fieldNumPages'), type: 'NUMPAGES' },
                      { label: t('toolbar.fieldDate'), type: 'DATE' },
                      { label: t('toolbar.fieldTime'), type: 'TIME' },
                      { label: t('toolbar.fieldCreateDate'), type: 'CREATEDATE' },
                      { label: t('toolbar.fieldSaveDate'), type: 'SAVEDATE' },
                      { label: t('toolbar.fieldAuthor'), type: 'AUTHOR' },
                      { label: t('toolbar.fieldFileName'), type: 'FILENAME' },
                    ] as const
                  ).map((item) => (
                    <SubMenuItem
                      key={item.type}
                      label={item.label}
                      onClick={() => onInsertField?.(item.type)}
                      closeMenu={closeMenu}
                    />
                  ))}
                </>
              ),
            },
            {
              icon: 'format_list_numbered',
              label: t('toolbar.tableOfContents'),
              onClick: onInsertTOC,
              disabled: !onInsertTOC,
            },
            {
              icon: 'bookmark',
              label: t('toolbar.bookmarks'),
              onClick: onOpenBookmarks,
              disabled: !onOpenBookmarks,
            },
            {
              icon: 'note_add',
              label: t('toolbar.footnote'),
              onClick: onInsertFootnote,
              disabled: !onInsertFootnote,
            },
            { type: 'separator' as const } as MenuEntry,
            {
              icon: 'emoji_symbols',
              label: t('toolbar.specialCharacters'),
              onClick: onOpenInsertSymbol,
              disabled: !onOpenInsertSymbol,
            },
            ...(onOpenBuildingBlocks
              ? [
                  {
                    label: t('toolbar.buildingBlocks'),
                    onClick: onOpenBuildingBlocks,
                  } as MenuEntry,
                ]
              : []),
            ...(onOpenWatermark
              ? [
                  { type: 'separator' as const } as MenuEntry,
                  {
                    label: t('toolbar.watermark'),
                    onClick: onOpenWatermark,
                  } as MenuEntry,
                ]
              : []),
          ]}
        />

        {/* Tools Menu — gated on having at least one Tools item. */}
        {(onOpenPreferences || onOpenAccessibility) && (
          <MenuDropdown
            label={t('toolbar.tools')}
            disabled={disabled}
            items={[
              ...(onOpenPreferences
                ? [
                    {
                      label: t('toolbar.preferences'),
                      onClick: onOpenPreferences,
                    } as MenuEntry,
                  ]
                : []),
              ...(onOpenAccessibility
                ? [
                    {
                      label: t('toolbar.accessibility'),
                      onClick: onOpenAccessibility,
                    } as MenuEntry,
                  ]
                : []),
            ]}
          />
        )}

        {/* Help Menu */}
        <MenuDropdown
          label={t('toolbar.help')}
          disabled={disabled}
          items={[
            ...(onOpenCommandPalette
              ? [
                  {
                    label: t('toolbar.searchMenus'),
                    onClick: onOpenCommandPalette,
                  } as MenuEntry,
                  { type: 'separator' as const } as MenuEntry,
                ]
              : []),
            {
              icon: 'bug_report',
              label: t('toolbar.reportIssue'),
              onClick: () => (onReportBug ? onReportBug() : openReportIssue()),
            } as MenuEntry,
            ...(onShowAbout
              ? [
                  { type: 'separator' as const } as MenuEntry,
                  {
                    icon: 'info',
                    label: 'About Casual Editor',
                    onClick: onShowAbout,
                  } as MenuEntry,
                ]
              : []),
            ...(onOpenKeyboardShortcuts
              ? [
                  { type: 'separator' as const } as MenuEntry,
                  {
                    label: t('toolbar.keyboardShortcuts'),
                    onClick: onOpenKeyboardShortcuts,
                  } as MenuEntry,
                ]
              : []),
          ]}
        />
      </div>
    </MenuBarProvider>
  );
}

// ============================================================================
// TitleBar
// ============================================================================

export interface TitleBarProps {
  children: ReactNode;
}

/**
 * TitleBar layout (Google Docs style):
 *
 *   ┌──────────┬────────────────────────────┬──────────────────┐
 *   │          │ Document Name              │                  │
 *   │  Logo    │                            │  Right Actions   │
 *   │          │ File  Format  Insert       │                  │
 *   └──────────┴────────────────────────────┴──────────────────┘
 *
 * Logo and TitleBarRight span full height. DocumentName + MenuBar
 * stack vertically in the center column.
 */
export function TitleBar({ children }: TitleBarProps) {
  let logoItem: ReactNode = null;
  let rightItem: ReactNode = null;
  const middleTopItems: ReactNode[] = [];
  const menuBarItems: ReactNode[] = [];

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === Logo) {
      logoItem = child;
    } else if (child.type === TitleBarRight) {
      rightItem = child;
    } else if (child.type === MenuBar) {
      menuBarItems.push(child);
    } else {
      middleTopItems.push(child);
    }
  });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const isInteractive =
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.tagName === 'OPTION';

    if (!isInteractive) {
      e.preventDefault();
    }
  }, []);

  return (
    <div
      className="flex items-stretch bg-[color:var(--doc-surface,white)] text-[color:var(--doc-text-on-surface,#1f2937)] pt-2 pb-1"
      onMouseDown={handleMouseDown}
      data-testid="title-bar"
    >
      {/* Left: Logo spanning full height (default doc icon if none provided) */}
      <div className="flex items-center flex-shrink-0 pl-3 pr-1">
        {logoItem || <DefaultDocIcon />}
      </div>

      {/* Center: doc name on top, menus below */}
      <div className="flex flex-col justify-center flex-1 min-w-0 py-1 overflow-hidden">
        {middleTopItems.length > 0 && (
          <div className="flex items-center gap-2 px-1 min-w-0">{middleTopItems}</div>
        )}
        {menuBarItems.length > 0 && (
          <div
            className="flex items-center px-1 min-w-0 overflow-x-auto"
            style={{ scrollbarWidth: 'none' }}
          >
            {menuBarItems}
          </div>
        )}
      </div>

      {/* Right: actions spanning full height */}
      {rightItem && <div className="flex items-center flex-shrink-0 px-3">{rightItem}</div>}
    </div>
  );
}
