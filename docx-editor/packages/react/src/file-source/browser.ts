/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * BrowserFileSource — the FileSource implementation for Mode 1
 * (Pages). Wraps the existing IDB-backed recent-files store so the
 * landing screen + File menu have a uniform contract regardless of
 * deploy mode.
 *
 * Scope of this implementation is intentionally narrow — Mode 1 is
 * the "single-device hosted demo" deploy and doesn't try to be a
 * real file system. The File System Access integration listed in
 * docs/internal/11-storage-modes.md is Phase A and lands separately;
 * this class is the no-FSA baseline.
 */

import {
  deleteRecentFile,
  listRecentFiles,
  recordRecentFile,
  type RecentFile,
} from '../utils/recent-files';

import { RecentObserver, readLastOpened, writeLastOpened } from './local-prefs';
import type { FileEntry, FileSource } from './types';

const SCOPE = 'browser';

export class BrowserFileSource implements FileSource {
  readonly kind = 'browser' as const;
  readonly label = 'This browser';

  private readonly recent = new RecentObserver();

  async list(): Promise<FileEntry[]> {
    const rows = await listRecentFiles();
    const entries = rows.map(toEntry);
    this.recent.set(entries);
    return entries;
  }

  async open(id: string): Promise<{ bytes: ArrayBuffer; name: string; etag?: string }> {
    const rows = await listRecentFiles();
    const row = rows.find((r) => idFor(r) === id);
    if (!row) {
      throw new Error(`BrowserFileSource: unknown id ${id}`);
    }
    return { bytes: row.buffer, name: row.name };
  }

  async save(
    id: string | null,
    bytes: ArrayBuffer,
    opts?: { name?: string }
  ): Promise<{ id: string; etag: string }> {
    // Mode 1 doesn't have a server-side notion of doc identity; the
    // recent-files store keys by name. Reuse the supplied name (for
    // overwrite-by-name) or fall back to a synthetic one.
    const name = opts?.name ?? id ?? `Untitled-${Date.now()}.docx`;
    await recordRecentFile({
      name,
      buffer: bytes,
      size: bytes.byteLength,
      openedAt: Date.now(),
    });
    // Refresh the observer + re-derive id from the row we just wrote.
    const rows = await listRecentFiles();
    const row = rows.find((r) => r.name === name);
    const newId = row ? idFor(row) : name;
    this.recent.set(rows.map(toEntry));
    return { id: newId, etag: String(row?.openedAt ?? Date.now()) };
  }

  async rename(): Promise<void> {
    // The IDB store keys by name; renaming in place would change the
    // identity, which the recent-files surface doesn't model. Mode 1
    // gets a save-as path instead. Throw so a caller that wandered
    // here from a Mode 3 codepath sees the bug rather than silently
    // no-op'ing.
    throw new Error('BrowserFileSource: rename is not supported (Mode 1 uses save-as)');
  }

  async delete(id: string): Promise<void> {
    const numeric = Number(id);
    if (!Number.isFinite(numeric)) return;
    await deleteRecentFile(numeric);
    const rows = await listRecentFiles();
    this.recent.set(rows.map(toEntry));
  }

  watchRecent(cb: (recent: FileEntry[]) => void): () => void {
    return this.recent.watch(cb);
  }

  async rememberLastOpened(id: string | null): Promise<void> {
    writeLastOpened(SCOPE, id);
  }

  async lastOpened(): Promise<string | null> {
    return readLastOpened(SCOPE);
  }
}

function idFor(row: RecentFile): string {
  // Use the IDB auto-increment id when present, falling back to the
  // name. The fallback only matters for in-flight rows before the
  // tx commits.
  return row.id != null ? String(row.id) : row.name;
}

function toEntry(row: RecentFile): FileEntry {
  return {
    id: idFor(row),
    name: row.name,
    size: row.size,
    modifiedAt: row.openedAt,
    source: 'browser',
  };
}
