/**
 * ParaIdAllocator — assigns a stable `w14:paraId` to every paragraph.
 *
 * Why: the agent toolkit anchors comments, tracked changes, and
 * formatting by `paraId`. A paragraph with `paraId: null` is invisible
 * to the agent; a duplicated paraId (the second half of an Enter-split
 * or a paste) silently desyncs the agent's anchors.
 */

import { Plugin, PluginKey } from 'prosemirror-state';
import type { Transaction } from 'prosemirror-state';
import { createExtension } from '../create';
import type { ExtensionRuntime } from '../types';
import { generateHexId } from '../../../utils/hexId';

export const paraIdAllocatorKey = new PluginKey('paraIdAllocator');

/**
 * Could any of these transactions have ADDED or SPLIT a paragraph? Plain text
 * edits (typing, deleting within a paragraph) never can, so the O(paragraphs)
 * uniqueness scan can be skipped for them — it otherwise costs ~7ms PER
 * KEYSTROKE on a 2,500-paragraph document. A step adds/splits a paragraph only
 * when its replacement slice opens a block boundary (Enter split, backspace
 * merge) or carries block-level content (paste, programmatic insert, doc load).
 */
function mayAddOrSplitParagraph(transactions: readonly Transaction[]): boolean {
  for (const tr of transactions) {
    for (const step of tr.steps) {
      const slice = (step as { slice?: { openStart: number; openEnd: number; content: unknown } })
        .slice;
      if (!slice) continue; // mark / attr steps — no structural change
      if (slice.openStart > 0 || slice.openEnd > 0) return true;
      let hasBlock = false;
      (slice.content as { forEach: (cb: (n: { isBlock: boolean }) => void) => void }).forEach(
        (n) => {
          if (n.isBlock) hasBlock = true;
        }
      );
      if (hasBlock) return true;
    }
  }
  return false;
}

function createParaIdAllocatorPlugin(): Plugin {
  // Force one full scan up front (the initial document may carry paragraphs
  // that loaded without a paraId); after that, only re-scan on structural edits.
  let didInitialScan = false;
  return new Plugin({
    key: paraIdAllocatorKey,
    appendTransaction(transactions, _oldState, newState) {
      // Skip selection-only / mark-only transactions — they can't have
      // created or duplicated a paragraph.
      if (!transactions.some((t) => t.docChanged)) return null;

      // Fast path: typing within a paragraph can't create or duplicate one, so
      // skip the whole-document scan. The first doc-changing transaction always
      // scans (catches load-time gaps); structural edits always scan.
      if (didInitialScan && !mayAddOrSplitParagraph(transactions)) return null;
      didInitialScan = true;

      const seen = new Set<string>();
      const updates: { pos: number; attrs: Record<string, unknown> }[] = [];

      newState.doc.descendants((node, pos) => {
        // Non-paragraph: recurse — paragraphs nested in tables / cells
        // are still in scope.
        if (node.type.name !== 'paragraph') return;

        const id = node.attrs.paraId as string | null | undefined;
        if (!id || seen.has(id)) {
          let newId = generateHexId();
          while (seen.has(newId)) newId = generateHexId();
          seen.add(newId);
          updates.push({ pos, attrs: { ...node.attrs, paraId: newId } });
        } else {
          seen.add(id);
        }

        // Paragraphs only contain inline content (text / runs) — nothing
        // we'd ever paraId. Skip the subtree.
        return false;
      });

      if (updates.length === 0) return null;

      const tr = newState.tr;
      for (const u of updates) tr.setNodeMarkup(u.pos, undefined, u.attrs);
      tr.setMeta(paraIdAllocatorKey, 'allocated');
      tr.setMeta('addToHistory', false);
      // setNodeMarkup is a ReplaceStep that clears tr.storedMarks. We need
      // to preserve whatever the upstream transaction left in storedMarks
      // — e.g. font marks set by Enter on an empty paragraph — otherwise
      // typed text immediately after Enter falls back to the editor default.
      if (newState.storedMarks) {
        tr.setStoredMarks(newState.storedMarks);
      }
      return tr;
    },
  });
}

export const ParaIdAllocatorExtension = createExtension({
  name: 'paraIdAllocator',
  onSchemaReady(): ExtensionRuntime {
    return {
      plugins: [createParaIdAllocatorPlugin()],
    };
  },
});
