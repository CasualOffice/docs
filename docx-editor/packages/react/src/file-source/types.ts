/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * FileSource — the storage abstraction that lets the editor shell,
 * recent-files list, File menu, autosave, and version-history all
 * speak to one interface regardless of deploy mode.
 *
 * One interface, three implementations:
 *
 *   - BrowserFileSource (Mode 1 — Pages): IDB + optional File System
 *     Access folder. Single-device, no server.
 *   - WopiFileSource    (Mode 2 — WOPI):  REST against a WOPI host
 *     identified by a JWT in the URL.
 *   - PersonalFileSource (Mode 3 — Standalone): cookie-authenticated
 *     REST against the Casual gateway's /files routes.
 *
 * The full design contract lives at docs/internal/11-storage-modes.md.
 * Keep this file in lockstep with the "Shared web-side abstraction"
 * section there — divergence between the doc and the type would cause
 * us to re-litigate the routes on every new implementation.
 */

/**
 * The three concrete sources. Used as a discriminator on FileEntry +
 * for `useFileSource()` consumers that branch on deploy mode (which
 * should be rare — the abstraction exists so most code can stay
 * mode-agnostic).
 */
export type FileSourceKind = 'browser' | 'wopi' | 'personal';

/**
 * One row in the recent-files list / File → Open dialog. The `meta`
 * field carries source-specific provenance (a File System Access
 * handle for Mode 1, an absolute path for Mode 3, etc.) without
 * leaking into the shared shape.
 */
export interface FileEntry {
  /** Stable per-source id — opaque to the editor. */
  id: string;
  name: string;
  /** Size in bytes. */
  size: number;
  /** Millis since epoch — used for sort + freshness. */
  modifiedAt: number;
  source: FileSourceKind;
  meta?: Record<string, unknown>;
}

/**
 * The shape every implementation must satisfy. Methods mirror the
 * minimum surface the editor's File menu + autosave + version-history
 * already consume; nothing more, nothing less. Adding a method here
 * forces a corresponding change in all three implementations, which
 * is the right friction point.
 */
export interface FileSource {
  /** Discriminator — used by select.ts and rare branches. */
  readonly kind: FileSourceKind;
  /** Shown in UI ("This browser", "My files", "Acme Drive"). */
  readonly label: string;

  /**
   * List the docs the user has access to. `opts.folderId` is reserved
   * for a future Mode-2/3 folder tree — implementations may ignore it.
   */
  list(opts?: { folderId?: string }): Promise<FileEntry[]>;

  /**
   * Fetch the raw .docx bytes for a single doc. `etag` is the
   * version-stamp the implementation may surface back to the caller
   * for optimistic-write protection.
   */
  open(id: string): Promise<{ bytes: ArrayBuffer; name: string; etag?: string }>;

  /**
   * Persist bytes. Pass `id: null` for a first-save (mints a new id);
   * pass an existing id to overwrite. `opts.etag` lets the
   * implementation reject a stale write with a conflict; `opts.name`
   * sets the title bar / Content-Disposition.
   */
  save(
    id: string | null,
    bytes: ArrayBuffer,
    opts?: { etag?: string; name?: string }
  ): Promise<{ id: string; etag: string }>;

  /** Update just the name without producing a new revision. */
  rename(id: string, newName: string): Promise<void>;

  /** Best-effort remove. Implementations should be idempotent. */
  delete(id: string): Promise<void>;

  /**
   * Subscribe to the recent-files list. The returned unsubscribe
   * function must be safe to call multiple times.
   */
  watchRecent(cb: (recent: FileEntry[]) => void): () => void;

  /**
   * Persist the id of the doc the user most recently had open, or
   * null to clear. Used by the Home screen "Reopen X?" banner.
   */
  rememberLastOpened(id: string | null): Promise<void>;

  /** The last value passed to rememberLastOpened, or null. */
  lastOpened(): Promise<string | null>;
}
