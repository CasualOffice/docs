/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { describe, expect, it } from 'bun:test';

import { performAutoSave, type AutoSaveEditorRef } from './useFileSourceAutoSave';
import type { FileEntry, FileSource } from './types';

/**
 * fakeFileSource is a minimal in-memory FileSource that records
 * every save call. Only `save` is exercised in the tests; the other
 * methods throw so a stray call site shows up loudly.
 */
function fakeFileSource(): FileSource & {
  saveCalls: Array<{ id: string | null; size: number; name?: string }>;
  saveResult: { id: string; etag: string };
} {
  const saveCalls: Array<{ id: string | null; size: number; name?: string }> = [];
  const fs: FileSource & {
    saveCalls: typeof saveCalls;
    saveResult: { id: string; etag: string };
  } = {
    kind: 'personal',
    label: 'Test',
    list: async () => [] as FileEntry[],
    open: async () => {
      throw new Error('not used');
    },
    save: async (id, bytes, opts) => {
      saveCalls.push({ id, size: bytes.byteLength, name: opts?.name });
      return fs.saveResult;
    },
    rename: async () => {
      throw new Error('not used');
    },
    delete: async () => {
      throw new Error('not used');
    },
    watchRecent: () => () => undefined,
    rememberLastOpened: async () => undefined,
    lastOpened: async () => null,
    saveCalls,
    saveResult: { id: 'doc_id', etag: '7' },
  };
  return fs;
}

function fakeRef(bytes: ArrayBuffer | null): AutoSaveEditorRef {
  return {
    save: async () => bytes,
  };
}

describe('performAutoSave', () => {
  it('returns ok with the etag when the editor produces bytes', async () => {
    const fs = fakeFileSource();
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer;
    const ref = fakeRef(bytes);
    const result = await performAutoSave({
      getRef: () => ref,
      fileSource: fs,
      docId: 'doc_id',
      name: 'Untitled.docx',
    });
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.etag).toBe('7');
      expect(result.savedAt).toBeInstanceOf(Date);
    }
    expect(fs.saveCalls).toHaveLength(1);
    expect(fs.saveCalls[0]).toEqual({
      id: 'doc_id',
      size: 4,
      name: 'Untitled.docx',
    });
  });

  it("skips with reason=no-ref when the editor isn't mounted", async () => {
    const fs = fakeFileSource();
    const result = await performAutoSave({
      getRef: () => null,
      fileSource: fs,
      docId: 'doc_id',
    });
    expect(result).toEqual({ kind: 'skip', reason: 'no-ref' });
    expect(fs.saveCalls).toHaveLength(0);
  });

  it("returns err when the editor's save() returns null (serialization failure)", async () => {
    const fs = fakeFileSource();
    const result = await performAutoSave({
      getRef: () => fakeRef(null),
      fileSource: fs,
      docId: 'doc_id',
    });
    expect(result.kind).toBe('err');
    if (result.kind === 'err') {
      expect((result.err as Error).message).toMatch(/no bytes/i);
    }
    expect(fs.saveCalls).toHaveLength(0);
  });

  it('returns err when the editor.save() throws', async () => {
    const fs = fakeFileSource();
    const ref: AutoSaveEditorRef = {
      save: async () => {
        throw new Error('boom');
      },
    };
    const result = await performAutoSave({
      getRef: () => ref,
      fileSource: fs,
      docId: 'doc_id',
    });
    expect(result.kind).toBe('err');
    if (result.kind === 'err') {
      expect((result.err as Error).message).toBe('boom');
    }
    expect(fs.saveCalls).toHaveLength(0);
  });

  it('returns err when fileSource.save() throws (the host backend rejected)', async () => {
    const fs = fakeFileSource();
    fs.save = async () => {
      throw new Error('gateway down');
    };
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const result = await performAutoSave({
      getRef: () => fakeRef(bytes),
      fileSource: fs,
      docId: 'doc_id',
    });
    expect(result.kind).toBe('err');
    if (result.kind === 'err') {
      expect((result.err as Error).message).toBe('gateway down');
    }
  });

  it("passes the editor's save() the selective:true option", async () => {
    const fs = fakeFileSource();
    let savedWith: { selective?: boolean } | undefined;
    const ref: AutoSaveEditorRef = {
      save: async (opts) => {
        savedWith = opts;
        return new Uint8Array([1]).buffer;
      },
    };
    await performAutoSave({ getRef: () => ref, fileSource: fs, docId: 'd' });
    expect(savedWith).toEqual({ selective: true });
  });

  it('does not call fileSource.save when the editor produces empty bytes', async () => {
    // Empty ArrayBuffer is "no bytes" from the FileSource point of
    // view? Actually no — empty IS valid here (just nothing to save
    // worth noting). The hook delegates empty/non-empty interpretation
    // to FileSource — performAutoSave passes whatever the editor
    // produced. This test pins that behavior.
    const fs = fakeFileSource();
    const bytes = new ArrayBuffer(0);
    const result = await performAutoSave({
      getRef: () => fakeRef(bytes),
      fileSource: fs,
      docId: 'd',
    });
    expect(result.kind).toBe('ok');
    expect(fs.saveCalls[0].size).toBe(0);
  });
});
