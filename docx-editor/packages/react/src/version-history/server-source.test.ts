/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { describe, it, expect, afterEach } from 'bun:test';
import { fetchServerVersions, downloadServerVersion } from './server-source';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('server version source', () => {
  it('maps /history revisions to newest-first VersionSnapshots', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify([
          { version: 1, savedAt: '2026-06-22T10:00:00Z', sizeBytes: 100 },
          { version: 2, savedAt: '2026-06-22T11:00:00Z', sizeBytes: 200, author: 'Ann' },
        ]),
        { status: 200 }
      )) as unknown as typeof fetch;

    const list = await fetchServerVersions({ baseUrl: 'http://h', docId: 'd' });

    expect(list.map((v) => v.serverVersion)).toEqual([2, 1]); // newest first
    expect(list[0]?.name).toBe('Saved by Ann');
    expect(list[0]?.size).toBe(200);
    expect(list[1]?.name).toBe('Version 1');
    // Server entries carry no inline PM data — restore fetches bytes.
    expect(list.every((v) => v.data === undefined)).toBe(true);
  });

  it('downloadServerVersion returns the revision bytes', async () => {
    let calledUrl = '';
    globalThis.fetch = (async (url: string) => {
      calledUrl = url;
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }) as unknown as typeof fetch;

    const buf = await downloadServerVersion({ baseUrl: 'http://h', docId: 'd' }, 2);

    expect(new Uint8Array(buf)).toEqual(new Uint8Array([1, 2, 3]));
    expect(calledUrl).toBe('http://h/api/docs/d/history/2/download');
  });

  it('throws on a non-OK history response', async () => {
    globalThis.fetch = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    await expect(fetchServerVersions({ baseUrl: 'http://h', docId: 'd' })).rejects.toThrow();
  });
});
