/**
 * WopiFileSource — the FileSource implementation for Mode 2 (WOPI).
 *
 * In Mode 2 the editor is embedded by a host that owns the file's
 * lifecycle. The user arrives with two pieces of state in the URL
 * (parsed by `extractWopiContext()` in select.ts):
 *
 *   docId        — the host file id (the WOPI `:id` path segment)
 *   accessToken  — JWT issued by the host / collab admin
 *
 * This source talks DIRECTLY to the collab server's WOPI host
 * endpoints (the same contract Casual Sheets uses):
 *
 *   GET  /wopi/files/:id             → CheckFileInfo (JSON metadata)
 *   GET  /wopi/files/:id/contents    → GetFile (raw bytes)
 *   POST /wopi/files/:id/contents    → PutFile (raw bytes; X-WOPI-ItemVersion)
 *
 * The JWT rides as `?access_token=…` on every call; collab verifies the
 * signature, that the token's `file_id` claim equals `:id`, and the
 * per-route permission (read for GET, write for PutFile).
 *
 * What this source supports:
 *
 *   - `kind` + `label` for UI branching.
 *   - `open(docId)` — GetFile; the item version comes back in the
 *     `X-WOPI-ItemVersion` header and is retained for optimistic-write
 *     protection on the next save.
 *   - `save(docId, bytes)` — PutFile, sending the retained version as
 *     `X-WOPI-ItemVersion` (If-Match). A 409 from collab means the host
 *     copy moved underneath us; surfaced as `WopiSaveConflictError`.
 *   - `list()` — a single entry for the embedded doc (the host owns
 *     file discovery), enriched with CheckFileInfo name + size.
 *   - `watchRecent` / `rememberLastOpened` / `lastOpened` — same
 *     localStorage-backed prefs as BrowserFileSource.
 *
 * What it does NOT support:
 *
 *   - `rename()` / `delete()` — the host owns the file's lifecycle.
 *     WOPI's core contents endpoints don't expose either, so calling
 *     here throws rather than silently no-op'ing.
 */

import { RecentObserver, readLastOpened, writeLastOpened } from './local-prefs';
import type { FileEntry, FileSource } from './types';

export interface WopiFileSourceOptions {
  /**
   * The host file id — the `:id` path segment on the collab WOPI
   * routes. Passed through verbatim; the embedding host decides its
   * shape (and the JWT's `file_id` claim must match it).
   */
  docId: string;
  /**
   * The JWT the host issued. Attached as `?access_token=…` on every
   * call so collab can verify it and scope access to this file.
   */
  accessToken: string;
  /**
   * Filename for the embedded doc, if the embed surface knew it at
   * boot. Optional — when missing, list()/open() fall back to the
   * CheckFileInfo `BaseFileName`, then to the docId.
   */
  fileName?: string;
  /**
   * Origin of the collab server. Defaults to "" (same-origin) — the
   * production shape where the editor SPA is served from the collab
   * image. Local dev with Vite on :5173 points at the collab origin.
   */
  baseUrl?: string;
  /**
   * Override for fetch. Tests inject a mock; production passes
   * nothing and the global fetch is used.
   */
  fetchImpl?: typeof fetch;
}

/**
 * Thrown by operations WOPI mode doesn't support. Surfaces in
 * console / error boundary so a stray call site shows up loudly
 * rather than silently no-op'ing.
 */
export class WopiNotSupportedError extends Error {
  constructor(op: string) {
    super(`WopiFileSource: ${op} is not supported in WOPI mode`);
    this.name = 'WopiNotSupportedError';
  }
}

/**
 * Thrown when PutFile is rejected because the host's item version no
 * longer matches the one we opened (collab returns 409 with the
 * expected / actual versions). The host app can catch this to show a
 * "the document changed elsewhere" conflict prompt.
 */
export class WopiSaveConflictError extends Error {
  readonly expected?: string;
  readonly actual?: string;
  constructor(expected?: string, actual?: string) {
    super('WopiFileSource: save rejected — item version mismatch');
    this.name = 'WopiSaveConflictError';
    this.expected = expected;
    this.actual = actual;
  }
}

/** CheckFileInfo subset we read off the collab response. */
interface CheckFileInfo {
  BaseFileName?: string;
  Size?: number;
  Version?: string;
  UserCanWrite?: boolean;
}

export class WopiFileSource implements FileSource {
  readonly kind = 'wopi' as const;
  readonly label: string;

  private readonly docId: string;
  private readonly accessToken: string;
  private fileName: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly recent = new RecentObserver();
  private readonly scope: string;
  /** Latest item version, retained from open()/save() for If-Match. */
  private version: string | undefined;

