/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { PersonalFileSource, PersonalFileSourceError } from './personal';
import type { FileSummaryWire } from './wire';

/**
 * Mocked-fetch harness: collect the (url, init) pairs the source
 * issues so we can assert both the wire shape and the mapped result.
 * Each test sets `respond` to a function that produces the response;
 * unset means "fail loudly if called".
 */
type Call = { url: string; init: RequestInit | undefined };

function makeHarness() {
  const calls: Call[] = [];
  let respond: (call: Call) => Response | Promise<Response> = () => {
    throw new Error('mock fetch called with no responder set');
  };
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const call: Call = { url, init };
    calls.push(call);
    return respond(call);
  };
  return {
    calls,
    setRespond(fn: typeof respond) {
      respond = fn;
    },
    source: new PersonalFileSource({
      baseUrl: 'http://collab.test',
      user: { id: 7, username: 'alex' },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }),
  };
}

function jsonRes(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...(headers ?? {}) },
  });
}

function file(over: Partial<FileSummaryWire>): FileSummaryWire {
  return {
    id: 'doc_a',
    name: 'Report.docx',
    size: 1024,
    etag: 'v4',
    createdAt: 1_700_000_000_000,
    modifiedAt: 1_700_000_500_000,
    ...over,
  };
}

beforeEach(() => {
  // Ensure localStorage exists in the Bun test runtime. happy-dom /
  // jsdom would provide one, but we don't pull either; the source
  // tolerates a missing localStorage, so the tests just need a real
  // one for the rememberLastOpened path.
  if (typeof globalThis.localStorage === 'undefined') {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
        clear: () => store.clear(),
        key: (i: number) => Array.from(store.keys())[i] ?? null,
        get length() {
          return store.size;
        },
      },
    });
  }
});

afterEach(() => {
  // Reset between tests so a stale lastOpened doesn't leak.
  globalThis.localStorage?.clear?.();
});

