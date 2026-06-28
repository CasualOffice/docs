/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  loadBuildingBlocks,
  addBuildingBlock,
  removeBuildingBlock,
  previewFromText,
} from './buildingBlocks';

// Minimal localStorage shim so the module-under-test runs under bun:test
// without a real browser. `globalThis.window` doesn't exist by default.
function installLocalStorage() {
  const store = new Map<string, string>();
  const ls = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  };
  (globalThis as unknown as { window: { localStorage: typeof ls } }).window = {
    localStorage: ls,
  };
}

describe('buildingBlocks storage', () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it('loads empty when nothing is saved', () => {
    expect(loadBuildingBlocks()).toEqual([]);
  });

  it('round-trips a saved block', () => {
    const blocks = addBuildingBlock({
      name: 'Greeting',
      content: { content: [], openStart: 0, openEnd: 0 },
      preview: 'Hello world',
    });
    expect(blocks.length).toBe(1);
    expect(blocks[0]?.name).toBe('Greeting');
    expect(blocks[0]?.preview).toBe('Hello world');
    expect(loadBuildingBlocks()[0]?.name).toBe('Greeting');
  });

  it('puts newest blocks first', () => {
    addBuildingBlock({ name: 'A', content: {}, preview: 'a' });
    addBuildingBlock({ name: 'B', content: {}, preview: 'b' });
    const blocks = loadBuildingBlocks();
    expect(blocks[0]?.name).toBe('B');
    expect(blocks[1]?.name).toBe('A');
  });

  it('removes a block by id', () => {
    const after = addBuildingBlock({ name: 'X', content: {}, preview: 'x' });
    const id = after[0]!.id;
    expect(removeBuildingBlock(id)).toEqual([]);
    expect(loadBuildingBlocks()).toEqual([]);
  });

  it('trims the name on save', () => {
    const [block] = addBuildingBlock({ name: '   spaced   ', content: {}, preview: 'p' });
    expect(block?.name).toBe('spaced');
  });

  it('truncates long previews with an ellipsis', () => {
    const long = 'lorem ipsum '.repeat(20);
    const out = previewFromText(long);
    expect(out.length).toBeLessThanOrEqual(80);
    expect(out.endsWith('…')).toBe(true);
  });

  it('collapses whitespace in the preview', () => {
    expect(previewFromText('  foo\n\n  bar\tbaz  ')).toBe('foo bar baz');
  });

  it('returns empty list on corrupt JSON', () => {
    window.localStorage.setItem('docx-editor-building-blocks', '{not json');
    expect(loadBuildingBlocks()).toEqual([]);
  });
});
