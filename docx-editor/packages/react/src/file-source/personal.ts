/**
 * PersonalFileSource — the FileSource implementation for Mode 3
 * (Standalone). Talks to the Casual gateway over cookie-authenticated
 * REST.
 *
 * Wire shape — keep these in sync with the route handlers in
 * backend/internal/auth/personal/routes.go:
 *
 *   GET    /auth/me                  → UserWire | 401
 *   GET    /files                    → FileSummaryWire[]
 *   POST   /files                    → FileSummaryWire (201)
 *   GET    /files/{docId}            → .docx bytes + ETag header
 *   PUT    /files/{docId}/contents   → FileSummaryWire
 *   PATCH  /files/{docId}            → { fileName }
 *   DELETE /files/{docId}            → 204
 *
 * The session cookie is set by /auth/signup or /auth/login and is
 * sent automatically via `credentials: 'include'`. The PersonalAuthGate
 * (Batch 3 — app side) is responsible for showing a login modal when
 * /auth/me returns 401; this class is constructed only after that
 * gate resolves.
 */

import { RecentObserver, readLastOpened, writeLastOpened } from './local-prefs';
import type { FileEntry, FileSource } from './types';
import type { ErrorWire, FileSummaryWire, UserWire } from './wire';

export interface PersonalFileSourceOptions {
  /**
   * Origin of the gateway. Defaults to "" (same-origin) which is the
   * production deploy shape — editor SPA + gateway served from one
   * Docker image. Local-dev with Vite on :5173 should set this to
   * `http://localhost:8080`.
   */
  baseUrl?: string;
  /**
   * The authenticated user. Used only to build the local-prefs scope
   * key so two users on the same browser don't share recent-files
   * state. The personal source does not re-issue /auth/me on every
   * call — that's the gate's job.
   */
  user: Pick<UserWire, 'userId' | 'displayName'>;
  /**
   * Override for fetch. Tests inject a mock here; production passes
   * nothing and the global fetch is used.
   */
  fetchImpl?: typeof fetch;
}

/**
 * Error raised when a server response isn't 2xx. Carries the parsed
 * { code, message } envelope when the body matched the gateway's
 * errorResp shape, otherwise a synthesized one.
 */
export class PersonalFileSourceError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'PersonalFileSourceError';
    this.status = status;
    this.code = code;
  }
}

export class PersonalFileSource implements FileSource {
  readonly kind = 'personal' as const;
  readonly label: string;

  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly scope: string;
  private readonly recent = new RecentObserver();

  constructor(opts: PersonalFileSourceOptions) {
    this.baseUrl = opts.baseUrl ?? '';
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.label = opts.user.displayName || 'My files';
    // Scoped per (kind, userId) so the recent-files cache survives
    // user-switching on the same browser without leaking.
    this.scope = `personal.${opts.user.userId}`;
  }

  async list(): Promise<FileEntry[]> {
    const res = await this.req('/files');
    const summaries = (await res.json()) as FileSummaryWire[];
    const entries = summaries.map(summaryToEntry);
    this.recent.set(entries);
    return entries;
  }

  async open(id: string): Promise<{ bytes: ArrayBuffer; name: string; etag?: string }> {
    const res = await this.req(`/files/${encodeURIComponent(id)}`);
    const bytes = await res.arrayBuffer();
    const etag = res.headers.get('ETag') ?? undefined;
    // The server's Content-Disposition carries the canonical name.
    // We could parse it, but the recent list already has the name —
    // and read order across implementations is "client knows the
    // name before opening". Falling back to id keeps this robust if
    // open() is called without list() first.
    const name = parseFilenameFromContentDisposition(res.headers.get('Content-Disposition')) ?? id;
    return { bytes, name, etag };
  }

  async save(
    id: string | null,
    bytes: ArrayBuffer,
    opts?: { etag?: string; name?: string }
  ): Promise<{ id: string; etag: string }> {
    // First save mints a docId via POST /files; subsequent saves
    // overwrite via PUT /files/{id}/contents. The HTTP method choice
    // is the differentiator — the body shape (raw bytes +
    // X-File-Name) is identical so the multipart code path can be
    // shared in a future revision.
    const url = id === null ? '/files' : `/files/${encodeURIComponent(id)}/contents`;
    const method = id === null ? 'POST' : 'PUT';
    const headers: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
    };
    if (opts?.name) {
      headers['X-File-Name'] = encodeRfc2047(opts.name);
    }
    const res = await this.req(url, { method, headers, body: bytes });
    const summary = (await res.json()) as FileSummaryWire;
    // Refresh the recent observer optimistically — callers can rely
    // on watchRecent firing without an explicit list().
    this.bumpRecent(summary);
    return { id: summary.docId, etag: String(summary.version) };
  }

  async rename(id: string, newName: string): Promise<void> {
    const res = await this.req(`/files/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: newName }),
    });
    // Drain the body so the connection can be reused (Bun's fetch
    // doesn't strictly require this, but it's polite).
    await res.json().catch(() => undefined);
    // Mirror the rename into the recent observer.
    const next = this.recent.snapshot().map((e) => (e.id === id ? { ...e, name: newName } : e));
    this.recent.set(next);
  }

  async delete(id: string): Promise<void> {
    await this.req(`/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const next = this.recent.snapshot().filter((e) => e.id !== id);
    this.recent.set(next);
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

  // ---------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------

  private async req(path: string, init?: RequestInit): Promise<Response> {
    const res = await this.fetchImpl(this.baseUrl + path, {
      ...init,
      credentials: 'include',
    });
    if (!res.ok) {
      // Try to parse the gateway's { code, message } envelope. If the
      // body isn't JSON (e.g. an upstream proxy returned a plain HTML
      // 502), fall back to a synthesized error.
      let code = 'http_' + res.status;
      let message = res.statusText;
      try {
        const body = (await res.clone().json()) as ErrorWire;
        if (body?.code) code = body.code;
        if (body?.message) message = body.message;
      } catch {
        // Non-JSON error body — keep the synthesized envelope.
      }
      throw new PersonalFileSourceError(res.status, code, message);
    }
    return res;
  }

  private bumpRecent(summary: FileSummaryWire): void {
    const entry = summaryToEntry(summary);
    const without = this.recent.snapshot().filter((e) => e.id !== entry.id);
    this.recent.set([entry, ...without]);
  }
}

function summaryToEntry(s: FileSummaryWire): FileEntry {
  return {
    id: s.docId,
    name: s.fileName,
    size: s.size,
    modifiedAt: Date.parse(s.savedAt) || 0,
    source: 'personal',
    meta: { version: s.version },
  };
}

/**
 * RFC 2047 encoder for the X-File-Name header. The gateway reads this
 * verbatim into Content-Disposition; non-ASCII names need encoding so
 * a HTTP/1.1 proxy doesn't mangle them.
 */
function encodeRfc2047(name: string): string {
  // Fast path: pure ASCII names go through as-is.
  if (/^[\x20-\x7e]+$/.test(name)) return name;
  const encoded = btoa(unescape(encodeURIComponent(name)));
  return `=?UTF-8?B?${encoded}?=`;
}

/**
 * Pulls the filename out of a Content-Disposition header. Handles the
 * RFC 5987 `filename*=UTF-8''…` form the gateway emits.
 */
function parseFilenameFromContentDisposition(cd: string | null): string | null {
  if (!cd) return null;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  if (star) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      return null;
    }
  }
  const plain = /filename="([^"]+)"/i.exec(cd);
  return plain ? plain[1] : null;
}
