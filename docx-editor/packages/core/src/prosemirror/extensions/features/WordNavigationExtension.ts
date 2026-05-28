/**
 * Word Navigation Extension
 *
 * ProseMirror-native word-wise cursor motion, bound to the platform's
 * word-jump shortcut: Alt+Arrow on macOS, Ctrl+Arrow elsewhere (matching
 * the OS convention and Google Docs / Word). Shift variants extend the
 * selection.
 *
 * Why this exists: the editor advertises "move by word" in the keyboard-
 * shortcuts dialog, but the older `window.getSelection()`-based helper in
 * `utils/keyboardNavigation.ts` was never wired into the keymap and is the
 * wrong layer for the hidden-ProseMirror model — it drives the DOM
 * selection rather than PM state. This command operates on PM state.
 *
 * Offsets are computed against the textblock's `textContent`, so paragraphs
 * mixing text with inline atoms (tabs, breaks) can be off by the atom count;
 * plain-text paragraphs — the overwhelmingly common case — are exact.
 */

import { TextSelection, Selection } from 'prosemirror-state';
import type { Command } from 'prosemirror-state';
import { createExtension } from '../create';
import { Priority } from '../types';
import type { ExtensionRuntime } from '../types';
import { findNextWordStart, findPreviousWordStart } from '../../../utils/keyboardNavigation';

const isMac = typeof navigator !== 'undefined' && /Mac|iP(hone|[oa]d)/.test(navigator.platform);

function moveByWord(dir: 'left' | 'right', extend: boolean): Command {
  return (state, dispatch) => {
    const { selection } = state;
    const $head = selection.$head;
    const parent = $head.parent;
    if (!parent.isTextblock) return false;

    const text = parent.textContent;
    const offset = $head.parentOffset;
    const newOffset =
      dir === 'left' ? findPreviousWordStart(text, offset) : findNextWordStart(text, offset);

    let target: number;
    if (newOffset !== offset) {
      target = $head.start() + newOffset;
    } else {
      // Already at the block edge — step to the nearest caret position in
      // the adjacent block (matches "Ctrl+Left at line start jumps to the
      // end of the previous line").
      const bias = dir === 'left' ? -1 : 1;
      const from = state.doc.resolve(
        Math.min(Math.max($head.pos + bias, 0), state.doc.content.size)
      );
      const near = Selection.findFrom(from, bias, true);
      if (!near || near.$head.pos === $head.pos) return false;
      target = near.$head.pos;
    }

    if (dispatch) {
      const sel = extend
        ? TextSelection.create(state.doc, selection.anchor, target)
        : TextSelection.create(state.doc, target);
      dispatch(state.tr.setSelection(sel).scrollIntoView());
    }
    return true;
  };
}

export const WordNavigationExtension = createExtension({
  name: 'wordNavigation',
  priority: Priority.High,
  onSchemaReady(): ExtensionRuntime {
    const mod = isMac ? 'Alt' : 'Ctrl';
    return {
      keyboardShortcuts: {
        [`${mod}-ArrowLeft`]: moveByWord('left', false),
        [`${mod}-ArrowRight`]: moveByWord('right', false),
        [`Shift-${mod}-ArrowLeft`]: moveByWord('left', true),
        [`Shift-${mod}-ArrowRight`]: moveByWord('right', true),
      },
    };
  },
});
