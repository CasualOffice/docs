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
import { formatShortcut } from '../lib/platform';
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
  /** Whether selected text is hidden (w:vanish) */
  hidden?: boolean;
  /** Whether selected text has the emboss effect (w:emboss) */
  emboss?: boolean;
  /** Whether selected text has the imprint/engrave effect (w:imprint) */
  imprint?: boolean;
  /** Whether selected text has a drop-shadow effect (w:shadow) */
  shadow?: boolean;
  /** Whether selected text is outlined (w:outline) */
  outline?: boolean;
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
  /** Keep with next paragraph (w:keepNext). */
  keepNext?: boolean;
  /** Keep all lines of the paragraph together (w:keepLines). */
  keepLines?: boolean;
  /** Force a page break before this paragraph (w:pageBreakBefore). */
  pageBreakBefore?: boolean;
  /** Widow/orphan control (w:widowControl). */
  widowControl?: boolean;
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
  | 'toggleHidden'
  | 'toggleEmboss'
  | 'toggleImprint'
  | 'toggleTextShadow'
  | 'toggleTextOutline'
  | 'restartListNumbering'
  | 'continueListNumbering'
  | { type: 'fontFamily'; value: string }
  | { type: 'fontSize'; value: number }
  | { type: 'textColor'; value: ColorValue | string }
  | { type: 'highlightColor'; value: string }
  | { type: 'alignment'; value: ParagraphAlignment }
  | { type: 'lineSpacing'; value: number }
  | { type: 'spaceBefore'; value: number }
  | { type: 'spaceAfter'; value: number }
  | { type: 'charSpacing'; value: number }
  | { type: 'applyStyle'; value: string }
  | { type: 'keepNext'; value: boolean }
  | { type: 'keepLines'; value: boolean }
  | { type: 'pageBreakBefore'; value: boolean }
  | { type: 'widowControl'; value: boolean };

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
  /** Callback to open Word Count dialog (Ctrl+Shift+C in Google Docs). */
  onOpenWordCount?: () => void;
  /** Toggle voice typing (Web Speech API). Optional — hidden from the
   *  menu when the host doesn't pass it (e.g. unsupported browser). */
  onToggleVoiceTyping?: () => void;
  /** Whether voice typing is currently active — drives the menu
   *  entry's ✓ prefix. */
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
  /**
   * Callback to insert a section break. `breakType` mirrors the
   * OOXML `w:type` values: `nextPage` (default, starts new page),
   * `continuous` (same page), `evenPage` / `oddPage` (advances to
   * the next even/odd page).
   */
  onInsertSectionBreak?: (breakType: 'nextPage' | 'continuous' | 'oddPage' | 'evenPage') => void;
  /**
   * Callback to insert an inline OOXML field node — PAGE / NUMPAGES /
   * DATE / TIME / CREATEDATE / SAVEDATE / AUTHOR / FILENAME. PAGE +
   * NUMPAGES are the primary use in headers/footers; the others
   * apply anywhere fields are valid (body, header, footer, footnotes).
   */
  onInsertField?: (
    fieldType:
      | 'PAGE'
      | 'NUMPAGES'
      | 'DATE'
      | 'TIME'
      | 'CREATEDATE'
      | 'SAVEDATE'
      | 'AUTHOR'
      | 'FILENAME'
  ) => void;
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
  /** Tools → Explore — opens the Wikipedia lookup dialog (A3). */
  onOpenExplore?: () => void;
  /** Tools → Citations — opens the local citations manager (A6 v0). */
  onOpenCitations?: () => void;
  /** Insert → Shape — inserts a default SVG of the chosen primitive (C2 v0). */
  onInsertShape?: (type: 'rectangle' | 'ellipse' | 'line' | 'arrow') => void;
  /** File → "Email as attachment" — download + open mailto (F2). */
  onEmailAsAttachment?: () => void;
  /** View → Show formatting marks — toggles ¶ / → / ↵ overlay (F6). */
  onToggleShowFormattingMarks?: () => void;
  /** Current state of the formatting-marks toggle — drives the checkmark. */
  showFormattingMarks?: boolean;
  /** Theme picker — host sets colorTheme. `'auto'` follows OS preference. */
  onSetColorTheme?: (theme: 'light' | 'dark' | 'auto') => void;
  /** Current colorTheme setting; drives the title-bar toggle's icon. */
  colorTheme?: 'light' | 'dark' | 'auto';
  /** True when the document has unsaved edits — title bar shows a dot. */
  isDirty?: boolean;
  /** True while save is in flight — title bar shows "Saving…". */
  isSaving?: boolean;
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
  /** Optional keyboard shortcut hint shown in the tooltip in a kbd style. */
  shortcut?: string;
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
  shortcut,
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
        // Use the editor-on-surface text color so the SVG's currentColor
        // flips with the theme. Hover: slight background, no color change
        // needed because the icon already matches the surface text.
        'text-[color:var(--doc-text-on-surface-muted,#5f6368)] hover:text-[color:var(--doc-text-on-surface,#1f2937)] hover:bg-[color:var(--doc-bg-hover,#f1f3f4)]',
        // Active = blue-tinted background + primary blue icon, matching
        // Google Docs and our own table dropdowns (TableMoreDropdown,
        // TableOptionsDropdown, AlignmentButtons, IconGridDropdown,
        // PasteSpecialDialog). Earlier this used an inverted surface
        // (dark bg in light mode → looked "black-selected"; light bg
        // in dark mode → looked "white-selected"), which (a) read as
        // black not selected in light mode and (b) contradicted every
        // other selected-state in the editor.
        active &&
          'bg-[color:var(--doc-primary-light,#e8f0fe)] text-[color:var(--doc-primary,#1a73e8)] hover:bg-[color:var(--doc-primary-light,#e8f0fe)] hover:text-[color:var(--doc-primary,#1a73e8)]',
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
    const tooltipContent = shortcut ? (
      <span className="inline-flex items-center gap-2">
        <span>{title}</span>
        <kbd
          className="inline-flex items-center rounded border border-white/30 px-1 py-[1px] text-[10px] font-mono opacity-80"
          style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
        >
          {shortcut}
        </kbd>
      </span>
    ) : (
      title
    );
    return <Tooltip content={tooltipContent}>{button}</Tooltip>;
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
        'flex items-center gap-px px-1.5 border-r border-[color:var(--doc-border,#e0e0e0)]/50 last:border-r-0 first:pl-0',
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
  return <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1.5" role="separator" />;
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
  onInsertSectionBreak,
  onInsertField,
  onInsertTOC,
  onOpenBookmarks,
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
        'flex items-center px-1 py-1 bg-[color:var(--doc-surface,white)] border-b border-[color:var(--doc-border-light,#dadce0)] min-h-[36px] overflow-x-auto',
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
            shortcut: formatShortcut('Ctrl+Z'),
            // Disable when no handler is wired — previous fallback ran
            // `handleFormat('bold')`, which silently bolded the selection
            // when a host forgot to pass onUndo. Refuse to act instead.
            onClick: onUndo ?? (() => undefined),
            disabled: !canUndo || !onUndo,
          } as MenuEntry,
          {
            icon: 'redo',
            label: 'Redo',
            shortcut: formatShortcut('Ctrl+Y'),
            onClick: onRedo ?? (() => undefined),
            disabled: !canRedo || !onRedo,
          } as MenuEntry,
          { type: 'separator' as const },
          ...(onOpenFind
            ? [
                {
                  icon: 'search',
                  label: 'Find',
                  shortcut: formatShortcut('Ctrl+F'),
                  onClick: onOpenFind,
                } as MenuEntry,
              ]
            : []),
          ...(onOpenFindReplace
            ? [
                {
                  icon: 'find_replace',
                  label: 'Find and Replace',
                  shortcut: formatShortcut('Ctrl+H'),
                  onClick: onOpenFindReplace,
                } as MenuEntry,
              ]
            : []),
          ...(onOpenFind || onOpenFindReplace ? [{ type: 'separator' as const }] : []),
          {
            icon: 'select_all',
            label: 'Select All',
            shortcut: formatShortcut('Ctrl+A'),
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
            shortcut: formatShortcut('Ctrl+B'),
            onClick: () => handleFormat('bold'),
          } as MenuEntry,
          {
            label: `${currentFormatting?.italic ? '✓ ' : ''}Italic`,
            shortcut: formatShortcut('Ctrl+I'),
            onClick: () => handleFormat('italic'),
          } as MenuEntry,
          {
            label: `${currentFormatting?.underline ? '✓ ' : ''}Underline`,
            shortcut: formatShortcut('Ctrl+U'),
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
          {
            label: `${currentFormatting?.hidden ? '✓ ' : ''}Hidden`,
            onClick: () => handleFormat('toggleHidden'),
          } as MenuEntry,
          {
            // Text effects submenu — emboss / imprint / outline /
            // shadow, all CSS-driven and round-trip-clean through the
            // existing OOXML parser+serializer. The active state
            // checkmark per row reflects the mark on the selection.
            label: 'Text effects',
            submenuContent: (closeMenu: () => void) => (
              <div className="py-1 min-w-[180px]">
                {(
                  [
                    {
                      label: 'Emboss',
                      action: 'toggleEmboss' as const,
                      active: !!currentFormatting?.emboss,
                    },
                    {
                      label: 'Imprint',
                      action: 'toggleImprint' as const,
                      active: !!currentFormatting?.imprint,
                    },
                    {
                      label: 'Outline',
                      action: 'toggleTextOutline' as const,
                      active: !!currentFormatting?.outline,
                    },
                    {
                      label: 'Shadow',
                      action: 'toggleTextShadow' as const,
                      active: !!currentFormatting?.shadow,
                    },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.action}
                    role="menuitem"
                    className="w-full text-left px-4 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleFormat(item.action);
                      closeMenu();
                    }}
                  >
                    {item.active ? '✓ ' : ''}
                    {item.label}
                  </button>
                ))}
              </div>
            ),
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
                    role="menuitem"
                    className="w-full text-left px-4 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
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
          { type: 'separator' as const },
          // List numbering control. Disabled when the cursor isn't
          // in a list paragraph — the command itself early-returns
          // false in that case, but disabling the menu row gives a
          // clearer affordance. listState carries the in-list signal
          // from selectionState.
          {
            icon: 'restart_alt',
            label: t('toolbar.restartListNumbering'),
            onClick: () => handleFormat('restartListNumbering'),
            disabled: !currentFormatting?.listState?.isInList,
          } as MenuEntry,
          {
            icon: 'arrow_downward',
            label: t('toolbar.continueListNumbering'),
            onClick: () => handleFormat('continueListNumbering'),
            disabled: !currentFormatting?.listState?.isInList,
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
          // Section break submenu. The four entries map to OOXML
          // `w:type`: `nextPage` is the Word default (new page); the
          // other three are common section-control gestures. Disabled
          // when no callback is wired so the consumer can hide the
          // feature entirely by withholding `onInsertSectionBreak`.
          {
            icon: 'horizontal_rule',
            label: t('toolbar.sectionBreak'),
            disabled: !onInsertSectionBreak,
            submenuContent: (closeMenu: () => void) => (
              <div className="py-1 min-w-[200px]">
                {(
                  [
                    { label: t('toolbar.sectionBreakNextPage'), type: 'nextPage' },
                    { label: t('toolbar.sectionBreakContinuous'), type: 'continuous' },
                    { label: t('toolbar.sectionBreakEvenPage'), type: 'evenPage' },
                    { label: t('toolbar.sectionBreakOddPage'), type: 'oddPage' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.type}
                    role="menuitem"
                    className="w-full text-left px-4 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onInsertSectionBreak?.(item.type);
                      closeMenu();
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ),
          },
          // Field insert submenu — PAGE / NUMPAGES are the headline
          // entries (header/footer page-numbering); DATE / TIME /
          // CREATEDATE / SAVEDATE / AUTHOR / FILENAME round out the
          // common set. Round-trip locked in by
          // __tests__/footer-field-roundtrip.test.ts.
          {
            icon: 'tag',
            label: t('toolbar.insertField'),
            disabled: !onInsertField,
            submenuContent: (closeMenu: () => void) => (
              <div className="py-1 min-w-[200px]">
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
                  <button
                    key={item.type}
                    role="menuitem"
                    className="w-full text-left px-4 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onInsertField?.(item.type);
                      closeMenu();
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
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
