/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Unit tests for ParaIdAllocatorExtension — the appendTransaction
 * plugin that guarantees every paragraph has a stable, unique
 * `paraId` after any docChanged transaction.
 *
 * Why this matters: agent tooling (comments, tracked changes, the
 * paraId-keyed change tracker) anchors against `paraId`. A paragraph
 * with `paraId: null` is invisible to those subsystems, and a
 * duplicate paraId (the second half of an Enter-split, or a paste
 * that re-used existing IDs) silently desyncs anchors.
 */

import { describe, expect, test } from 'bun:test';
import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { ExtensionManager } from '../ExtensionManager';
import { ParaIdAllocatorExtension, paraIdAllocatorKey } from './ParaIdAllocatorExtension';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      attrs: {
        paraId: { default: null },
        textId: { default: null },
      },
      toDOM: () => ['p', 0],
    },
    text: { group: 'inline' },
  },
  marks: {
    bold: {
      parseDOM: [{ tag: 'strong' }],
      toDOM() {
        return ['strong', 0];
      },
    },
  },
});

const manager = new ExtensionManager([]);

// A FRESH plugin per state — each models an independent editor session. The
// allocator does one full scan on the first doc-changing transaction (catching
// load-time gaps), then only re-scans on structural edits; sharing a single
// instance across tests would leak that "did initial scan" state between them.
function freshPlugin() {
  return ParaIdAllocatorExtension().onSchemaReady({ schema, manager }).plugins![0];
}

function createDoc(paras: Array<{ text: string; paraId?: string | null }>) {
  return schema.node(
    'doc',
    null,
    paras.map((p) =>
      schema.node('paragraph', { paraId: p.paraId ?? null }, p.text ? [schema.text(p.text)] : [])
    )
  );
}

function createState(paras: Array<{ text: string; paraId?: string | null }>) {
  return EditorState.create({ doc: createDoc(paras), plugins: [freshPlugin()] });
}

function paraIds(state: EditorState): (string | null)[] {
  const out: (string | null)[] = [];
  state.doc.descendants((node) => {
    if (node.type.name === 'paragraph') {
      out.push((node.attrs.paraId as string | null) ?? null);
      return false;
    }
    return true;
  });
  return out;
}

describe('ParaIdAllocatorExtension', () => {
  describe('allocation', () => {
    test('assigns a paraId to a paragraph that lacks one after a docChanged tx', () => {
      let state = createState([{ text: 'Hello' }]);
      expect(paraIds(state)).toEqual([null]);

      state = state.apply(state.tr.insertText(' world', 6));
      const [id] = paraIds(state);
      expect(typeof id).toBe('string');
      expect((id as string).length).toBeGreaterThan(0);
    });

    test('preserves an existing unique paraId across an unrelated edit', () => {
      let state = createState([{ text: 'Hello', paraId: 'P1' }]);
      state = state.apply(state.tr.insertText(' world', 6));
      expect(paraIds(state)).toEqual(['P1']);
    });

    test('replaces a duplicated paraId with a fresh unique one', () => {
      let state = createState([
        { text: 'A', paraId: 'SAME' },
        { text: 'B', paraId: 'SAME' },
      ]);
      // Force any docChanged tx so the allocator runs.
      state = state.apply(state.tr.insertText('!', 2));
      const ids = paraIds(state);
      expect(ids).toHaveLength(2);
      expect(ids[0]).toBe('SAME');
      expect(ids[1]).not.toBe('SAME');
      expect(typeof ids[1]).toBe('string');
    });

    test('all final paraIds are unique across the document', () => {
      let state = createState([
        { text: 'A' },
        { text: 'B', paraId: 'KEEP' },
        { text: 'C' },
        { text: 'D', paraId: 'KEEP' }, // dup of B
      ]);
      state = state.apply(state.tr.insertText('!', 2));
      const ids = paraIds(state);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('no-op cases', () => {
    test('selection-only transaction does not trigger allocation', () => {
      let state = createState([{ text: 'Hello' }]);
      const before = paraIds(state);
      // setSelection produces a non-docChanged transaction.
      state = state.apply(state.tr.setMeta('marker', 'ignored'));
      expect(paraIds(state)).toEqual(before);
    });

    test('setMeta on an already-allocated doc is a no-op (no second appended tx)', () => {
      let state = createState([{ text: 'X', paraId: 'A' }]);
      state = state.apply(state.tr.insertText('Y', 2));
      const before = paraIds(state);

      state = state.apply(state.tr.setMeta('any', 'thing'));
      expect(paraIds(state)).toEqual(before);
    });
  });

  describe('appended transaction metadata', () => {
    test('appended tr is flagged with the allocator meta key', () => {
      const state = createState([{ text: 'X' }]);
      const { state: newState, transactions } = state.applyTransaction(state.tr.insertText('Y', 2));
      // Two transactions: the original insert + the allocator's appended tr.
      expect(transactions.length).toBe(2);
      expect(transactions[1].getMeta(paraIdAllocatorKey)).toBe('allocated');
      expect(paraIds(newState)[0]).not.toBe(null);
    });

    test('appended tr is excluded from history (addToHistory=false)', () => {
      const state = createState([{ text: 'X' }]);
      const { transactions } = state.applyTransaction(state.tr.insertText('Y', 2));
      expect(transactions[1].getMeta('addToHistory')).toBe(false);
    });
  });

  describe('split / paste shapes', () => {
    test('splitting a paragraph leaves both halves with unique paraIds', () => {
      let state = createState([{ text: 'HelloWorld', paraId: 'ORIG' }]);
      // Simulate Enter at position 6 by splitting the paragraph.
      state = state.apply(state.tr.split(6));
      const ids = paraIds(state);
      expect(ids).toHaveLength(2);
      expect(new Set(ids).size).toBe(2);
      // ORIG stays on the first half; second half gets a new id.
      expect(ids[0]).toBe('ORIG');
      expect(typeof ids[1]).toBe('string');
    });

    test('multiple new paragraphs each get distinct paraIds', () => {
      let state = createState([{ text: 'A' }, { text: 'B' }, { text: 'C' }]);
      state = state.apply(state.tr.insertText('!', 2));
      const ids = paraIds(state);
      expect(ids).toHaveLength(3);
      expect(new Set(ids).size).toBe(3);
      expect(ids.every((id) => typeof id === 'string')).toBe(true);
    });
  });

  describe('typing fast-path (skips the O(paragraphs) re-scan)', () => {
    test('plain typing after the initial scan appends no allocator transaction', () => {
      let state = createState([{ text: 'X', paraId: 'A' }]);
      // First doc-changing tx does the initial scan.
      state = state.apply(state.tr.insertText('Y', 2));
      // Subsequent plain typing must NOT append a second allocator tx — that
      // whole-doc walk is what made large documents lag per keystroke.
      const { transactions } = state.applyTransaction(state.tr.insertText('Z', 3));
      expect(transactions).toHaveLength(1); // just the insert, no appended scan
    });

    test('a structural edit after the initial scan still re-scans and dedups', () => {
      let state = createState([{ text: 'HelloWorld', paraId: 'ORIG' }]);
      // Initial scan via a plain edit.
      state = state.apply(state.tr.insertText('!', 11));
      // Now split (Enter) — a structural edit must still allocate a fresh id
      // for the second half rather than leaving a duplicate.
      state = state.apply(state.tr.split(6));
      const ids = paraIds(state);
      expect(ids).toHaveLength(2);
      expect(new Set(ids).size).toBe(2);
    });
  });
});
