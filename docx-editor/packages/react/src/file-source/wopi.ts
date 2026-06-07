/**
 * WopiFileSource — the FileSource implementation for Mode 2 (WOPI).
 *
 * In Mode 2 the editor is embedded inside a host (SharePoint,
 * Nextcloud, custom storage) that owns the file's lifecycle. The
 * user arrives via the gateway's /wopi/host redirect with two pieces
 * of state in the URL:
 *
 *   docId        — base64url-encoded WOPI source URL
 *   accessToken  — JWT issued by the host
 *
 * Both are surfaced via `extractWopiContext()` in select.ts and
 * passed to the constructor.
 *
 * What this source DOES support:
 *
 *   - `kind` + `label` for UI branching
 *   - `open(docId)` — proxies through the gateway's
 *     /api/docs/{docId}/download endpoint with `?access_token=…`
 *     attached. The gateway's WOPI client makes the outbound call
 *     to the host.
 *   - `list()` — returns a single entry for the embedded doc; the
 *     host owns file discovery so there's nothing else to list.
 *   - `watchRecent` / `rememberLastOpened` / `lastOpened` — same
 *     localStorage-backed prefs as BrowserFileSource.
 *
 * What this source DOES NOT support:
 *
 *   - `save()` — WOPI snapshots happen server-side on room drain.
 *     The client doesn't initiate them; calling here throws so the
 *     editor doesn't paper over a wiring bug.
 *   - `rename()` / `delete()` — host owns lifecycle. WOPI 1.x has
 *     RenameFile semantics we don't expose yet; deletion is never
 *     a WOPI client operation.
 */

import { RecentObserver, readLastOpened, writeLastOpened } from './local-prefs';
import type { FileEntry, FileSource } from './types';

export interface WopiFileSourceOptions {
  /**
   * The opaque docID minted by the gateway's /wopi/host redirect.
   * Already base64url-encoded; we pass it through verbatim to the
   * /api/docs/{docId}/download endpoint without any further mangling.
   */
  docId: string;
  /**
   * The JWT the WOPI host issued. Attached as `?access_token=…` on
   * every outbound call so the gateway's WOPI client can pass it
   * to the host.
   */
  accessToken: string;
  /**
   * Filename for the embedded doc, if the embed surface knew it at
   * boot. Optional — when missing, list() returns the docID as the
   * name and the editor's title bar falls back to that. The host's
   * CheckFileInfo round-trip on the WS preflight is what actually
   * lands the real filename in the editor.
   */
  fileName?: string;
  /**
   * Origin of the gateway. Defaults to "" (same-origin) which is the
   * production deploy shape — the editor SPA is served from the
   * same Docker image as the gateway. Local-dev with Vite on :5173
   * points to http://localhost:8080.
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

export class WopiFileSource implements FileSource {
  readonly kind = 'wopi' as const;
  readonly label: string;

  private readonly docId: string;
  private readonly accessToken: string;
  private readonly fileName: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly recent = new RecentObserver();
  private readonly scope: string;

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
    const entry = this.singleEntry();
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
    const url = this.urlFor(`/api/docs/${encodeURIComponent(id)}/download`);
    const res = await this.fetchImpl(url);
    if (!res.ok) {
      throw new Error(`WopiFileSource: download failed (${res.status})`);
    }
    const bytes = await res.arrayBuffer();
    const etag = res.headers.get('ETag') ?? undefined;
    return { bytes, name: this.fileName, etag };
  }

  async save(): Promise<{ id: string; etag: string }> {
    // WOPI snapshots happen on room drain server-side. A client-
    // initiated save here would race the auto-snapshot and produce
    // the wrong wire shape. Throw so the call site is fixed rather
    // than silently no-op'd.
    throw new WopiNotSupportedError('save (use the implicit room-drain snapshot)');
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

  /**
   * Builds an absolute URL on the gateway with the access_token
   * query param attached. Preserves any existing query the path
   * already carries (none today, but cheap to handle).
   */
  private urlFor(path: string): string {
    const sep = path.includes('?') ? '&' : '?';
    return `${this.baseUrl}${path}${sep}access_token=${encodeURIComponent(this.accessToken)}`;
  }

  private singleEntry(): FileEntry {
    return {
      id: this.docId,
      name: this.fileName,
      size: 0,
      modifiedAt: Date.now(),
      source: 'wopi',
    };
  }
}
