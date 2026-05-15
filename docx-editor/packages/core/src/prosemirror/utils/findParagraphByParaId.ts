import type { Node as PMNode } from 'prosemirror-model';

/**
 * ProseMirror position range for the paragraph (or any textblock) whose
 * `paraId` attribute equals `paraId`. Returns the inclusive `from` and
 * exclusive `to` positions, plus the node, so callers can both target
 * the paragraph (e.g. addMark over its text range) and inspect it.
 *
 * `from` is the position immediately before the textblock; `to` is
 * `from + node.nodeSize`. The text content lives at `[from + 1, to - 1]`.
 *
 * Returns null if no textblock with that paraId exists.
 */
export function findParagraphByParaId(
  doc: PMNode,
  paraId: string
): { node: PMNode; from: number; to: number } | null {
  if (!paraId || !paraId.trim()) return null;
  let result: { node: PMNode; from: number; to: number } | null = null;
  doc.descendants((node, pos) => {
    if (result !== null) return false;
    if (node.isTextblock && node.attrs?.paraId === paraId) {
      result = { node, from: pos, to: pos + node.nodeSize };
      return false;
    }
    return true;
  });
  return result;
}
