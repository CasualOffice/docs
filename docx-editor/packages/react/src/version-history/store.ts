/**
 * IDB-backed version-history snapshot store. Separate object store
 * from the single-slot autosave (`utils/idb.ts` STORE_AUTOSAVE) — the
 * two solve different problems:
 *
 *   - **Autosave**: one slot, overwritten on every change. "I crashed
 *     mid-edit — recover the doc." Lifetime: until explicit save / discard.
 *   - **Version history**: many slots, captured at coarse-grained
 *     moments (every ~10 min while dirty, or on explicit "Save version").
 *     "I want to roll back to how it looked an hour ago." Lifetime:
 *     kept until pruned or hand-deleted.
 *
 * The fine-grained live edit feed (`useEditHistory`) is a third layer
 * and stays in-memory — it would balloon IDB with full-doc JSON per
 * coalesced edit, which isn't what users actually want for "roll back
 * a version" anyway.
 *
 * Retention rules (mirrors sheets):
 *   - Manual snapshots are NEVER auto-pruned — the user asked for them.
 *   - Auto snapshots are kept by count: `AUTO_RETENTION_PER_DOC` newest
 *     auto entries per `docId` survive each write.
 *
 * Storage cost: each snapshot is a full ProseMirror doc JSON. A typical
 * 5-page doc is ~30-80 KB; a 100-page report a few MB. With 30 auto +
 * N manual snapshots per doc, a power user crosses tens of MB of IDB
 * use. Future: lz-string compression on write would cut that ~4×.
 *
 * Ported from sheets' `apps/web/src/version-history/store.ts` —
 * adapted to scope by `docId` (sheets is single-active-workbook;
 * the editor switches docs without unmount).
 */

import { openDocsDb, STORE_VERSIONS } from '../utils/idb';
import type { LiveVersionFeed } from './live-feed';

const AUTO_RETENTION_PER_DOC = 30;

export type VersionKind = 'auto' | 'manual';

export interface VersionSnapshot {
  /** IDB auto-increment key, assigned on first persist. Optional for
   *  the in-memory `VersionDraft` shape the capture hook hands in. */
  id?: number;
  /** Document the snapshot belongs to. Lets multiple docs share the
   *  single object store without their histories bleeding together. */
  docId: string;
  kind: VersionKind;
  /** User-supplied label for manual versions; derived (e.g. "Untitled
   *  — auto") for auto versions — kept on the record so list rendering
   *  doesn't have to branch. */
  name: string;
  /** Wall-clock ms at capture. Used for time grouping in the panel. */
  savedAt: number;
  /** Source format at capture, for round-trip on later "Save as" from
   *  a preview. Currently always `'docx'`; here as a forward hook. */
  sourceFormat: string | null;
  /** Full ProseMirror doc JSON — `view.state.doc.toJSON()` output. */
  data: unknown;
  /** Approximate JSON byte size, set on persist for UI display. */
  size?: number;
}

export type VersionDraft = Omit<VersionSnapshot, 'id'>;

/**
 * Persist a draft snapshot. Returns the assigned id. Triggers a prune
 * pass that drops the oldest `auto` entries for `draft.docId` past
 * `AUTO_RETENTION_PER_DOC`.
 */
export async function writeVersion(draft: VersionDraft): Promise<number> {
  const db = await openDocsDb();
  const size = estimateSize(draft.data);
  const record: VersionDraft = { ...draft, size };
  const id = await new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORE_VERSIONS, 'readwrite');
    const req = tx.objectStore(STORE_VERSIONS).add(record);
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error ?? new Error('write failed'));
  });
  // Fire-and-forget retention sweep; failures are non-fatal — old
  // entries are cosmetic clutter, not correctness.
  void pruneAutoFor(draft.docId).catch((err) =>
    console.warn('[version-history] prune failed', err)
  );
  notifyFeed();
  return id;
}

