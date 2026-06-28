/**
 * StarterKit — bundles all extensions into a ready-to-use set
 *
 * Usage:
 *   const extensions = createStarterKit();
 *   const manager = new ExtensionManager(extensions);
 *   manager.buildSchema();
 *   manager.initializeRuntime();
 */

import type { AnyExtension } from './types';
import type { SelectionChangeCallback } from '../plugins/selectionTracker';

// Core
import { DocExtension } from './core/DocExtension';
import { TextExtension } from './core/TextExtension';
import { ParagraphExtension } from './core/ParagraphExtension';
import { HistoryExtension } from './core/HistoryExtension';

// Marks
import { BoldExtension } from './marks/BoldExtension';
import { ItalicExtension } from './marks/ItalicExtension';
import { UnderlineExtension } from './marks/UnderlineExtension';
import { StrikeExtension } from './marks/StrikeExtension';
import { TextColorExtension } from './marks/TextColorExtension';
import { HighlightExtension } from './marks/HighlightExtension';
import { RunShadingExtension } from './marks/RunShadingExtension';
import { FontSizeExtension } from './marks/FontSizeExtension';
import { FontFamilyExtension } from './marks/FontFamilyExtension';
import { SuperscriptExtension } from './marks/SuperscriptExtension';
import { SubscriptExtension } from './marks/SubscriptExtension';
import { HyperlinkExtension } from './marks/HyperlinkExtension';
import { AllCapsExtension } from './marks/AllCapsExtension';
import { SmallCapsExtension } from './marks/SmallCapsExtension';
import { FootnoteRefExtension } from './marks/FootnoteRefExtension';
import { CharacterSpacingExtension } from './marks/CharacterSpacingExtension';
import { CommentExtension } from './marks/CommentExtension';
import { InsertionExtension, DeletionExtension } from './marks/TrackedChangeExtensions';
import {
  EmbossExtension,
  ImprintExtension,
  TextShadowExtension,
  EmphasisMarkExtension,
  TextOutlineExtension,
} from './marks/TextEffectsExtensions';
import { HiddenExtension, RtlExtension, TextEffectExtension } from './marks/HiddenTextExtensions';

// Nodes
import { HardBreakExtension } from './nodes/HardBreakExtension';
import { TabExtension } from './nodes/TabExtension';
import { ImageExtension } from './nodes/ImageExtension';
import { TextBoxExtension } from './nodes/TextBoxExtension';
import { ShapeExtension } from './nodes/ShapeExtension';
import { HorizontalRuleExtension } from './nodes/HorizontalRuleExtension';
import { PageBreakExtension } from './nodes/PageBreakExtension';
import { FieldExtension } from './nodes/FieldExtension';
import { SdtExtension } from './nodes/SdtExtension';
import { MathExtension } from './nodes/MathExtension';
import { createTableExtensions } from './nodes/TableExtension';

// Features
import { ListExtension } from './features/ListExtension';
import { InlineMarkdownExtension } from './features/InlineMarkdownExtension';
import { BaseKeymapExtension } from './features/BaseKeymapExtension';
import { SelectionTrackerExtension } from './features/SelectionTrackerExtension';
import { ImageDragExtension } from './features/ImageDragExtension';
import { ImagePasteExtension } from './features/ImagePasteExtension';
import { DropCursorExtension } from './features/DropCursorExtension';
import { ParagraphChangeTrackerExtension } from './features/ParagraphChangeTrackerExtension';
import { ParaIdAllocatorExtension } from './features/ParaIdAllocatorExtension';
import { StoredMarksRestoreExtension } from './features/StoredMarksRestoreExtension';
import { BidiShortcutExtension } from './features/BidiShortcutExtension';
import { PasteStyleInlinerExtension } from './features/PasteStyleInlinerExtension';
import { SmartQuotesExtension } from './features/SmartQuotesExtension';
import { AutocorrectExtension } from './features/AutocorrectExtension';
import { SmartChipExtension } from './features/SmartChipExtension';
import { SpellcheckExtension } from './features/SpellcheckExtension';
import { GrammarExtension } from './features/GrammarExtension';
import { WordNavigationExtension } from './features/WordNavigationExtension';

export interface StarterKitOptions {
  /** Extensions to disable by name */
  disable?: string[];
  /** History depth (default: 100) */
  historyDepth?: number;
  /** History new group delay (default: 500) */
  historyNewGroupDelay?: number;
  /** Selection change callback */
  onSelectionChange?: SelectionChangeCallback;
}

/**
 * Create the full set of extensions for the DOCX editor
 */
