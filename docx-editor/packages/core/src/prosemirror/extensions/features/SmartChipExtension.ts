/**
 * Smart-chip trigger — Google-Docs-style `@` menu in the body.
 *
 * Typing `@` at a word boundary opens a chip menu; this extension only owns the
 * *detection* (which `@query` is active and where it sits). The React layer
 * reads the plugin state (`smartChipKey`) to render a caret-anchored menu, and
 * calls `insertSmartChip(...)` to replace the `@query` with the chosen chip.
 *
 * For now the only chip is `@date`, which inserts a DATE field (so it
 * round-trips natively). `@person` etc. can reuse the same trigger later.
 */
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import type { EditorState, Transaction } from 'prosemirror-state';
import { createExtension } from '../create';
import type { ExtensionRuntime } from '../types';

export interface SmartChipTrigger {
  /** Document position of the `@`. */
  from: number;
  /** Cursor position (end of the `@query` run). */
  to: number;
  /** Characters typed after the `@` (lowercased), used to filter the menu. */
  query: string;
}

export const smartChipKey = new PluginKey<SmartChipTrigger | null>('smartChip');

// Match an active `@query` immediately before the (collapsed) cursor. The
// `(?:^|\s)` guard means `user@host` does NOT trigger — the `@` there is
// preceded by a letter, not whitespace/line-start.
const TRIGGER_RE = /(?:^|\s)@([\w-]*)$/;

function computeTrigger(state: EditorState): SmartChipTrigger | null {
  const sel = state.selection;
  if (!sel.empty) return null;
  const $from = sel.$from;
  if (!$from.parent.isTextblock) return null;
  // Text from the start of the textblock up to the cursor. Atoms collapse to a
  // sentinel so an inline node before the `@` still counts as a boundary.
  const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼');
  const m = TRIGGER_RE.exec(before);
  if (!m) return null;
  const query = m[1];
  // `@` offset within the parent = cursor offset − query length − 1.
  const atOffset = $from.parentOffset - query.length - 1;
  const from = $from.start() + atOffset;
  return { from, to: sel.from, query: query.toLowerCase() };
}

/**
 * Replace the active `@query` trigger with a DATE field. Returns false when no
 * trigger is active (so callers can no-op safely).
 */
export function insertSmartChipDate(
  state: EditorState,
  dispatch?: (tr: Transaction) => void
): boolean {
  const trigger = smartChipKey.getState(state);
  if (!trigger) return false;
  const fieldType = state.schema.nodes.field;
  if (!fieldType) return false;
  if (dispatch) {
    const node = fieldType.create({
      fieldType: 'DATE',
      instruction: ' DATE ',
      displayText: '',
      fieldKind: 'complex',
      fldLock: false,
      dirty: true,
    });
    const tr = state.tr.replaceRangeWith(trigger.from, trigger.to, node);
    const after = tr.mapping.map(trigger.to);
    tr.setSelection(TextSelection.create(tr.doc, after));
    dispatch(tr.scrollIntoView());
  }
  return true;
}

export const SmartChipExtension = createExtension({
  name: 'smartChip',
  onSchemaReady(): ExtensionRuntime {
    return {
      plugins: [
        new Plugin<SmartChipTrigger | null>({
          key: smartChipKey,
          state: {
            init: () => null,
            apply: (_tr, _value, _oldState, newState) => computeTrigger(newState),
          },
        }),
      ],
    };
  },
});
