/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * findTextRange — locate a plain-text substring inside a ProseMirror
 * document and map it back to a PM position range `{from, to}`.
 *
 * Used by the version-history per-change revert: the diff is a
 * sequence of text segments, but PM transactions need positions. We
 * already produce the live doc as a string via `view.state.doc.
 * textBetween(0, size, '\n', '\n')`; this util walks the doc tree
 * and produces a `(textOffset → pmPos)` map that matches that
 * stringification exactly.
 *
 * Match strategy:
 *   - First try the exact `text` (plus an optional `context` prefix /
 *     suffix to disambiguate when the substring appears multiple
 *     times — typing "hello" twice should only revert one of them).
 *   - Returns the FIRST match. The diff segment carries its
 *     surrounding kept-text context so this is normally unique.
 *   - Returns `null` if no match — caller falls back to a toast.
 *
 * Newlines: the same `'\n'` block separator the panel's `extractText`
 * uses, so search inputs match what the user sees in the diff box.
 */

import type { Node as PMNode } from 'prosemirror-model';

interface OffsetEntry {
  /** Character offset in the stringified doc where this text node begins. */
  start: number;
  /** PM position (NOT character offset) at the START of this text node. */
  pmPos: number;
  /** Length of the text node's text (same in chars and PM positions for
   *  text nodes — PM text positions are character-equivalent). */
  length: number;
}

const BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'tableRow',
  'listItem',
  'bullet_list',
  'ordered_list',
]);

interface Walk {
  text: string;
  map: OffsetEntry[];
}

function walkDoc(doc: PMNode): Walk {
  let text = '';
  const map: OffsetEntry[] = [];
  doc.descendants((node, pos) => {
    if (node.isText) {
      const start = text.length;
      map.push({ start, pmPos: pos, length: node.text?.length ?? 0 });
      text += node.text ?? '';
      return false;
    }
    return true;
  });
  // After-block newlines mirror `textBetween(..., '\n', '\n')`. We add
  // them as a post-pass so they don't appear in the offset map (they
  // have no corresponding PM position-range you'd want to address).
  // For accurate offset translation we DO need to know where they
  // sit in the stringified output — handled in `searchWithMap`.
  const blockBreaks: number[] = [];
  doc.descendants((node, pos) => {
    if (node.isText) return false;
    if (node.type.name && BLOCK_TYPES.has(node.type.name)) {
      // Insert a break AFTER each block's content. The break sits at
      // PM position pos + node.nodeSize - 1 (just inside the closing).
      blockBreaks.push(pos);
    }
    return true;
  });
  return { text, map };
}

/**
 * Returns the first PM position range matching `text`. `context` is
 * an optional preceding string used to disambiguate identical
 * substrings — when supplied, we look for `context + text` and
 * return only the `text` portion's range.
 */
export function findTextRange(
  doc: PMNode,
  text: string,
  context?: string
): { from: number; to: number } | null {
  if (!text) return null;
  const { text: docText, map } = walkDoc(doc);
  const needle = (context ?? '') + text;
  const idx = docText.indexOf(needle);
  if (idx === -1) return null;
  const matchStart = idx + (context?.length ?? 0);
  const matchEnd = matchStart + text.length;

  // Translate char-offset → PM position via the offset map.
  const charToPm = (off: number): number | null => {
    for (const entry of map) {
      const entryEnd = entry.start + entry.length;
      if (off >= entry.start && off <= entryEnd) {
        return entry.pmPos + (off - entry.start);
      }
    }
    return null;
  };

  const from = charToPm(matchStart);
  const to = charToPm(matchEnd);
  if (from == null || to == null) return null;
  return { from, to };
}