export function createStarterKit(options: StarterKitOptions = {}): AnyExtension[] {
  const disabled = new Set(options.disable || []);

  const extensions: AnyExtension[] = [];

  function add(name: string, ext: AnyExtension): void {
    if (!disabled.has(name)) {
      extensions.push(ext);
    }
  }

  // Core (always included unless explicitly disabled)
  add('doc', DocExtension());
  add('text', TextExtension());
  add('paragraph', ParagraphExtension());
  add(
    'history',
    HistoryExtension({
      depth: options.historyDepth,
      newGroupDelay: options.historyNewGroupDelay,
    })
  );

  // Marks
  add('bold', BoldExtension());
  add('italic', ItalicExtension());
  add('underline', UnderlineExtension());
  add('strike', StrikeExtension());
  add('textColor', TextColorExtension());
  add('highlight', HighlightExtension());
  add('runShading', RunShadingExtension());
  add('fontSize', FontSizeExtension());
  add('fontFamily', FontFamilyExtension());
  add('superscript', SuperscriptExtension());
  add('subscript', SubscriptExtension());
  add('hyperlink', HyperlinkExtension());
  add('allCaps', AllCapsExtension());
  add('smallCaps', SmallCapsExtension());
  add('footnoteRef', FootnoteRefExtension());
  add('characterSpacing', CharacterSpacingExtension());
  add('emboss', EmbossExtension());
  add('imprint', ImprintExtension());
  add('textShadow', TextShadowExtension());
  add('emphasisMark', EmphasisMarkExtension());
  add('textOutline', TextOutlineExtension());
  add('hidden', HiddenExtension());
  add('rtl', RtlExtension());
  add('textEffect', TextEffectExtension());
  add('comment', CommentExtension());
  add('insertion', InsertionExtension());
  add('deletion', DeletionExtension());

  // Nodes
  add('hardBreak', HardBreakExtension());
  add('tab', TabExtension());
  add('image', ImageExtension());
  add('textBox', TextBoxExtension());
  add('shape', ShapeExtension());
  add('imageDrag', ImageDragExtension());
  add('imagePaste', ImagePasteExtension());
  add('dropCursor', DropCursorExtension());
  add('horizontalRule', HorizontalRuleExtension());
  add('pageBreak', PageBreakExtension());
  add('field', FieldExtension());
  add('sdt', SdtExtension());
  add('math', MathExtension());

  // Table (5 extensions grouped)
  if (!disabled.has('table')) {
    extensions.push(...createTableExtensions());
  }

  // Features
  add('pasteStyleInliner', PasteStyleInlinerExtension());
  add('list', ListExtension());
  add('inlineMarkdown', InlineMarkdownExtension());
  add('baseKeymap', BaseKeymapExtension());
  add(
    'selectionTracker',
    SelectionTrackerExtension({
      onSelectionChange: options.onSelectionChange,
    })
  );
  add('paragraphChangeTracker', ParagraphChangeTrackerExtension());
  // Run after the change tracker so it sees paragraphs in their final
  // state. Allocates `paraId` for any paragraph without one (e.g. new
  // paragraphs from Enter / paste / programmatic insertion).
  add('paraIdAllocator', ParaIdAllocatorExtension());
  // Restore storedMarks from a paragraph's defaultTextFormatting after
  // doc-changing edits that clear storedMarks (e.g. select-all + Backspace).
  // Must run after paraIdAllocator so the paragraph's attrs are final.
  // Gated on docChanged to avoid firing on selection-only transactions
  // (caught a race against TableMoreDropdown re-renders 2026-05-25).
  add('storedMarksRestore', StoredMarksRestoreExtension());
  add('bidiShortcut', BidiShortcutExtension());
  // Typographic substitutions (smart quotes, em dash, ellipsis) as
  // the user types. Defaults on, matching Word + Docs. Disable via
  // `createStarterKit({ disable: ['smartQuotes'] })` when authoring
  // technical content where straight quotes matter (e.g. code).
  add('smartQuotes', SmartQuotesExtension());
  // Autocorrect: symbol sequences ((c)→©, -->→→) + a small common-
  // typo dictionary (teh→the). Same input-rule mechanism as smart
  // quotes, single-transaction so Ctrl+Z reverts. Defaults on;
  // disable via createStarterKit({ disable: ['autocorrect'] }).
  add('autocorrect', AutocorrectExtension());
  // Smart-chip trigger: tracks an active `@query` so the React layer can show
  // a caret-anchored chip menu (currently `@date` → DATE field).
  add('smartChip', SmartChipExtension());
  // Spell-check decorations — inert until the React side calls
  // `setSpellChecker(...)` with an nspell-backed engine + the user
  // toggles it on. Off by default so the ~500 KB dictionary download
  // doesn't fire on every page load.
  add('spellcheck', SpellcheckExtension());
  // Grammar-check decorations — inert until the React side registers a
  // checker via `setGrammarChecker(...)` and the user toggles it on. Sibling
  // of spellcheck; paints a blue underline under likely grammar mistakes.
  add('grammar', GrammarExtension());
  // Word-wise cursor motion (Alt+Arrow on macOS, Ctrl+Arrow elsewhere) +
  // Shift variants to extend. Operates on PM state — the dialog-advertised
  // "move by word" had no working binding before this.
  add('wordNavigation', WordNavigationExtension());

  return extensions;
}
