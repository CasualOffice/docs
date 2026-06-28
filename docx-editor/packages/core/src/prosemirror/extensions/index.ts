/**
 * Extension System — Barrel Export
 */

// Types
export { Priority } from './types';
export type {
  ExtensionPriority,
  ExtensionContext,
  CommandMap,
  KeyboardShortcutMap,
  ExtensionRuntime,
  ExtensionConfig,
  NodeExtensionConfig,
  MarkExtensionConfig,
  Extension,
  NodeExtension,
  MarkExtension,
  AnyExtension,
  ExtensionDefinition,
  NodeExtensionDefinition,
  MarkExtensionDefinition,
} from './types';

// Factories
export { createExtension, createNodeExtension, createMarkExtension } from './create';

// Manager
export { ExtensionManager } from './ExtensionManager';

// StarterKit
export { createStarterKit } from './StarterKit';
export type { StarterKitOptions } from './StarterKit';

// Runtime preferences — read by SmartQuotes/Autocorrect each keystroke.
// Tools → Preferences dialog mutates these; the React layer persists to
// localStorage on mount and on change.
export { editorPreferences, setEditorPreference } from './features/editorPreferences';
export type { EditorPreferences } from './features/editorPreferences';

// Spell-check — the extension is registered by `createStarterKit`; the
// React layer plugs in the actual dictionary engine via `setSpellChecker`.
export {
  SpellcheckExtension,
  setSpellChecker,
  refreshSpellcheckDecorations,
  spellcheckPluginKey,
} from './features/SpellcheckExtension';
export type { SpellChecker } from './features/SpellcheckExtension';

// Grammar-check — sibling of spellcheck; the React layer plugs in the actual
// analysis engine via `setGrammarChecker`.
export {
  GrammarExtension,
  setGrammarChecker,
  refreshGrammarDecorations,
  getGrammarIssueAt,
  grammarPluginKey,
} from './features/GrammarExtension';
export type { GrammarChecker, GrammarMatch, GrammarIssue } from './features/GrammarExtension';

// Re-export specific extensions consumers commonly customize
export {
  ParagraphChangeTrackerExtension,
  getChangedParagraphIds,
  hasStructuralChanges,
  hasUntrackedChanges,
  getChangedBlockTypes,
  hasNonParagraphBlockChanges,
  clearTrackedChanges,
} from './features/ParagraphChangeTrackerExtension';
export {
  TableNodeExtension,
  TableRowExtension,
  TableCellExtension,
  TableHeaderExtension,
} from './nodes/TableExtension';
export type { TableContextInfo } from './nodes/TableExtension';
