/**
 * Smart Quotes / Typography Extension
 *
 * Replaces plain ASCII punctuation with typographic equivalents as
 * the user types — what Word and Google Docs both do silently:
 *
 *   "  → " (U+201C) opening or " (U+201D) closing
 *   '  → ' (U+2018) opening or ' (U+2019) closing
 *   -- → — (U+2014, em dash)
 *   ...→ … (U+2026, horizontal ellipsis)
 *
 * The opening-vs-closing decision for quotes looks at the character
 * immediately before the cursor: whitespace, line start, or another
 * opening quote → opening; anything else → closing. Matches Word's
 * AutoFormat heuristic.
 *
 * Undo: each replacement is dispatched as a single transaction so
 * one Ctrl+Z reverts the substitution back to the typed ASCII
 * character, matching every other autocorrect engine.
 *
 * Disabled via StarterKit's `disable` option:
 *   createStarterKit({ disable: ['smartQuotes'] })
 */

import { Plugin } from 'prosemirror-state';
import { createExtension } from '../create';
import { Priority } from '../types';
import type { ExtensionRuntime } from '../types';
import { editorPreferences } from './editorPreferences';

const OPEN_DOUBLE = '“';
const CLOSE_DOUBLE = '”';
const OPEN_SINGLE = '‘';
const CLOSE_SINGLE = '’';
const EM_DASH = '—';
const ELLIPSIS = '…';

/**
 * Decide whether a quote at `pos` should be opening or closing
 * based on the immediately-preceding character.
 *
 * Opening: at the start of a textblock, or preceded by whitespace,
 * or preceded by an opening bracket/parenthesis/another opening
 * quote. Closing: everything else (i.e., right after a word
 * character, punctuation, etc.).
 */
function isOpeningContext(prevChar: string | null): boolean {
  if (prevChar === null || prevChar === '') return true; // start of block / no preceding char
  if (/[\s ]/.test(prevChar)) return true;
  if (/[([{‘“]/.test(prevChar)) return true; // brackets + smart-open quotes
  return false;
}

export const SmartQuotesExtension = createExtension({
  name: 'smartQuotes',
  // Run before BaseKeymap so the keystroke replacement happens
  // before any default text-insertion handlers.
  priority: Priority.High,
  onSchemaReady(): ExtensionRuntime {
    return {
      plugins: [
        new Plugin({
          props: {
            // handleTextInput fires for typed characters (not paste,
            // not IME composition — those go through other paths).
            // Return true to consume the original input; false to
            // let PM insert the typed character as-is.
            handleTextInput(view, from, to, text) {
              // Honor the runtime toggle from Tools → Preferences.
              if (!editorPreferences.smartQuotes) return false;
              // Only handle single-character inserts. Anything longer
              // is almost certainly an IME or paste-via-input which
              // we don't want to second-guess.
              if (text.length !== 1) return false;

              const { state } = view;
              // Read the character immediately before the insertion
              // point — needed for the opening/closing quote heuristic
              // AND for the two-character sequences (-- → —, ... → …).
              const prevChar = from > 0 ? state.doc.textBetween(from - 1, from, ' ', ' ') : null;
              const prevTwoChars =
                from > 1 ? state.doc.textBetween(from - 2, from, ' ', ' ') : null;

              // Quotes
              if (text === '"') {
                const replacement = isOpeningContext(prevChar) ? OPEN_DOUBLE : CLOSE_DOUBLE;
                view.dispatch(state.tr.insertText(replacement, from, to));
                return true;
              }
              if (text === "'") {
                // Apostrophe-in-word case: "don't", "it's" — preceded
                // by a letter, so closing-quote heuristic correctly
                // produces ' (which is what we want for apostrophes).
                const replacement = isOpeningContext(prevChar) ? OPEN_SINGLE : CLOSE_SINGLE;
                view.dispatch(state.tr.insertText(replacement, from, to));
                return true;
              }

              // -- → em dash. The user typed the second `-` after an
              // existing `-`. Replace both with the em dash.
              if (text === '-' && prevChar === '-') {
                view.dispatch(state.tr.insertText(EM_DASH, from - 1, to));
                return true;
              }

              // ... → ellipsis. User typed the third `.` after two
              // existing `.`s.
              if (text === '.' && prevTwoChars === '..') {
                view.dispatch(state.tr.insertText(ELLIPSIS, from - 2, to));
                return true;
              }

              return false;
            },
          },
        }),
      ],
    };
  },
});
