/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * IndexedDB-backed "recent files" list. Captures the user's last N
 * opened documents so the Home screen can let them reopen with one
 * click. Distinct from autosave (single-slot crash recovery) and
 * version history (per-doc timeline) — this is "what docs have I been
 * working with lately, across sessions".
 *
 * Retention: capped at MAX_ENTRIES, oldest evicted first. Entries
 * older than STALE_AFTER_MS are silently dropped on list.
 *
 * Mirrors `services/sheet/apps/web/src/recent-files/store.ts` — same
 * keyspace, same auto-increment + indexed model, same prune-on-record
 * design.
 */

import { openDocsDb, STORE_RECENT_FILES as STORE } from './idb';

const MAX_ENTRIES = 10;
const STALE_AFTER_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

export interface RecentFile {
  /** IDB auto-increment key. Optional at insert time. */
  id?: number;
  name: string;
  /** The full `.docx` buffer — clicking the card replays this through `loadBuffer`. */
  buffer: ArrayBuffer;
  /** Byte size for the human-readable hint on the card. */
  size: number;
  /** ms-since-epoch at last open. Determines sort + freshness. */
  openedAt: number;
}

function isAvailable(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

/**
 * Record (or refresh) a doc in the recent-files list. If an entry with
 * the same name already exists, it's updated in place (same id, new
 * openedAt + buffer); otherwise a new entry is appended. Triggers a
 * prune pass to enforce the cap.
 */
export async function recordRecentFile(rec: Omit<RecentFile, 'id'>): Promise<void> {
  if (!isAvailable()) return;
  try {
    const db = await openDocsDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const os = tx.objectStore(STORE);
      const idx = os.index('name');
      const getReq = idx.get(rec.name);
      getReq.onsuccess = () => {
        const existing = getReq.result as RecentFile | undefined;
        if (existing && existing.id != null) {
          os.put({ ...existing, ...rec, id: existing.id });
        } else {
          os.add({ ...rec });
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('record failed'));
    });
    void prune().catch(() => {
      // Best-effort — losing the prune pass doesn't break recording.
    });
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.warn('[recent-files] record failed', err);
    }
  }
}

export async function listRecentFiles(): Promise<RecentFile[]> {
  if (!isAvailable()) return [];
  try {
    const db = await openDocsDb();
    const all = await new Promise<RecentFile[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result ?? []) as RecentFile[]);
      req.onerror = () => reject(req.error ?? new Error('list failed'));
    });
    const cutoff = Date.now() - STALE_AFTER_MS;
    return all.filter((r) => r.openedAt >= cutoff).sort((a, b) => b.openedAt - a.openedAt);
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.warn('[recent-files] list failed', err);
    }
    return [];
  }
}

export async function deleteRecentFile(id: number): Promise<void> {
  if (!isAvailable()) return;
  try {
    const db = await openDocsDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('delete failed'));
    });
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.warn('[recent-files] delete failed', err);
    }
  }
}

async function prune(): Promise<void> {
  const db = await openDocsDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const os = tx.objectStore(STORE);
    const idx = os.index('openedAt');
    const req = idx.openCursor(null, 'prev');
    let kept = 0;
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      kept += 1;
      if (
        kept > MAX_ENTRIES ||
        (cursor.value as RecentFile).openedAt < Date.now() - STALE_AFTER_MS
      ) {
        os.delete(cursor.primaryKey);
      }
      cursor.continue();
    };
    req.onerror = () => reject(req.error ?? new Error('prune failed'));
    tx.oncomplete = () => resolve();
  });
}

/** Human-readable size — "23 KB", "1.4 MB". */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
