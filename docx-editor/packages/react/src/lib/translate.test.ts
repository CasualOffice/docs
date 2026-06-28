/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { Schema } from 'prosemirror-model';
import { clearTranslateCacheForTests, translateFragment } from './translate';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
  },
  marks: {
    bold: { toDOM: () => ['strong', 0] },
  },
});

/**
 * Build a paragraph with N distinct text runs. PM auto-collapses
 * adjacent text nodes with identical marks, so alternating runs with
 * the bold mark keeps them as N separate runs — the exact scenario
 * (formatted documents) where per-run batching has to work.
 */
function paraWithRuns(...runs: string[]): import('prosemirror-model').Node {
  return schema.nodes.paragraph.create(
    null,
    runs.map((t, i) =>
      i % 2 === 0 ? schema.text(t) : schema.text(t, [schema.marks.bold.create()])
    )
  );
}

// Test scaffolding — replace global fetch so we can count calls and
// control responses without hitting the real MyMemory endpoint.
let fetchCalls = 0;
let fetchResponder: (input: string) => Promise<Response> = async () => new Response('{}');
const realFetch = globalThis.fetch;

beforeEach(() => {
  fetchCalls = 0;
  clearTranslateCacheForTests();
  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    fetchCalls += 1;
    return fetchResponder(typeof input === 'string' ? input : input.toString());
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockMyMemory(translation: (q: string) => string): void {
  fetchResponder = async (url) => {
    const q = decodeURIComponent(new URL(url).searchParams.get('q') ?? '');
    return new Response(
      JSON.stringify({
        responseData: { translatedText: translation(q) },
        responseStatus: 200,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  };
}

describe('translateFragment — paragraph batching', () => {
  it('batches 18 short runs in a single paragraph into ONE API call', async () => {
    mockMyMemory((q) => q.toUpperCase());
    const runs = Array.from({ length: 18 }, (_, i) => `run${i}`);
    const para = paraWithRuns(...runs);
    const frag = para.content;
    await translateFragment(frag, schema, 'en', 'es');
    expect(fetchCalls).toBe(1);
  });

  it('splits the response on the batch separator and assigns per-run results', async () => {
    // Echo the input verbatim so we can verify each piece round-trips.
    mockMyMemory((q) => q);
    const para = paraWithRuns('alpha', ' bravo', ' charlie');
    const out = await translateFragment(para.content, schema, 'en', 'es');
    const texts: string[] = [];
    out.descendants((node) => {
      if (node.isText) texts.push(node.text ?? '');
      return false;
    });
    expect(texts).toEqual(['alpha', 'bravo', 'charlie']);
  });

  it('skips empty / whitespace-only runs without firing the network', async () => {
    mockMyMemory((q) => q.toUpperCase());
    const para = paraWithRuns('   ', '\n', 'real');
    await translateFragment(para.content, schema, 'en', 'es');
    // The two skip-runs are pre-resolved; the one real run sends a
    // single-element batch — one fetch.
    expect(fetchCalls).toBe(1);
  });

  it('cache hits skip network on the second call', async () => {
    mockMyMemory((q) => q.toUpperCase());
    const para = paraWithRuns('hello');
    await translateFragment(para.content, schema, 'en', 'es');
    expect(fetchCalls).toBe(1);
    await translateFragment(para.content, schema, 'en', 'es');
    expect(fetchCalls).toBe(1); // unchanged — second call hit cache
  });

  it('source === target returns the fragment unchanged with no network calls', async () => {
    mockMyMemory((q) => q.toUpperCase());
    const para = paraWithRuns('alpha', ' bravo');
    const out = await translateFragment(para.content, schema, 'en', 'en');
    expect(fetchCalls).toBe(0);
    // Output is the same Fragment reference because source===target
    // is a fast path.
    expect(out).toBe(para.content);
  });

  it('splits at BATCH_CHAR_LIMIT — 1000-char joined text becomes 2-3 batches', async () => {
    mockMyMemory((q) => q);
    const runs = Array.from({ length: 100 }, (_, i) => `${i}aaaaaaaaaa`);
    // 100 runs * 11 chars + 99 separators * 5 chars = ~1595 chars
    // total; with BATCH_CHAR_LIMIT=460 we expect ~4 batches.
    const para = paraWithRuns(...runs);
    await translateFragment(para.content, schema, 'en', 'es');
    expect(fetchCalls).toBeGreaterThanOrEqual(2);
    expect(fetchCalls).toBeLessThanOrEqual(6);
  });
});
