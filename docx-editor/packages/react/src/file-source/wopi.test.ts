import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { WopiFileSource, WopiNotSupportedError } from './wopi';

type Call = { url: string; init: RequestInit | undefined };

function makeHarness(opts?: { fileName?: string }) {
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
    source: new WopiFileSource({
      baseUrl: 'http://gateway.test',
      docId: 'aHR0cDovL2hvc3QvZmlsZXMvYWJj',
      accessToken: 'tok-jwt',
      fileName: opts?.fileName,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }),
  };
}

beforeEach(() => {
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
  globalThis.localStorage?.clear?.();
});

describe('WopiFileSource', () => {
  it('exposes the wopi kind and a label derived from the fileName', () => {
    const { source } = makeHarness({ fileName: 'Report.docx' });
    expect(source.kind).toBe('wopi');
    expect(source.label).toBe('Report.docx');
  });

  it('falls back to a generic label when fileName is missing', () => {
    const { source } = makeHarness();
    expect(source.label).toBe('Embedded document');
  });

  it('list() returns a single entry for the embedded doc', async () => {
    const { source } = makeHarness({ fileName: 'Notes.docx' });
    const list = await source.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: 'aHR0cDovL2hvc3QvZmlsZXMvYWJj',
      name: 'Notes.docx',
      source: 'wopi',
    });
  });

  it('open() proxies through the gateway download with the access_token query', async () => {
    const h = makeHarness({ fileName: 'Notes.docx' });
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    h.setRespond(() => new Response(bytes, { status: 200, headers: { ETag: 'v7' } }));
    const result = await h.source.open('aHR0cDovL2hvc3QvZmlsZXMvYWJj');
    expect(h.calls[0].url).toContain(
      '/api/docs/aHR0cDovL2hvc3QvZmlsZXMvYWJj/download?access_token=tok-jwt'
    );
    expect(result.name).toBe('Notes.docx');
    expect(result.etag).toBe('v7');
    expect(new Uint8Array(result.bytes)).toEqual(bytes);
  });

  it('open() with a different docId throws WopiNotSupportedError', async () => {
    const { source } = makeHarness();
    try {
      await source.open('some-other-id');
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(WopiNotSupportedError);
    }
  });

  it('save() / rename() / delete() throw WopiNotSupportedError', async () => {
    const { source } = makeHarness();
    for (const op of [() => source.save(), () => source.rename(), () => source.delete()] as Array<
      () => Promise<unknown>
    >) {
      try {
        await op();
        throw new Error('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(WopiNotSupportedError);
      }
    }
  });

  it('watchRecent fires immediately with the single embedded doc', () => {
    const { source } = makeHarness({ fileName: 'Notes.docx' });
    let observed: Array<{ id: string; name: string }> = [];
    source.watchRecent((entries) => {
      observed = entries.map((e) => ({ id: e.id, name: e.name }));
    });
    expect(observed).toEqual([{ id: 'aHR0cDovL2hvc3QvZmlsZXMvYWJj', name: 'Notes.docx' }]);
  });

  it('rememberLastOpened / lastOpened round-trip via localStorage, scoped per docId', async () => {
    const { source } = makeHarness();
    expect(await source.lastOpened()).toBeNull();
    await source.rememberLastOpened('aHR0cDovL2hvc3QvZmlsZXMvYWJj');
    expect(await source.lastOpened()).toBe('aHR0cDovL2hvc3QvZmlsZXMvYWJj');
    await source.rememberLastOpened(null);
    expect(await source.lastOpened()).toBeNull();
  });

  it('open() throws when the gateway returns a non-2xx', async () => {
    const h = makeHarness();
    h.setRespond(() => new Response('', { status: 403 }));
    try {
      await h.source.open('aHR0cDovL2hvc3QvZmlsZXMvYWJj');
      throw new Error('expected throw');
    } catch (err) {
      expect((err as Error).message).toContain('403');
    }
  });
});
