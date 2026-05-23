/**
 * Formatting Toolbar Component
 *
 * A toolbar with formatting controls for the DOCX editor:
 * - Font family picker
 * - Bold (Ctrl+B), Italic (Ctrl+I), Underline (Ctrl+U), Strikethrough
 * - Superscript, Subscript buttons
 * - Shows active state for current selection formatting
 * - Applies formatting to selection
 *
 * Classic single-row layout: menus (File, Format, Insert) + formatting icons.
 * Uses FormattingBar internally for the icon toolbar.
 */

import React, { useCallback, useRef } from 'react';
import { useTranslation } from '../i18n';
import type { CSSProperties, ReactNode } from 'react';
import type {
  ColorValue,
  ParagraphAlignment,
  Style,
  Theme,
} from '@eigenpal/docx-core/types/document';
import { Button } from './ui/Button';
import { Tooltip } from './ui/Tooltip';
import { MenuDropdown } from './ui/MenuDropdown';
import type { MenuEntry } from './ui/MenuDropdown';
import { TableGridInline } from './ui/TableGridInline';
import type { TableAction } from './ui/TableToolbar';
import type { ListState } from './ui/ListButtons';
import type { FontOption } from './ui/FontPicker';
import { cn } from '../lib/utils';
import { FormattingBar } from './FormattingBar';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Current formatting state of the selection
 */
export interface SelectionFormatting {
  /** Whether selected text is bold */
  bold?: boolean;
  /** Whether selected text is italic */
  italic?: boolean;
  /** Whether selected text is underlined */
  underline?: boolean;
  /** Whether selected text has strikethrough */
  strike?: boolean;
  /** Whether selected text is superscript */
  superscript?: boolean;
  /** Whether selected text is subscript */
  subscript?: boolean;
  /** Whether selected text is small caps */
  smallCaps?: boolean;
  /** Whether selected text is all caps */
  allCaps?: boolean;
  /** Font family of selected text */
  fontFamily?: string;
  /** Font size of selected text (in half-points) */
  fontSize?: number;
  /** Text color */
  color?: string;
  /** Highlight color */
  highlight?: string;
  /** Paragraph alignment */
  alignment?: ParagraphAlignment;
  /** List state of the current paragraph */
  listState?: ListState;
  /** Line spacing in twips (OOXML value, 240 = single spacing) */
  lineSpacing?: number;
  /** Paragraph space before in twips */
  spaceBefore?: number;
  /** Paragraph space after in twips */
  spaceAfter?: number;
  /** Paragraph style ID */
  styleId?: string;
  /** Paragraph left indentation in twips */
  indentLeft?: number;
  /** Whether the paragraph is RTL (bidi) */
  bidi?: boolean;
}

/**
 * Formatting action types
 */
export type FormattingAction =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'superscript'
  | 'subscript'
  | 'clearFormatting'
  | 'bulletList'
  | 'numberedList'
  | 'indent'
  | 'outdent'
  | 'insertLink'
  | 'setRtl'
  | 'setLtr'
  | 'selectAll'
  | 'toggleSmallCaps'
  | 'toggleAllCaps'
  | { type: 'fontFamily'; value: string }
  | { type: 'fontSize'; value: number }
  | { type: 'textColor'; value: ColorValue | string }
  | { type: 'highlightColor'; value: string }
  | { type: 'alignment'; value: ParagraphAlignment }
  | { type: 'lineSpacing'; value: number }
  | { type: 'spaceBefore'; value: number }
  | { type: 'spaceAfter'; value: number }
  | { type: 'charSpacing'; value: number }
  | { type: 'applyStyle'; value: string };

/**
 * Props for the Toolbar component
 */
