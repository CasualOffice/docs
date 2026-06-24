/**
 * Collab transport for comment threads. Comment highlight marks ride
 * ySyncPlugin (they're in the PM doc), but the thread content — author, text,
 * replies, resolved state — lives in React state and would NOT reach peers.
 * This bridges DocxEditor's controlled `comments` + `onCommentsChange` API to a
 * shared `comments` Y.Map keyed by comment id.
 *
 * Model: one Y.Map entry per Comment (replies are separate Comments with
 * `parentId`). Concurrency:
 *   - two peers adding different comments → different keys → merge cleanly.
 *   - two peers editing the SAME comment → last-write-wins on that key.
 * That's the right granularity for v1 (each thread/reply is independent).
 */
import type * as Y from 'yjs';
import type { Comment } from '@eigenpal/docx-core/types/content';

/** Rebuild the Comment[] from the shared map, ordered by id (creation order). */
export function commentsFromMap(map: Y.Map<unknown>): Comment[] {
  const out: Comment[] = [];
  map.forEach((value) => {
    if (value && typeof value === 'object') out.push(value as Comment);
  });
  out.sort((a, b) => a.id - b.id);
  return out;
}

/**
 * Reconcile the full Comment[] into the shared map in one transaction: upsert
 * every current comment by id, delete entries that no longer exist. Skips the
 * write entirely when nothing changed so we don't echo our own observer.
 */
export function writeCommentsToMap(map: Y.Map<unknown>, comments: Comment[]): void {
  const doc = map.doc;
  const apply = () => {
    const nextIds = new Set(comments.map((c) => String(c.id)));
    // Delete removed.
    for (const key of Array.from(map.keys())) {
      if (!nextIds.has(key)) map.delete(key);
    }
    // Upsert changed (cheap deep-equal via JSON to avoid redundant churn).
    for (const c of comments) {
      const key = String(c.id);
      const existing = map.get(key);
      if (!existing || JSON.stringify(existing) !== JSON.stringify(c)) {
        map.set(key, c);
      }
    }
  };
  if (doc) doc.transact(apply);
  else apply();
}

/** Observe remote+local map changes; fire `cb` with the rebuilt Comment[]. */
export function observeComments(
  map: Y.Map<unknown>,
  cb: (comments: Comment[]) => void
): () => void {
  const handler = () => cb(commentsFromMap(map));
  map.observe(handler);
  return () => map.unobserve(handler);
}
