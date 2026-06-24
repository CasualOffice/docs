/**
 * Field Commands — insert an inline OOXML field node (PAGE, NUMPAGES,
 * DATE, TIME, …) at the cursor. Round-trips through the existing
 * parser + serializer pair — see `__tests__/footer-field-roundtrip.test.ts`.
 *
 * The node schema lives in `FieldExtension.ts`. The renderer renders a
 * placeholder for dynamic fields (`{page}` / `{pages}`) until the
 * paged-editor resolves the actual value at paint time — that
 * resolution is already wired in `paged-editor` for PAGE / NUMPAGES.
 */

import type { Command } from 'prosemirror-state';
import { TextSelection } from 'prosemirror-state';

/**
 * Field instruction strings exactly as Word writes them. The leading +
 * trailing spaces are how Word emits `<w:instrText>` — match for clean
 * round-trip.
 */
const DEFAULT_INSTRUCTIONS: Record<string, string> = {
  PAGE: ' PAGE ',
  NUMPAGES: ' NUMPAGES ',
  DATE: ' DATE ',
  TIME: ' TIME ',
  CREATEDATE: ' CREATEDATE ',
  SAVEDATE: ' SAVEDATE ',
  AUTHOR: ' AUTHOR ',
  FILENAME: ' FILENAME ',
};

export type InsertableFieldType =
  | 'PAGE'
  | 'NUMPAGES'
  | 'DATE'
  | 'TIME'
  | 'CREATEDATE'
  | 'SAVEDATE'
  | 'AUTHOR'
  | 'FILENAME';

/**
 * Insert an inline `field` node of the given type at the cursor.
 * Returns false when the schema has no `field` node (e.g. on a
 * stripped-down sub-editor) or the selection isn't inside an inline
 * textblock.
 *
 * The inserted node carries:
 *   - `fieldType` — e.g. `'PAGE'` / `'NUMPAGES'`
 *   - `instruction` — the OOXML `w:instrText` string (with the leading
 *     + trailing spaces Word writes)
 *   - `fieldKind: 'complex'` — matches what the serializer emits for
 *     PAGE / NUMPAGES (the parser collapses both fldChar+instrText and
 *     fldSimple into ComplexField; the serializer writes the wider-
 *     supported complex-field tripod for both — see
 *     paragraphSerializer.ts).
 *   - `dirty: true` — signals downstream consumers (Word, our renderer)
 *     that the cached `displayText` may not match the current value
 *     and should be recomputed.
 */
export function insertField(
  fieldType: InsertableFieldType,
  instruction: string = DEFAULT_INSTRUCTIONS[fieldType] ?? ` ${fieldType} `
): Command {
  return (state, dispatch) => {
    const fieldNodeType = state.schema.nodes.field;
    if (!fieldNodeType) return false;

    const { $from } = state.selection;
    if (!$from.parent.isTextblock) return false;

    if (dispatch) {
      const node = fieldNodeType.create({
        fieldType,
        instruction,
        displayText: '',
        fieldKind: 'complex',
        fldLock: false,
        dirty: true,
      });
      const tr = state.tr.replaceSelectionWith(node, false);
      // Move the cursor after the inserted atom so the next keystroke
      // types inline-after instead of nudging the field around.
      const after = tr.selection.$to.pos;
      tr.setSelection(TextSelection.create(tr.doc, after));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}
