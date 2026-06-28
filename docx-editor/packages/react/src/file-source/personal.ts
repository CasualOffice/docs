/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * PersonalFileSource — the FileSource implementation for Mode 3
 * (Standalone). Talks to the collab server over cookie-authenticated
 * REST (CasualOffice/collab `files/personal-files-routes.ts`).
 *
 * Wire shape — keep these in sync with the collab route handlers:
 *
 *   GET    /files            → { files: FileSummaryWire[] }
 *   POST   /files            → { file } (201) — multipart (`file` part)
 *   GET    /files/{id}        → .docx bytes + `etag` header
 *   POST   /files/{id}        → { file } — raw bytes + `If-Match` header
 *   PATCH  /files/{id}        → 204 — body { name }
 *   DELETE /files/{id}        → 204
 *   GET    /auth/profile      → { user, profile }
 *   PATCH  /auth/profile      → { profile }
 *
 * The session cookie (`cs_session`) is set by /auth/signup or
 * /auth/login and rides along via `credentials: 'include'`. The
 * PersonalAuthGate shows a login modal when /auth/me returns 401; this
 * class is constructed only after that gate resolves.
 */

import { RecentObserver, readLastOpened, writeLastOpened } from './local-prefs';
import type { FileEntry, FileSource } from './types';
import type { ErrorWire, FileSummaryWire, ProfilePatchWire, ProfileWire, UserWire } from './wire';

const OCTET_STREAM = 'application/octet-stream';

export interface PersonalFileSourceOptions {
  /**
   * Origin of the collab server. Defaults to "" (same-origin) which is
   * the production deploy shape — editor SPA + collab served from one
   * image. Local dev with Vite on :5173 points at the collab origin.
   */
  baseUrl?: string;
  /**
   * The authenticated user. Used only to build the local-prefs scope
   * key so two users on the same browser don't share recent-files
   * state. The personal source does not re-issue /auth/me on every
   * call — that's the gate's job.
   */
  user: Pick<UserWire, 'id' | 'username'>;
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
    // Wrap fetch in an arrow so it's not bound to `this` — browsers
    // throw "Illegal invocation" when fetch is called with anything
    // but window / undefined as the receiver.
    this.fetchImpl = opts.fetchImpl ?? (((input, init) => fetch(input, init)) as typeof fetch);
    this.label = opts.user.username || 'My files';
    // Scoped per (kind, userId) so the recent-files cache survives
    // user-switching on the same browser without leaking.
    this.scope = `personal.${opts.user.id}`;
  }

  async list(): Promise<FileEntry[]> {
    const res = await this.req('/files');
    const body = (await res.json()) as { files: FileSummaryWire[] };
    const entries = (body.files ?? []).map(summaryToEntry);
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
    // First save mints an id via a multipart POST /files (the `file`
    // part carries the bytes + filename). Subsequent saves overwrite
    // via POST /files/{id} with the raw bytes and an `If-Match` header
    // carrying the etag we hold, so a concurrent host-side change
    // surfaces as a 412 rather than silently clobbering.
    let res: Response;
    if (id === null) {
      const form = new FormData();
      const blob = new Blob([bytes], { type: OCTET_STREAM });
      form.append('file', blob, opts?.name || 'document.docx');
      if (opts?.name) form.append('name', opts.name);
      res = await this.req('/files', { method: 'POST', body: form });
    } else {
      const headers: Record<string, string> = { 'Content-Type': OCTET_STREAM };
      if (opts?.etag) headers['If-Match'] = opts.etag;
      res = await this.req(`/files/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers,
        body: bytes,
      });
    }
    const body = (await res.json()) as { file: FileSummaryWire };
    const summary = body.file;
    // Refresh the recent observer optimistically — callers can rely
    // on watchRecent firing without an explicit list().
    this.bumpRecent(summary);
    return { id: summary.id, etag: summary.etag };
  }

  async rename(id: string, newName: string): Promise<void> {
    // collab returns 204 (no body) on a successful rename.
    await this.req(`/files/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });
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

  /**
   * Fetch the user's merged profile (identity + extended fields).
   * Personal-mode only — not on the FileSource interface, so callers
   * must narrow on `kind === 'personal'` before invoking.
   */
  async getProfile(): Promise<ProfileWire> {
    const res = await this.req('/auth/profile');
    const body = (await res.json()) as { profile: ProfileWire };
    return body.profile;
  }

  /**
   * Update the user's profile. Fields omitted from the patch are
   * left unchanged; explicit empty strings clear the field. Returns
   * the freshly-merged view so the caller doesn't need a separate
   * GET round-trip.
   */
  async updateProfile(patch: ProfilePatchWire): Promise<ProfileWire> {
    const res = await this.req('/auth/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const body = (await res.json()) as { profile: ProfileWire };
    return body.profile;
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
      // Try to parse collab's { error } envelope. If the body isn't
      // JSON (e.g. an upstream proxy returned a plain HTML 502), fall
      // back to a synthesized error.
      let code = 'http_' + res.status;
      let message = res.statusText;
      try {
        const body = (await res.clone().json()) as ErrorWire;
        if (body?.error) {
          code = body.error;
          message = body.error;
        }
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
    id: s.id,
    name: s.name,
    size: s.size,
    // collab returns modifiedAt as ms-since-epoch already.
    modifiedAt: s.modifiedAt || 0,
    source: 'personal',
    meta: { version: s.etag },
  };
}

/**
 * Pulls the filename out of a Content-Disposition header. Handles both
 * the RFC 5987 `filename*=UTF-8''…` form and collab's
 * `filename="<percent-encoded>"` form.
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
  if (!plain) return null;
  // collab percent-encodes the name into the quoted form; decode it.
  try {
    return decodeURIComponent(plain[1]);
  } catch {
    return plain[1];
  }
}