export interface ToolbarProps {
  /** Current formatting of the selection */
  currentFormatting?: SelectionFormatting;
  /** Callback when a formatting action is triggered */
  onFormat?: (action: FormattingAction) => void;
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
  /** Callback to toggle browser spellcheck on the editor */
  onToggleSpellCheck?: () => void;
  /** Whether spellcheck is currently enabled */
  spellCheckEnabled?: boolean;
  /** Whether the toolbar is disabled */
  disabled?: boolean;
  /** Additional CSS class name */
  className?: string;
  /** Additional inline styles */
  style?: CSSProperties;
  /** Whether to enable keyboard shortcuts (default: true) */
  enableShortcuts?: boolean;
  /** Ref to the editor container for keyboard events */
  editorRef?: React.RefObject<HTMLElement>;
  /** Custom toolbar items to render */
  children?: ReactNode;
  /** Whether to show font family picker (default: true) */
  showFontPicker?: boolean;
  /**
   * Custom list of fonts in the toolbar dropdown. When omitted, the built-in
   * 12-font default is used. Strings render in the "Other" group; pass
   * `FontOption[]` for category grouping and CSS fallback chains.
   * An empty array renders an empty (but enabled) dropdown.
   */
  fontFamilies?: ReadonlyArray<string | FontOption>;
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
  documentStyles?: Style[];
  /** Theme for the style picker */
  theme?: Theme | null;
  /** Callback for print action */
  onPrint?: () => void;
  /** Whether to show print button (default: true) */
  showPrintButton?: boolean;
  /** Callback to open/import a DOCX file (File → Open) */
  onOpen?: () => void;
  /** Callback to save/download the current DOCX (File → Save) */
  onSave?: () => void;
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
  /** Callback when user wants to insert a table of contents */
  onInsertTOC?: () => void;
  /** Callback when user wants to insert a shape */
  onInsertShape?: (data: {
    shapeType: string;
    width: number;
    height: number;
    fillColor?: string;
    fillType?: string;
    outlineWidth?: number;
    outlineColor?: string;
  }) => void;
  /** Image context when an image is selected */
  imageContext?: {
    wrapType: string;
    displayMode: string;
    cssFloat: string | null;
  } | null;
  /** Callback when image wrap type changes */
  onImageWrapType?: (wrapType: string) => void;
  /** Callback for image transform (rotate/flip) */
  onImageTransform?: (action: 'rotateCW' | 'rotateCCW' | 'flipH' | 'flipV') => void;
  /** Callback to open image properties dialog (alt text + border) */
  onOpenImageProperties?: () => void;
  /** Callback to open page setup dialog */
  onPageSetup?: () => void;
  /** Callback to open File → Properties dialog (`docProps/core.xml`) */
  onFileProperties?: () => void;
  /** Callback for Export as PDF — opens the print pipeline so the user
   *  can pick "Save as PDF" as the destination. */
  onExportPdf?: () => void;
  /** Callback for Export as .odt — routes the serialized DOCX bytes through
   *  the @schnsrw/core WASM converter. */
  onExportOdt?: () => void;
  /** Callback for Export as .md — routes the serialized DOCX bytes through
   *  the @schnsrw/core WASM converter. */
  onExportMd?: () => void;
  /** Callback for Export as .txt — routes the serialized DOCX bytes through
   *  the @schnsrw/core WASM converter. */
  onExportTxt?: () => void;
  /** Help → Report a bug — opens the GitHub issue template prefilled with env info. */
  onReportBug?: () => void;
  /** Help → About — opens the About dialog. */
  onShowAbout?: () => void;
  /** Table context when cursor is in a table */
  tableContext?: {
    isInTable: boolean;
    rowCount?: number;
    columnCount?: number;
    canSplitCell?: boolean;
    hasMultiCellSelection?: boolean;
    cellBorderColor?: ColorValue;
    cellBackgroundColor?: string;
  } | null;
  /** Callback when a table action is triggered */
  onTableAction?: (action: TableAction) => void;
}

/**
 * Props for individual toolbar buttons
 */
export interface ToolbarButtonProps {
  /** Whether the button is in active/pressed state */
  active?: boolean;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Button title/tooltip */
  title?: string;
  /** Click handler */
  onClick?: () => void;
  /** Button content */
  children: ReactNode;
  /** Additional CSS class name */
  className?: string;
  /** ARIA label for accessibility */
  ariaLabel?: string;
}

/**
 * Props for toolbar button groups
 */
