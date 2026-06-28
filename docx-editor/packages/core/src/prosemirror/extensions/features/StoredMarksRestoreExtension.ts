/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * StoredMarksRestore — re-hydrates `state.storedMarks` from a paragraph's
 * `defaultTextFormatting` attr whenever the cursor sits in an empty
 * paragraph and PM has cleared storedMarks.
 *
 * Why this exists: `defaultTextFormatting` is the OOXML-style "what
 * formatting does an empty paragraph remember" attr, mirrored from
 * storedMarks at the moment the user toggled bold / italic / a font on
 * an empty paragraph (see markUtils.ts:saveStoredMarksToParagraph).
 * ProseMirror clears storedMarks aggressively — every transform step
 * does it, including the deletion that's produced when the user
 * select-alls + Backspaces a paragraph back to empty. Once storedMarks
 * is null, the next typed character draws its marks from `$from.marks()`
 * which is empty in an empty paragraph, so the inherited bold / italic
 * is silently dropped.
 *
 * The fix mirrors the priority encoded in `effectiveCursorMarks`:
 * storedMarks → $from.marks() → marks-from-defaultTextFormatting. We
 * run as an `appendTransaction`, detect the (empty paragraph + dtf +
 * null storedMarks) state, and append a transaction that calls
 * `setStoredMarks` from the dtf-derived marks. The resulting state
 * has storedMarks populated, so the next text-input transaction
 * inserts characters carrying those marks.
 *
 * No infinite loop: after we append the setStoredMarks transaction,
 * newState.storedMarks is non-null and the early-return guard fires
 * on the next pass.
 */

import { Plugin, PluginKey } from 'prosemirror-state';
import { createExtension } from '../create';
import type { ExtensionRuntime } from '../types';
import { textFormattingToMarks } from '../marks/markUtils';
import type { TextFormatting } from '../../../types/document';

export const storedMarksRestoreKey = new PluginKey('storedMarksRestore');

function createStoredMarksRestorePlugin(): Plugin {
  return new Plugin({
    key: storedMarksRestoreKey,
    appendTransaction(_transactions, _oldState, newState) {
      // Fire on EVERY transaction that lands in an empty paragraph
      // with defaultTextFormatting + null storedMarks. The loop guard
      // below (storedMarks already populated → return null) prevents
      // infinite recursion: after we set storedMarks, the next
      // round-trip's first check exits early.
      //
      // We don't gate on `transactions.some(t => t.docChanged)`
      // because PM clears storedMarks on selection-changing
      // transactions too, not just doc-changing ones. Linux CI
      // surfaced this — after select-all + Backspace, a follow-up
      // selection-only tx (focus / browser sync) cleared the
      // storedMarks our plugin set on the delete tx, and the
      // subsequent typeText lost the bold/italic mark.
      if (newState.storedMarks && newState.storedMarks.length > 0) return null;

      const { selection, schema } = newState;
      if (!selection.empty) return null;

      const $from = selection.$from;
      const parent = $from.parent;
      if (parent.type.name !== 'paragraph') return null;
      if (parent.textContent.length > 0) return null;

      const dtf = parent.attrs.defaultTextFormatting as TextFormatting | null | undefined;
      if (!dtf) return null;

      const marks = textFormattingToMarks(dtf, schema);
      if (marks.length === 0) return null;

      const tr = newState.tr.setStoredMarks(marks);
      tr.setMeta(storedMarksRestoreKey, 'restored');
      tr.setMeta('addToHistory', false);
      return tr;
    },
  });
}

export const StoredMarksRestoreExtension = createExtension({
  name: 'storedMarksRestore',
  onSchemaReady(): ExtensionRuntime {
    return {
      plugins: [createStoredMarksRestorePlugin()],
    };
  },
});
