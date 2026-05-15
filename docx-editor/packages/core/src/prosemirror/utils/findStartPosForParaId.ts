import type { Node as PMNode } from 'prosemirror-model';

/**
 * ProseMirror position immediately before the first textblock whose `paraId`
 * attribute equals `paraId` (Word `w14:paraId` / OOXML paragraph id).
 *
 * Match is strict string equality on `node.attrs.paraId`.
 */
export function findStartPosForParaId(doc: PMNode, paraId: string): number | null {
  // Whitespace-only paraIds aren't valid Word w14:paraId values; bail early
  // so descendants() doesn't walk the entire document for nothing.
  if (!paraId || !paraId.trim()) return null;
  let found: number | null = null;
  doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.attrs?.paraId === paraId && node.isTextblock) {
      found = pos;
      return false;
    }
    return true;
  });
  return found;
}