export interface ToolbarGroupProps {
  /** Group label for accessibility */
  label?: string;
  /** Group content */
  children: ReactNode;
  /** Additional CSS class name */
  className?: string;
}

// ============================================================================
// SUBCOMPONENTS
// ============================================================================

/**
 * Individual toolbar button with shadcn styling
 */
export function ToolbarButton({
  active = false,
  disabled = false,
  title,
  onClick,
  children,
  className,
  ariaLabel,
}: ToolbarButtonProps) {
  const testId =
    ariaLabel?.toLowerCase().replace(/\s+/g, '-') ||
    title
      ?.toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/\([^)]*\)/g, '')
      .trim();

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const button = (
    <Button
      variant="ghost"
      size="icon-sm"
      className={cn(
        'text-slate-500 hover:text-slate-900 hover:bg-slate-100/80',
        active && 'bg-slate-900 text-white hover:bg-slate-800 hover:text-white',
        disabled && 'opacity-30 cursor-not-allowed',
        className
      )}
      onMouseDown={handleMouseDown}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={ariaLabel || title}
      data-testid={testId ? `toolbar-${testId}` : undefined}
    >
      {children}
    </Button>
  );

  if (title) {
    return <Tooltip content={title}>{button}</Tooltip>;
  }

  return button;
}

/**
 * Toolbar button group with modern styling
 */
export function ToolbarGroup({ label, children, className }: ToolbarGroupProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-px px-1.5 border-r border-slate-200/50 last:border-r-0 first:pl-0',
        className
      )}
      role="group"
      aria-label={label}
    >
      {children}
    </div>
  );
}

/**
 * Toolbar separator
 */
