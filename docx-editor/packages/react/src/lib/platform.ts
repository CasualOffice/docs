/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Platform detection + shortcut formatting helpers.
 *
 * Centralised so menu hints, dialog hints, and keyboard handlers all
 * agree on what to show users. Previously `isMac()` lived inside
 * `KeyboardShortcutsDialog.tsx` and the Toolbar hard-coded ⌘ symbols
 * even on Windows.
 */

/** True when running on a Mac / iPad / iPhone / iPod. */
export function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
}

/**
 * Translate a portable shortcut string (e.g. `Ctrl+B`, `Ctrl+Shift+L`)
 * into platform-appropriate display form. On Mac, modifier names are
 * replaced with their key symbols (⌘ ⌥ ⇧). On Windows/Linux the input
 * is returned as-is.
 *
 * Use this anywhere a shortcut is shown to the user — menu hints,
 * tooltip suffixes, the keyboard-shortcuts dialog.
 */
export function formatShortcut(keys: string): string {
  if (!keys) return keys;
  if (isMac()) {
    return (
      keys
        .replace(/CmdOrCtrl\+/g, '⌘')
        .replace(/Ctrl\+/g, '⌘')
        .replace(/Alt\+/g, '⌥')
        .replace(/Shift\+/g, '⇧')
        // Special-key suffixes — only after a modifier (`⌘Enter` →
        // `⌘↵`), never standalone words inside a label.
        .replace(/(⌘|⌥|⇧)Enter\b/g, '$1↵')
        .replace(/(⌘|⌥|⇧)Space\b/g, '$1␣')
    );
  }
  // Windows / Linux: prefer the literal modifier name. Strip the
  // CmdOrCtrl marker some shortcuts use for cross-platform definitions.
  return keys.replace(/CmdOrCtrl\+/g, 'Ctrl+');
}