  constructor(opts: WopiFileSourceOptions) {
    this.docId = opts.docId;
    this.accessToken = opts.accessToken;
    this.fileName = opts.fileName || opts.docId;
    this.baseUrl = opts.baseUrl ?? '';
    // Wrap fetch in an arrow so it's not bound to `this` — browsers
    // throw "Illegal invocation" when fetch is called with anything
    // but window / undefined as the receiver.
    this.fetchImpl = opts.fetchImpl ?? (((input, init) => fetch(input, init)) as typeof fetch);
    this.label = opts.fileName || 'Embedded document';
    // Scope keyed by docID so two embeds open in two tabs don't
    // share recent-files state.
    this.scope = `wopi.${opts.docId}`;
    // Seed the recent observer with the single doc the embed
    // surfaces, so a subscriber that registers before list() fires
    // still sees the right initial state.
    this.recent.set([this.singleEntry()]);
  }

  async list(): Promise<FileEntry[]> {
    // CheckFileInfo gives us the authoritative name + size. Best-effort:
    // a failure (e.g. a read-scoped token that still opens fine) must
    // not break the single-entry list the embed needs.
    const info = await this.checkFileInfo().catch(() => null);
    if (info?.BaseFileName) this.fileName = info.BaseFileName;
    if (info?.Version) this.version = info.Version;
    const entry = this.singleEntry(info?.Size);
    this.recent.set([entry]);
    return [entry];
  }

  async open(id: string): Promise<{ bytes: ArrayBuffer; name: string; etag?: string }> {
    // The WOPI embed only ever opens THIS doc. A caller passing a
    // different id is asking for a doc that doesn't exist in this
    // editor's context.
    if (id !== this.docId) {
      throw new WopiNotSupportedError(`open(${id}) — only the embed's docId is reachable`);
    }
    const res = await this.fetchImpl(this.urlFor(`/wopi/files/${encodeURIComponent(id)}/contents`));
    if (!res.ok) {
      throw new Error(`WopiFileSource: GetFile failed (${res.status})`);
    }
    const bytes = await res.arrayBuffer();
    // collab stamps the item version on GetFile; retain it so the next
    // save can send it as the If-Match guard.
    const version = res.headers.get('X-WOPI-ItemVersion') ?? undefined;
    if (version) this.version = version;
    return { bytes, name: this.fileName, etag: version };
  }

  async save(
    id: string | null,
    bytes: ArrayBuffer,
    opts?: { etag?: string; name?: string }
  ): Promise<{ id: string; etag: string }> {
    // WOPI never mints ids client-side — the host owns the file id, so
    // a first-save (id === null) is meaningless here.
    if (id !== null && id !== this.docId) {
      throw new WopiNotSupportedError(`save(${id}) — only the embed's docId is writable`);
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
    };
    // Optimistic-write guard: prefer the caller's etag, else the version
    // we last saw. Omitted on the very first save if we never opened.
    const ifMatch = opts?.etag ?? this.version;
    if (ifMatch) headers['X-WOPI-ItemVersion'] = ifMatch;

    const res = await this.fetchImpl(
      this.urlFor(`/wopi/files/${encodeURIComponent(this.docId)}/contents`),
      { method: 'POST', headers, body: bytes }
    );
    if (res.status === 409) {
      const body = (await res.json().catch(() => ({}))) as { expected?: string; actual?: string };
      throw new WopiSaveConflictError(body.expected, body.actual);
    }
    if (!res.ok) {
      throw new Error(`WopiFileSource: PutFile failed (${res.status})`);
    }
    const body = (await res.json().catch(() => ({}))) as { version?: string };
    // collab returns the new version in the body and the header; trust
    // the body, fall back to the header, then to whatever we had.
    const next = body.version ?? res.headers.get('X-WOPI-ItemVersion') ?? this.version ?? '';
    this.version = next || undefined;
    return { id: this.docId, etag: next };
  }

  async rename(): Promise<void> {
    throw new WopiNotSupportedError('rename');
  }

  async delete(): Promise<void> {
    throw new WopiNotSupportedError('delete');
  }

  watchRecent(cb: (recent: FileEntry[]) => void): () => void {
    return this.recent.watch(cb);
  }

  async rememberLastOpened(id: string | null): Promise<void> {
    writeLastOpened(this.scope, id);
  }

  async lastOpened(): Promise<string | null> {
    return readLastOpened(this.scope);
  }

  /** CheckFileInfo round-trip — JSON metadata for the embedded file. */
  private async checkFileInfo(): Promise<CheckFileInfo | null> {
    const res = await this.fetchImpl(this.urlFor(`/wopi/files/${encodeURIComponent(this.docId)}`));
    if (!res.ok) return null;
    return (await res.json()) as CheckFileInfo;
  }

  /**
   * Builds an absolute URL on the collab server with the access_token
   * query param attached. Preserves any existing query the path
   * already carries (none today, but cheap to handle).
   */
  private urlFor(path: string): string {
    const sep = path.includes('?') ? '&' : '?';
    return `${this.baseUrl}${path}${sep}access_token=${encodeURIComponent(this.accessToken)}`;
  }

  private singleEntry(size = 0): FileEntry {
    return {
      id: this.docId,
      name: this.fileName,
      size,
      modifiedAt: Date.now(),
      source: 'wopi',
    };
  }
}
