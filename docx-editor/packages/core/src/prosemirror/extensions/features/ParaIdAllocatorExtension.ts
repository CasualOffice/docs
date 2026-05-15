/**
 * ParaIdAllocator — assigns a stable `w14:paraId` to every paragraph.
 *
 * Why: the agent toolkit anchors comments, tracked changes, and
 * formatting by `paraId`. A paragraph with `paraId: null` is invisible
 * to the agent; a duplicated paraId (the second half of an Enter-split
 * or a paste) silently desyncs the agent's anchors.
 */

import { Plugin, PluginKey } from 'prosemirror-state';
import { createExtension } from '../create';
import type { ExtensionRuntime } from '../types';
import { generateHexId } from '../../../utils/hexId';

export const paraIdAllocatorKey = new PluginKey('paraIdAllocator');

function createParaIdAllocatorPlugin(): Plugin {
  return new Plugin({
    key: paraIdAllocatorKey,
    appendTransaction(transactions, _oldState, newState) {
      // Skip selection-only / mark-only transactions — they can't have
      // created or duplicated a paragraph.
      if (!transactions.some((t) => t.docChanged)) return null;

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
