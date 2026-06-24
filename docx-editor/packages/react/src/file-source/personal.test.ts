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
      baseUrl: 'http://gateway.test',
      user: { userId: 'user_abc', displayName: 'Alex' },
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
  it('exposes a personal kind + the display-name label', () => {
    const { source } = makeHarness();
    expect(source.kind).toBe('personal');
    expect(source.label).toBe('Alex');
  });

  it('list() maps FileSummaryWire[] into FileEntry[]', async () => {
    const h = makeHarness();
    const summaries: FileSummaryWire[] = [
      {
        docId: 'doc_a',
        fileName: 'Report.docx',
        version: 4,
        savedAt: '2026-05-01T12:00:00Z',
        size: 1024,
      },
      {
        docId: 'doc_b',
        fileName: 'Notes.docx',
        version: 1,
        savedAt: '2026-05-02T09:00:00Z',
        size: 99,
      },
    ];
    h.setRespond(() => jsonRes(200, summaries));

    const entries = await h.source.list();
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].url).toBe('http://gateway.test/files');
    expect(h.calls[0].init?.credentials).toBe('include');
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      id: 'doc_a',
      name: 'Report.docx',
      size: 1024,
      source: 'personal',
    });
    expect(entries[0].modifiedAt).toBe(Date.parse('2026-05-01T12:00:00Z'));
    // Provenance preserved.
    expect((entries[0].meta as { version: number }).version).toBe(4);
  });

  it('open() streams .docx bytes and the ETag header', async () => {
    const h = makeHarness();
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xab, 0xcd]);
    h.setRespond(() => {
      return new Response(bytes, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': "attachment; filename*=UTF-8''Report.docx",
          ETag: '4',
        },
      });
    });

    const result = await h.source.open('doc_a');
    expect(h.calls[0].url).toBe('http://gateway.test/files/doc_a');
    expect(result.name).toBe('Report.docx');
    expect(result.etag).toBe('4');
    expect(new Uint8Array(result.bytes)).toEqual(bytes);
  });

  it('save() with id=null POSTs to /files and returns the minted id', async () => {
    const h = makeHarness();
    const summary: FileSummaryWire = {
      docId: 'doc_new',
      fileName: 'Draft.docx',
      version: 1,
      savedAt: '2026-05-03T00:00:00Z',
      size: 6,
    };
    h.setRespond(() => jsonRes(201, summary));

    const result = await h.source.save(null, new Uint8Array([1, 2, 3, 4, 5, 6]).buffer, {
      name: 'Draft.docx',
    });
    expect(h.calls[0].url).toBe('http://gateway.test/files');
    expect(h.calls[0].init?.method).toBe('POST');
    expect((h.calls[0].init?.headers as Record<string, string>)['X-File-Name']).toBe('Draft.docx');
    expect(result.id).toBe('doc_new');
    expect(result.etag).toBe('1');
  });

  it('save() with an existing id PUTs to /files/:id/contents', async () => {
    const h = makeHarness();
    const summary: FileSummaryWire = {
      docId: 'doc_a',
      fileName: 'Report.docx',
      version: 5,
      savedAt: '2026-05-04T00:00:00Z',
      size: 7,
    };
    h.setRespond(() => jsonRes(200, summary));

    const result = await h.source.save('doc_a', new Uint8Array([1, 2, 3, 4, 5, 6, 7]).buffer);
    expect(h.calls[0].url).toBe('http://gateway.test/files/doc_a/contents');
    expect(h.calls[0].init?.method).toBe('PUT');
    expect(result.etag).toBe('5');
  });

  it('rename() PATCHes and updates the recent observer', async () => {
    const h = makeHarness();
    // Seed the recent list first via list().
    const summary: FileSummaryWire = {
      docId: 'doc_a',
      fileName: 'old.docx',
      version: 1,
      savedAt: '2026-05-01T00:00:00Z',
      size: 1,
    };
    h.setRespond(() => jsonRes(200, [summary]));
    await h.source.list();

    let observed: { id: string; name: string }[] = [];
    h.source.watchRecent((entries) => {
      observed = entries.map((e) => ({ id: e.id, name: e.name }));
    });

    h.setRespond(() => jsonRes(200, { fileName: 'new.docx' }));
    await h.source.rename('doc_a', 'new.docx');
    expect(h.calls.at(-1)?.url).toBe('http://gateway.test/files/doc_a');
    expect(h.calls.at(-1)?.init?.method).toBe('PATCH');
    expect(observed).toEqual([{ id: 'doc_a', name: 'new.docx' }]);
  });

  it('delete() DELETEs and removes the entry from the observer', async () => {
    const h = makeHarness();
    const summaries: FileSummaryWire[] = [
      { docId: 'doc_a', fileName: 'a.docx', version: 1, savedAt: '2026-05-01T00:00:00Z', size: 1 },
      { docId: 'doc_b', fileName: 'b.docx', version: 1, savedAt: '2026-05-01T00:00:00Z', size: 1 },
    ];
    h.setRespond(() => jsonRes(200, summaries));
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

  it('throws PersonalFileSourceError with the gateway code on 4xx', async () => {
    const h = makeHarness();
    h.setRespond(() => jsonRes(404, { code: 'not_found', message: 'no such doc' }));
    try {
      await h.source.open('missing');
      throw new Error('expected open() to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(PersonalFileSourceError);
      const e = err as PersonalFileSourceError;
      expect(e.status).toBe(404);
      expect(e.code).toBe('not_found');
    }
  });

  it('getProfile() GETs /auth/profile and returns the merged view', async () => {
    const h = makeHarness();
    h.setRespond(() =>
      jsonRes(200, {
        userId: 'user_abc',
        email: 'a@example.com',
        displayName: 'Alex',
        timezone: 'America/Los_Angeles',
        prefs: { showRulers: true },
      })
    );
    const profile = await h.source.getProfile();
    expect(h.calls[0].url).toBe('http://gateway.test/auth/profile');
    expect(h.calls[0].init?.method).toBeUndefined(); // default GET
    expect(profile.displayName).toBe('Alex');
    expect(profile.timezone).toBe('America/Los_Angeles');
    expect((profile.prefs as { showRulers: boolean })?.showRulers).toBe(true);
  });

  it('updateProfile() PUTs the patch and returns the refreshed view', async () => {
    const h = makeHarness();
    h.setRespond(() =>
      jsonRes(200, {
        userId: 'user_abc',
        email: 'a@example.com',
        displayName: 'Alex Updated',
        locale: 'de-DE',
      })
    );
    const profile = await h.source.updateProfile({
      displayName: 'Alex Updated',
      locale: 'de-DE',
    });
    expect(h.calls[0].url).toBe('http://gateway.test/auth/profile');
    expect(h.calls[0].init?.method).toBe('PUT');
    const body = JSON.parse((h.calls[0].init?.body as string) ?? '{}');
    expect(body).toEqual({ displayName: 'Alex Updated', locale: 'de-DE' });
    expect(profile.displayName).toBe('Alex Updated');
    expect(profile.locale).toBe('de-DE');
  });

  it('updateProfile() surfaces 400 errors with the gateway code', async () => {
    const h = makeHarness();
    h.setRespond(() =>
      jsonRes(400, { code: 'display_name', message: 'display name cannot be empty' })
    );
    try {
      await h.source.updateProfile({ displayName: '   ' });
      throw new Error('expected updateProfile to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(PersonalFileSourceError);
      const e = err as PersonalFileSourceError;
      expect(e.status).toBe(400);
      expect(e.code).toBe('display_name');
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