export function ToolbarSeparator() {
  return <div className="w-px h-6 bg-slate-200 mx-1.5" role="separator" />;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Classic single-row formatting toolbar: menus + formatting icons.
 * Uses FormattingBar internally with inline mode so everything stays in one flex row.
 */
export function Toolbar({
  children,
  className,
  style,
  disabled = false,
  onFormat,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onOpenFind,
  onOpenFindReplace,
  onToggleSpellCheck,
  spellCheckEnabled,
  onPrint,
  showPrintButton = true,
  onOpen,
  onSave,
  onPageSetup,
  onFileProperties,
  onExportPdf,
  onExportOdt,
  onExportMd,
  onExportTxt,
  onReportBug,
  onShowAbout,
  onInsertImage,
  onInsertTable,
  showTableInsert = true,
  onInsertPageBreak,
  onInsertTOC,
  onRefocusEditor,
  currentFormatting,
  ...restProps
}: ToolbarProps) {
  const { t } = useTranslation();
  const toolbarRef = useRef<HTMLDivElement>(null);

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

  const handleToolbarMouseDown = useCallback((e: React.MouseEvent) => {
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

  const handleToolbarMouseUp = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      const activeEl = document.activeElement as HTMLElement;
      const isSelectActive =
        target.tagName === 'SELECT' ||
        target.tagName === 'OPTION' ||
        activeEl?.tagName === 'SELECT';

      if (isSelectActive) return;

      requestAnimationFrame(() => {
        onRefocusEditor?.();
      });
    },
    [onRefocusEditor]
  );

  return (
    <div
      ref={toolbarRef}
      className={cn(
        'flex items-center px-1 py-1 bg-white border-b border-slate-100 min-h-[36px] overflow-x-auto',
        className
      )}
      style={style}
      role="toolbar"
      aria-label={t('toolbar.ariaLabel')}
      data-testid="toolbar"
      onMouseDown={handleToolbarMouseDown}
      onMouseUp={handleToolbarMouseUp}
    >
      {/* File Menu */}
      {(() => {
        const hasPrintOrPageSetup = (showPrintButton && onPrint) || onPageSetup;
        const hasFileMenu =
          hasPrintOrPageSetup || onOpen || onSave || onFileProperties || onExportPdf;
        if (!hasFileMenu) return null;
        return (
          <MenuDropdown
            label={t('toolbar.file')}
            disabled={disabled}
            items={[
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
              ...((onOpen || onSave) && (hasPrintOrPageSetup || onFileProperties || onExportPdf)
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
        );
      })()}

      {/* Edit Menu */}
      <MenuDropdown
        label="Edit"
        disabled={disabled}
        items={[
          {
            icon: 'undo',
            label: 'Undo',
            shortcut: '⌘Z',
            onClick: onUndo ?? (() => handleFormat('bold')), // overridden below
            disabled: !canUndo,
          } as MenuEntry,
          {
            icon: 'redo',
            label: 'Redo',
            shortcut: '⌘Y',
            onClick: onRedo ?? (() => {}),
            disabled: !canRedo,
          } as MenuEntry,
          { type: 'separator' as const },
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
          ...(onOpenFind || onOpenFindReplace ? [{ type: 'separator' as const }] : []),
          {
            icon: 'select_all',
            label: 'Select All',
            shortcut: '⌘A',
            onClick: () => handleFormat('selectAll'),
          } as MenuEntry,
          ...(onToggleSpellCheck
            ? [
                { type: 'separator' as const },
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
          { type: 'separator' as const },
          {
            label: `${currentFormatting?.smallCaps ? '✓ ' : ''}Small Caps`,
            onClick: () => handleFormat('toggleSmallCaps'),
          } as MenuEntry,
          {
            label: `${currentFormatting?.allCaps ? '✓ ' : ''}All Caps`,
            onClick: () => handleFormat('toggleAllCaps'),
          } as MenuEntry,
          { type: 'separator' as const },
          {
            label: 'Character spacing',
            submenuContent: (closeMenu: () => void) => (
              <div className="py-1 min-w-[180px]">
                {[
                  { label: 'Normal', value: 0 },
                  { label: 'Expanded (+1pt)', value: 20 },
                  { label: 'Expanded (+2pt)', value: 40 },
                  { label: 'Condensed (−1pt)', value: -20 },
                  { label: 'Condensed (−2pt)', value: -40 },
                ].map((item) => (
                  <button
                    key={item.value}
                    className="w-full text-left px-4 py-1.5 text-sm hover:bg-slate-100"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleFormat({ type: 'charSpacing', value: item.value });
                      closeMenu();
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ),
          } as MenuEntry,
          { type: 'separator' as const },
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
            icon: 'format_list_numbered',
            label: t('toolbar.tableOfContents'),
            onClick: onInsertTOC,
            disabled: !onInsertTOC,
          },
        ]}
      />

      {/* Help Menu */}
      {(onReportBug || onShowAbout) && (
        <MenuDropdown
          label={t('toolbar.help')}
          disabled={disabled}
          items={[
            ...(onReportBug
              ? [
                  {
                    icon: 'bug_report',
                    label: t('toolbar.reportIssue'),
                    onClick: onReportBug,
                  } as MenuEntry,
                ]
              : []),
            ...(onReportBug && onShowAbout ? [{ type: 'separator' as const } as MenuEntry] : []),
            ...(onShowAbout
              ? [
                  {
                    icon: 'info',
                    label: 'About Casual Editor',
                    onClick: onShowAbout,
                  } as MenuEntry,
                ]
              : []),
          ]}
        />
      )}

      {/* Formatting icons — rendered inline (display:contents) */}
      <FormattingBar
        {...restProps}
        disabled={disabled}
        onFormat={onFormat}
        onRefocusEditor={onRefocusEditor}
        onInsertTable={onInsertTable}
        showTableInsert={showTableInsert}
        onInsertImage={onInsertImage}
        onInsertPageBreak={onInsertPageBreak}
        onInsertTOC={onInsertTOC}
        onPrint={onPrint}
        showPrintButton={showPrintButton}
        onPageSetup={onPageSetup}
        inline
      >
        {children}
      </FormattingBar>
    </div>
  );
}

// ============================================================================
// RE-EXPORTED UTILITIES (from toolbarUtils.ts)
// ============================================================================

export {
  getSelectionFormatting,
  applyFormattingAction,
  hasActiveFormatting,
  mapHexToHighlightName,
} from './toolbarUtils';

export default Toolbar;
