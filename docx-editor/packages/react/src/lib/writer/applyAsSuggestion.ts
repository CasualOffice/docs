/**
 * applyAsSuggestion — turns an AI rewrite (or summary) into a tracked
 * change so the user reviews + accepts/rejects it via the existing
 * insertion / deletion mark UI instead of the model's output landing
 * in the doc unchallenged.
 *
 * Strategy:
 * - **Rewrite**: mark the original range with `deletion` (keeps the
 *   text in place, renders struck-through and red), then insert the
 *   model output AFTER the range with `insertion` marks on each text
 *   node (renders underlined and green). Both views live side-by-side
 *   until the user clicks Accept / Reject on the change.
 * - **Summarize**: there's no original to strike — we just insert
 *   `Summary: <…>` at the end of the selection with `insertion` marks.
 *
 * Works regardless of the editor's current mode. The user doesn't
 * have to flip the doc into Suggesting mode first; AI changes always
 * go through this safety net.
 */

import type { EditorView } from 'prosemirror-view';
import { Fragment, type Node as ProseMirrorNode } from 'prosemirror-model';

const REVISION_BASE = Date.now();
let nextRevisionId = REVISION_BASE;

function makeAttrs(author: string): {
  revisionId: number;
  author: string;
  date: string;
} {
  return {
    revisionId: nextRevisionId++,
    author,
    date: new Date().toISOString(),
  };
}

/**
 * Walk `fragment` and add `insertion` mark to every text leaf,
 * preserving existing marks. Block nodes (paragraphs / headings /
 * lists / tables) pass through via `node.copy(newContent)`.
 */
function stampWithInsertion(
  fragment: Fragment,
  insertionMark: ProseMirrorNode['marks'][number]
): Fragment {
  const children: ProseMirrorNode[] = [];
  for (let i = 0; i < fragment.childCount; i++) {
    const node = fragment.child(i);
    if (node.isText) {
      // PM marks dedupe by type — re-marking is idempotent.
      const marked = node.mark(node.marks.concat(insertionMark));
      children.push(marked);
    } else if (node.isLeaf) {
      children.push(node);
    } else {
      children.push(node.copy(stampWithInsertion(node.content, insertionMark)));
    }
  }
  return Fragment.fromArray(children);
}

export interface ApplyRewriteOpts {
  view: EditorView;
  from: number;
  to: number;
  /** Translated / rewritten content the AI produced. */
  replacement: Fragment;
  /** Author label that lands on the tracked-change marks. */
  author?: string;
}

/**
 * Replace selection-as-tracked-change. The original `from..to` range
 * is marked deletion in place; `replacement` is inserted with
 * insertion marks immediately after `to`. The two parts share a
 * revisionId so the existing tracked-change accept/reject UI groups
 * them as a single change.
 */
export function applyRewriteAsSuggestion(opts: ApplyRewriteOpts): void {
  const { view, from, to, replacement, author = 'AI' } = opts;
  if (from === to) return;
  const schema = view.state.schema;
  const insertionType = schema.marks.insertion;
  const deletionType = schema.marks.deletion;
  if (!insertionType || !deletionType) {
    // Editor was built without tracked-change marks (e.g. a test
    // schema). Fall back to the direct replace path so the call still
    // does something useful.
    const tr = view.state.tr.replaceWith(from, to, replacement);
    view.dispatch(tr);
    return;
  }

  const attrs = makeAttrs(author);
  const insertionMark = insertionType.create(attrs);
  const deletionMark = deletionType.create(attrs);
  const stamped = stampWithInsertion(replacement, insertionMark);

  // One transaction: insert AFTER the range first (positions shift to
  // the right of `to`), then mark the original range. Doing it in this
  // order means the deletion marks don't accidentally end up on the
  // inserted content.
  const tr = view.state.tr;
  tr.insert(to, stamped);
  tr.addMark(from, to, deletionMark);
  view.dispatch(tr);
}

export interface ApplyInsertOpts {
  view: EditorView;
  at: number;
  /** Plain text the AI produced (typical for summarize). */
  text: string;
  /** Author label that lands on the tracked-change marks. */
  author?: string;
}

/**
 * Pure insertion-as-tracked-change. Used by summarize — there's no
 * original to strike, just a "Summary: …" paragraph that should land
 * as a reviewable suggestion the user can accept or reject.
 */
export function applyInsertAsSuggestion(opts: ApplyInsertOpts): void {
  const { view, at, text, author = 'AI' } = opts;
  if (!text) return;
  const schema = view.state.schema;
  const insertionType = schema.marks.insertion;
  if (!insertionType) {
    const tr = view.state.tr.insertText(text, at);
    view.dispatch(tr);
    return;
  }
  const insertionMark = insertionType.create(makeAttrs(author));
  const node = schema.text(text, [insertionMark]);
  const tr = view.state.tr.insert(at, node);
  view.dispatch(tr);
}
