/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Tab-local autosave for the docx editor. Single slot per origin — we
 * keep the most recent dirty snapshot so the user can recover from a
 * crash or accidental close. Anything more elaborate (versioned
 * history, cross-tab merge) is out of scope until we have a backend.
 *
 * IndexedDB is used over localStorage because docx buffers regularly
 * exceed the 5 MB localStorage budget; IDB stores the ArrayBuffer
 * directly via structured clone, no JSON round-trip required.
 *
 * Mirrors the sibling Casual Sheets autosave store
 * (`services/sheet/apps/web/src/autosave/store.ts`) — same single-slot
 * design, same DB / store / key convention. Pulled into its own DB
 * (`casual-docs`) so we don't have to lockstep version numbers with
 * the sheet repo.
 */

import { openDocsDb, STORE_AUTOSAVE as STORE } from './idb';

const KEY = 'current';

export interface AutosaveRecord {
  /** Document name at the time of save — used in the restore prompt. */
  name: string;
  /** The full `.docx` buffer the editor can `loadBuffer` straight from. */
  buffer: ArrayBuffer;
  /** Wall-clock ms at save time — for the restore prompt copy. */
  savedAt: number;
}

const openDb = openDocsDb;

export async function readAutosave(): Promise<AutosaveRecord | null> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') return null;
  try {
    const db = await openDb();
    return await new Promise<AutosaveRecord | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as AutosaveRecord | undefined) ?? null);
      req.onerror = () => reject(req.error ?? new Error('read failed'));
    });
  } catch (err) {
    // Private-mode browsers + Safari ITP can throw on open. Restoring
    // gracefully fails to "no record" so the editor still mounts.
    if (typeof console !== 'undefined') {
      console.warn('[autosave] read failed; skipping restore', err);
    }
    return null;
  }
}

export async function writeAutosave(rec: AutosaveRecord): Promise<void> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(rec, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('write failed'));
    });
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.warn('[autosave] write failed', err);
    }
  }
}

export async function clearAutosave(): Promise<void> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('clear failed'));
    });
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.warn('[autosave] clear failed', err);
    }
  }
}

/** "moments ago" / "12 min ago" / "3 hr ago" / "2 days ago". */
export function formatAgo(ms: number): string {
  if (ms < 60_000) return 'moments ago';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
