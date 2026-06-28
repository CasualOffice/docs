/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * List numbering commands — restart, continue.
 *
 * The renderer (`layout-bridge/toFlowBlocks.ts`) honors a paragraph's
 * `listStartOverride` attr: when set on the first paragraph with a
 * given `numId:ilvl` pair, the counter resets to that value (the
 * `seenNumIds` guard means only the first hit drives the restart).
 *
 * Setting `listStartOverride: 1` is the editor's equivalent of Word's
 * right-click → "Restart numbering at 1" gesture.
 *
 * Save-roundtrip caveat: the serializer doesn't yet emit a fresh
 * `<w:num>` definition with a `<w:lvlOverride>` for paragraphs marked
 * with `listStartOverride`, so this is in-editor-only for now. Parsing
 * from input docs that already carry `<w:lvlOverride>` works. Wiring
 * the export side is followup work tracked under Phase 1.5 U8 in
 * `docs/internal/08-improvement-tracker.md`.
 */

import type { Command } from 'prosemirror-state';

/**
 * Restart the list numbering at the cursor's paragraph. Returns false
 * when the cursor isn't inside a list paragraph (no `numPr.numId`).
 *
 * The restart applies to the paragraph the cursor is in. Subsequent
 * list items at the same level continue from the restarted counter.
 */
export const restartListNumbering: Command = (state, dispatch) => {
  const { $from } = state.selection;
  const paragraph = $from.parent;
  if (paragraph.type.name !== 'paragraph') return false;

  const numPr = paragraph.attrs.numPr as { numId?: number; ilvl?: number } | null | undefined;
  if (!numPr || numPr.numId == null) return false;

  if (dispatch) {
    const pos = $from.before();
    const tr = state.tr.setNodeMarkup(pos, undefined, {
      ...paragraph.attrs,
      listStartOverride: 1,
    });
    dispatch(tr.scrollIntoView());
  }
  return true;
};

/**
 * Inverse — clears any `listStartOverride` on the cursor's paragraph
 * so it inherits the running counter from prior list items. No-op
 * when the paragraph has no override set.
 */
export const continueListNumbering: Command = (state, dispatch) => {
  const { $from } = state.selection;
  const paragraph = $from.parent;
  if (paragraph.type.name !== 'paragraph') return false;
  if (paragraph.attrs.listStartOverride == null) return false;

  if (dispatch) {
    const pos = $from.before();
    const tr = state.tr.setNodeMarkup(pos, undefined, {
      ...paragraph.attrs,
      listStartOverride: null,
    });
    dispatch(tr.scrollIntoView());
  }
  return true;
};
