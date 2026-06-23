import type * as Y from 'yjs';

/**
 * Seed a shared `Y.Text` with the opened file's content — but only if it's
 * still empty. The first peer to open a fresh room fills it; later joiners
 * find it already populated by sync and skip seeding, so the document is
 * never duplicated. Pure of React/CodeMirror so it can be unit-tested with
 * two synced Y.Docs.
 */
export function seedYText(ytext: Y.Text, initial: string): void {
  if (ytext.length === 0 && initial.length > 0) {
    ytext.insert(0, initial);
  }
}
