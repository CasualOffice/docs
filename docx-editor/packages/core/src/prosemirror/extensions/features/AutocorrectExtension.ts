/**
 * Autocorrect Extension
 *
 * Two classes of substitution, both via `handleTextInput`:
 *
 * 1. Symbol sequences — fire on the character that *completes* the
 *    sequence, mirroring Word's AutoFormat:
 *      (c)  → ©    (r) → ®    (tm) → ™
 *      -->  → →    <-- → ←    ->  → →    <- → ←
 *
 * 2. Common-typo dictionary — fires on a word-boundary character
 *    (space / tab). When the user finishes a word, the just-typed
 *    word is looked up in COMMON_TYPOS and replaced if found,
 *    preserving the boundary character the user typed.
 *
 * Each replacement is a single transaction so one Ctrl+Z reverts to
 * exactly what the user typed — matching every other autocorrect
 * engine + our SmartQuotesExtension.
 *
 * Disabled via StarterKit:
 *   createStarterKit({ disable: ['autocorrect'] })
 *
 * The typo dictionary is intentionally small (highest-value common
 * misspellings only) — a full spell-correct engine is out of scope
 * (that's D3/D4 in the parity pipeline). Case is preserved for the
 * leading letter so "Teh" → "The".
 */

import { Plugin } from 'prosemirror-state';
import { createExtension } from '../create';
import { Priority } from '../types';
import type { ExtensionRuntime } from '../types';
import { editorPreferences } from './editorPreferences';

/** Symbol sequences keyed by the full literal the user types. */
const SYMBOLS: Record<string, string> = {
  '(c)': '©',
  '(C)': '©',
  '(r)': '®',
  '(R)': '®',
  '(tm)': '™',
  '(TM)': '™',
  '-->': '→',
  '<--': '←',
  '->': '→',
  '<-': '←',
};

// Longest symbol literal we look back for (e.g. "(tm)" = 4).
const MAX_SYMBOL_LEN = 4;

/** Common typos → corrections. Lowercase keys; case of the first
 *  letter is restored from what the user typed. */
const COMMON_TYPOS: Record<string, string> = {
  teh: 'the',
  adn: 'and',
  recieve: 'receive',
  seperate: 'separate',
  definately: 'definitely',
  occured: 'occurred',
  untill: 'until',
  wich: 'which',
  thier: 'their',
  alot: 'a lot',
  becuase: 'because',
  accross: 'across',
  beleive: 'believe',
  calender: 'calendar',
  cemetary: 'cemetery',
  concious: 'conscious',
  embarass: 'embarrass',
  enviroment: 'environment',
  existance: 'existence',
  goverment: 'government',
  occassion: 'occasion',
  publically: 'publicly',
  tommorow: 'tomorrow',
  truely: 'truly',
  wierd: 'weird',
};

/** Restore the leading-letter case of `correction` from `typed`. */
function matchLeadingCase(typed: string, correction: string): string {
  if (typed.length === 0) return correction;
  const lead = typed.charAt(0);
  if (lead === lead.toUpperCase() && lead !== lead.toLowerCase()) {
    return correction.charAt(0).toUpperCase() + correction.slice(1);
  }
  return correction;
}

export const AutocorrectExtension = createExtension({
  name: 'autocorrect',
  priority: Priority.High,
  onSchemaReady(): ExtensionRuntime {
    return {
      plugins: [
        new Plugin({
          props: {
            handleTextInput(view, from, to, text) {
              // Honor the runtime toggle from Tools → Preferences.
              if (!editorPreferences.autocorrect) return false;
              if (text.length !== 1) return false;
              const { state } = view;

              // --- Symbol sequences ---------------------------------
              // Look back up to MAX_SYMBOL_LEN-1 chars + the typed
              // char; check the longest matching literal first.
              const lookbackStart = Math.max(0, from - (MAX_SYMBOL_LEN - 1));
              const before = state.doc.textBetween(lookbackStart, from, '￿', '￿');
              for (let len = MAX_SYMBOL_LEN; len >= 2; len--) {
                if (before.length + 1 < len) continue;
                const candidate = before.slice(before.length - (len - 1)) + text;
                const replacement = SYMBOLS[candidate];
                if (replacement) {
                  const replaceFrom = from - (len - 1);
                  view.dispatch(state.tr.insertText(replacement, replaceFrom, to));
                  return true;
                }
              }

              // --- Common-typo dictionary ---------------------------
              // Trigger only on a word-boundary char (space / tab).
              // The typed boundary char is preserved after the
              // correction.
              if (text === ' ' || text === '\t') {
                // Walk back over word characters to find the word
                // just completed.
                let i = from;
                // textBetween with a block separator avoids crossing
                // node boundaries silently.
                while (i > 0) {
                  const ch = state.doc.textBetween(i - 1, i, '￿', '￿');
                  if (!/[A-Za-z']/.test(ch)) break;
                  i--;
                }
                if (i < from) {
                  const word = state.doc.textBetween(i, from, '￿', '￿');
                  const correction = COMMON_TYPOS[word.toLowerCase()];
                  if (correction) {
                    const cased = matchLeadingCase(word, correction);
                    // Replace the word, then append the boundary char
                    // the user typed so the cursor lands past it.
                    view.dispatch(state.tr.insertText(cased + text, i, to));
                    return true;
                  }
                }
              }

              return false;
            },
          },
        }),
      ],
    };
  },
});
