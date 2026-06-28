/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Per-source local preferences — the small slice of FileSource state
 * that's intentionally client-only: recent-files list, last-opened id.
 *
 * Why client-only:
 *   - Personal mode tracks "what did I last edit?" without a round
 *     trip; the server already knows what files exist (GET /files),
 *     it shouldn't also need to track UI focus state.
 *   - The recent list is allowed to skew across devices — a doc
 *     opened on the work laptop shouldn't necessarily show on the
 *     home laptop's recent strip.
 *
 * IndexedDB store: the editor's existing 'casual-docs' DB has an
 * autosave + recent-files + versions store. We add nothing new — both
 * preferences live in localStorage instead, because:
 *   - lastOpened is a single string scoped by source kind + user id
 *   - the recent list for FileSource is a derived view of the
 *     server-side list, not a separate persistent store
 *
 * This keeps the IDB schema fixed at v3 (see utils/idb.ts) and avoids
 * a migration just to hold a tiny string.
 */

import type { FileEntry } from './types';

/**
 * Storage key prefix. The full key is `${PREFIX}.${scope}.${field}` so
 * multiple FileSource instances (eg. a future test runner) don't
 * collide.
 */
const PREFIX = 'casual.file-source';

function storage(): Storage | null {
  // Use globalThis so SSR / test runtimes that provide localStorage
  // without window (Bun's testing harness for one) work without a
  // jsdom shim. In real browsers `window === globalThis`, so the
  // production behavior is unchanged.
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    // Embedded contexts (sandboxed iframes, SSR) can throw on access.
    return null;
  }
}

/**
 * In-memory observer hub. We can't rely on IDB change events for
 * cross-tab fanout here, but a single-tab subscription model is what
 * the editor needs — watchRecent just wants to know when *this tab's*
 * personal source learned the file list changed.
 */
type Listener = (recent: FileEntry[]) => void;

export class RecentObserver {
  private listeners = new Set<Listener>();
  private latest: FileEntry[] = [];

  watch(cb: Listener): () => void {
    this.listeners.add(cb);
    // Fire once on subscribe so the consumer doesn't have to
    // double-fetch — the latest cached list is what they want.
    cb(this.latest);
    return () => {
      this.listeners.delete(cb);
    };
  }

  set(entries: FileEntry[]): void {
    this.latest = entries;
    for (const cb of this.listeners) {
      cb(entries);
    }
  }

  snapshot(): FileEntry[] {
    return this.latest;
  }
}

/** Read the last-opened doc id for the given scope. */
export function readLastOpened(scope: string): string | null {
  const s = storage();
  if (!s) return null;
  return s.getItem(`${PREFIX}.${scope}.lastOpened`);
}

/** Write the last-opened doc id (or clear with null). */
export function writeLastOpened(scope: string, id: string | null): void {
  const s = storage();
  if (!s) return;
  const key = `${PREFIX}.${scope}.lastOpened`;
  if (id === null) {
    s.removeItem(key);
  } else {
    s.setItem(key, id);
  }
}
