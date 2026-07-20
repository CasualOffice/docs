/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { createContext, useContext } from 'react';

/**
 * DialogActions — the dialog/overlay OPEN handlers the editor chrome
 * (MenuBar, FormattingBar) invokes.
 *
 * Why a dedicated context: these ~18 handlers were previously passed as
 * individual props on the `<EditorToolbar>` call site in DocxEditor (the
 * god-component), inflating an already ~80-prop call. They don't vary per
 * sub-component and are only ever produced by DocxEditor, so a single
 * cohesive context both slims that call site and groups "opening a dialog"
 * into one typed surface.
 *
 * Deliberately NOT folded into `ToolbarProps` / `EditorToolbarContext`:
 * `ToolbarProps` (and the `Toolbar` / `FormattingBar` components) are part
 * of the published `@casualoffice/docs` API — removing the flat `onOpen*`
 * props from them would be a breaking change. This context is purely
 * internal wiring; the public prop contracts are untouched, and consumers
 * still honour an explicitly-passed `onOpen*` prop first (see FormattingBar).
 *
 * Each field is optional: a `null` provider (or a missing key) simply means
 * "that menu entry is absent", which the consumers already presence-gate on.
 */
export interface DialogActions {
  openBookmarks?: () => void;
  openCharacterSpacing?: () => void;
  openParagraphDialog?: () => void;
  openBordersShading?: () => void;
  openInsertSymbol?: () => void;
  openImageProperties?: () => void;
  openPageSetup?: () => void;
  openFileProperties?: () => void;
  openWordCount?: () => void;
  showAbout?: () => void;
  openCommandPalette?: () => void;
  openKeyboardShortcuts?: () => void;
  openPreferences?: () => void;
  openWatermark?: () => void;
  openAccessibility?: () => void;
  openBuildingBlocks?: () => void;
  openDictionary?: () => void;
  openCitations?: () => void;
}

const EMPTY: DialogActions = {};

export const DialogActionsContext = createContext<DialogActions | null>(null);

/**
 * Read the dialog-open handlers. Returns a stable empty object when no
 * provider is present, so callers can `dlg.openX?.()` without null checks.
 */
export function useDialogActions(): DialogActions {
  return useContext(DialogActionsContext) ?? EMPTY;
}