describe('PersonalFileSource', () => {
  it('exposes a personal kind + the username label', () => {
    const { source } = makeHarness();
    expect(source.kind).toBe('personal');
    expect(source.label).toBe('alex');
  });

  it('list() unwraps { files } into FileEntry[]', async () => {
    const h = makeHarness();
    const files: FileSummaryWire[] = [
      file({
        id: 'doc_a',
        name: 'Report.docx',
        etag: 'v4',
        size: 1024,
        modifiedAt: 1_700_000_000_000,
      }),
      file({
        id: 'doc_b',
        name: 'Notes.docx',
        etag: 'v1',
        size: 99,
        modifiedAt: 1_700_000_900_000,
      }),
    ];
    h.setRespond(() => jsonRes(200, { files }));

    const entries = await h.source.list();
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].url).toBe('http://collab.test/files');
    expect(h.calls[0].init?.credentials).toBe('include');
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      id: 'doc_a',
      name: 'Report.docx',
      size: 1024,
      source: 'personal',
    });
    // modifiedAt is already ms-since-epoch — passed through, not parsed.
    expect(entries[0].modifiedAt).toBe(1_700_000_000_000);
    // Provenance preserved (etag → meta.version).
    expect((entries[0].meta as { version: string }).version).toBe('v4');
  });

  it('open() streams .docx bytes and the etag header', async () => {
    const h = makeHarness();
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xab, 0xcd]);
    h.setRespond(() => {
      return new Response(bytes, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': 'attachment; filename="Report.docx"',
          etag: 'v4',
        },
      });
    });

    const result = await h.source.open('doc_a');
    expect(h.calls[0].url).toBe('http://collab.test/files/doc_a');
    expect(result.name).toBe('Report.docx');
    expect(result.etag).toBe('v4');
    expect(new Uint8Array(result.bytes)).toEqual(bytes);
  });

  it('save() with id=null multipart-POSTs to /files and returns the minted id', async () => {
    const h = makeHarness();
    h.setRespond(() =>
      jsonRes(201, { file: file({ id: 'doc_new', name: 'Draft.docx', etag: 'v1' }) })
    );

    const result = await h.source.save(null, new Uint8Array([1, 2, 3, 4, 5, 6]).buffer, {
      name: 'Draft.docx',
    });
    expect(h.calls[0].url).toBe('http://collab.test/files');
    expect(h.calls[0].init?.method).toBe('POST');
    const form = h.calls[0].init?.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect((form.get('file') as File).name).toBe('Draft.docx');
    expect(form.get('name')).toBe('Draft.docx');
    // Must NOT set Content-Type — the browser adds the multipart boundary.
    expect(
      (h.calls[0].init?.headers as Record<string, string> | undefined)?.['Content-Type']
    ).toBeUndefined();
    expect(result.id).toBe('doc_new');
    expect(result.etag).toBe('v1');
  });

  it('save() with an existing id POSTs raw bytes to /files/:id with If-Match', async () => {
    const h = makeHarness();
    h.setRespond(() => jsonRes(200, { file: file({ id: 'doc_a', etag: 'v5' }) }));

    const result = await h.source.save('doc_a', new Uint8Array([1, 2, 3, 4, 5, 6, 7]).buffer, {
      etag: 'v4',
    });
    expect(h.calls[0].url).toBe('http://collab.test/files/doc_a');
    expect(h.calls[0].init?.method).toBe('POST');
    const headers = h.calls[0].init?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/octet-stream');
    expect(headers['If-Match']).toBe('v4');
    expect(result.etag).toBe('v5');
  });

  it('rename() PATCHes { name } (204) and updates the recent observer', async () => {
    const h = makeHarness();
    h.setRespond(() => jsonRes(200, { files: [file({ id: 'doc_a', name: 'old.docx' })] }));
    await h.source.list();

    let observed: { id: string; name: string }[] = [];
    h.source.watchRecent((entries) => {
      observed = entries.map((e) => ({ id: e.id, name: e.name }));
    });

    h.setRespond(() => new Response(null, { status: 204 }));
    await h.source.rename('doc_a', 'new.docx');
    expect(h.calls.at(-1)?.url).toBe('http://collab.test/files/doc_a');
    expect(h.calls.at(-1)?.init?.method).toBe('PATCH');
    expect(JSON.parse((h.calls.at(-1)?.init?.body as string) ?? '{}')).toEqual({
      name: 'new.docx',
    });
    expect(observed).toEqual([{ id: 'doc_a', name: 'new.docx' }]);
  });

  it('delete() DELETEs and removes the entry from the observer', async () => {
    const h = makeHarness();
    h.setRespond(() =>
      jsonRes(200, {
        files: [file({ id: 'doc_a', name: 'a.docx' }), file({ id: 'doc_b', name: 'b.docx' })],
      })
    );
    await h.source.list();

    let observed: string[] = [];
    h.source.watchRecent((entries) => {
      observed = entries.map((e) => e.id);
    });

    h.setRespond(() => new Response(null, { status: 204 }));
    await h.source.delete('doc_a');
    expect(h.calls.at(-1)?.init?.method).toBe('DELETE');
    expect(observed).toEqual(['doc_b']);
  });

  it('throws PersonalFileSourceError with the collab error code on 4xx', async () => {
    const h = makeHarness();
    h.setRespond(() => jsonRes(404, { error: 'not-found' }));
    try {
      await h.source.open('missing');
      throw new Error('expected open() to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(PersonalFileSourceError);
      const e = err as PersonalFileSourceError;
      expect(e.status).toBe(404);
      expect(e.code).toBe('not-found');
    }
  });

  it('getProfile() GETs /auth/profile and unwraps { profile }', async () => {
    const h = makeHarness();
    h.setRespond(() =>
      jsonRes(200, {
        user: { id: 7, username: 'alex', isAdmin: false, createdAt: 1 },
        profile: {
          displayName: 'Alex',
          email: 'a@example.com',
          timezone: 'America/Los_Angeles',
          hasAvatar: false,
          preferences: { showRulers: true },
        },
      })
    );
    const profile = await h.source.getProfile();
    expect(h.calls[0].url).toBe('http://collab.test/auth/profile');
    expect(h.calls[0].init?.method).toBeUndefined(); // default GET
    expect(profile.displayName).toBe('Alex');
    expect(profile.timezone).toBe('America/Los_Angeles');
    expect((profile.preferences as { showRulers: boolean })?.showRulers).toBe(true);
  });

  it('updateProfile() PATCHes the patch and unwraps { profile }', async () => {
    const h = makeHarness();
    h.setRespond(() =>
      jsonRes(200, {
        profile: {
          displayName: 'Alex Updated',
          email: 'a@example.com',
          timezone: 'UTC',
          hasAvatar: false,
          preferences: { locale: 'de-DE' },
        },
      })
    );
    const profile = await h.source.updateProfile({
      displayName: 'Alex Updated',
      preferences: { locale: 'de-DE' },
    });
    expect(h.calls[0].url).toBe('http://collab.test/auth/profile');
    expect(h.calls[0].init?.method).toBe('PATCH');
    const body = JSON.parse((h.calls[0].init?.body as string) ?? '{}');
    expect(body).toEqual({ displayName: 'Alex Updated', preferences: { locale: 'de-DE' } });
    expect(profile.displayName).toBe('Alex Updated');
    expect((profile.preferences as { locale: string }).locale).toBe('de-DE');
  });

  it('updateProfile() surfaces 409 errors with the collab code', async () => {
    const h = makeHarness();
    h.setRespond(() => jsonRes(409, { error: 'conflict-or-invalid' }));
    try {
      await h.source.updateProfile({ displayName: '   ' });
      throw new Error('expected updateProfile to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(PersonalFileSourceError);
      const e = err as PersonalFileSourceError;
      expect(e.status).toBe(409);
      expect(e.code).toBe('conflict-or-invalid');
    }
  });

  it('rememberLastOpened / lastOpened round-trip via localStorage', async () => {
    const { source } = makeHarness();
    expect(await source.lastOpened()).toBeNull();
    await source.rememberLastOpened('doc_a');
    expect(await source.lastOpened()).toBe('doc_a');
    await source.rememberLastOpened(null);
    expect(await source.lastOpened()).toBeNull();
  });
});