export async function listVersions(docId: string): Promise<VersionSnapshot[]> {
  try {
    const db = await openDocsDb();
    return await new Promise<VersionSnapshot[]>((resolve, reject) => {
      const tx = db.transaction(STORE_VERSIONS, 'readonly');
      const idx = tx.objectStore(STORE_VERSIONS).index('docId');
      const req = idx.getAll(IDBKeyRange.only(docId));
      req.onsuccess = () => {
        const list = (req.result ?? []) as VersionSnapshot[];
        list.sort((a, b) => b.savedAt - a.savedAt);
        resolve(list);
      };
      req.onerror = () => reject(req.error ?? new Error('list failed'));
    });
  } catch (err) {
    console.warn('[version-history] list failed', err);
    return [];
  }
}

export async function readVersion(id: number): Promise<VersionSnapshot | null> {
  try {
    const db = await openDocsDb();
    return await new Promise<VersionSnapshot | null>((resolve, reject) => {
      const tx = db.transaction(STORE_VERSIONS, 'readonly');
      const req = tx.objectStore(STORE_VERSIONS).get(id);
      req.onsuccess = () => resolve((req.result as VersionSnapshot | undefined) ?? null);
      req.onerror = () => reject(req.error ?? new Error('read failed'));
    });
  } catch (err) {
    console.warn('[version-history] read failed', err);
    return null;
  }
}

export async function renameVersion(id: number, name: string): Promise<void> {
  const db = await openDocsDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_VERSIONS, 'readwrite');
    const os = tx.objectStore(STORE_VERSIONS);
    const get = os.get(id);
    get.onsuccess = () => {
      const existing = get.result as VersionSnapshot | undefined;
      if (!existing) {
        resolve();
        return;
      }
      os.put({ ...existing, name });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('rename failed'));
  });
  notifyFeed();
}

export async function deleteVersion(id: number): Promise<void> {
  const db = await openDocsDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_VERSIONS, 'readwrite');
    tx.objectStore(STORE_VERSIONS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('delete failed'));
  });
  notifyFeed();
}

/** Drop every snapshot for `docId`. Used by the panel's "Clear
 *  version history" action (yet-to-be-added) + tests. */
export async function clearVersionsFor(docId: string): Promise<void> {
  const db = await openDocsDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_VERSIONS, 'readwrite');
    const idx = tx.objectStore(STORE_VERSIONS).index('docId');
    const req = idx.openCursor(IDBKeyRange.only(docId));
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      cursor.delete();
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('clear failed'));
  });
  notifyFeed();
}

async function pruneAutoFor(docId: string): Promise<void> {
  const db = await openDocsDb();
  // Walk auto entries for this doc, sorted by savedAt descending. Keep
  // the first AUTO_RETENTION_PER_DOC; delete the rest.
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_VERSIONS, 'readwrite');
    const os = tx.objectStore(STORE_VERSIONS);
    const idx = os.index('savedAt');
    // No compound (kind, docId) index — we filter post-cursor. Volumes
    // here are tens of snapshots per doc; a full-index walk is fine.
    const req = idx.openCursor(null, 'prev');
    let kept = 0;
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        resolve();
        return;
      }
      const snap = cursor.value as VersionSnapshot;
      if (snap.docId === docId && snap.kind === 'auto') {
        kept += 1;
        if (kept > AUTO_RETENTION_PER_DOC) {
          os.delete(cursor.primaryKey);
        }
      }
      cursor.continue();
    };
    req.onerror = () => reject(req.error ?? new Error('prune failed'));
    tx.oncomplete = () => resolve();
  });
}

/** Crude byte-size estimate — JSON-stringify length in chars, treated
 *  as a near-1:1 byte proxy. Fine for the UI's "≈ 120 KB" hint. */
function estimateSize(data: unknown): number {
  try {
    return JSON.stringify(data).length;
  } catch {
    return 0;
  }
}

let feed: LiveVersionFeed | null = null;
export function setLiveFeed(f: LiveVersionFeed | null) {
  feed = f;
}
function notifyFeed() {
  feed?.tick();
}
