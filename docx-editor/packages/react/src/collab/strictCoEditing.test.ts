/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Unit tests for the Strict co-editing enforcement core — the data-layer
 * verification the roadmap calls for (multi-peer UI e2e needs a live
 * server, so the lock policy is tested here with injected peer locks).
 */
import { describe, test, expect } from 'bun:test';
import { Schema, type Node as PMNode } from 'prosemirror-model';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import {
  createStrictCoEditingPlugin,
  setStrictCoEditing,
  isStrictCoEditingEnabled,
  peerLocks,
  strictCoEditingKey,
  type PeerLock,
} from './strictCoEditing';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
  },
  marks: {},
});

/** Build a 3-paragraph doc; returns the doc + each paragraph's [from,to]. */
function makeDoc(): { doc: PMNode; ranges: Array<{ from: number; to: number }> } {
  const para = (t: string) => schema.node('paragraph', null, [schema.text(t)]);
  const doc = schema.node('doc', null, [para('first'), para('second'), para('third')]);
  const ranges: Array<{ from: number; to: number }> = [];
  doc.forEach((node, offset) => {
    ranges.push({ from: offset, to: offset + node.nodeSize });
  });
  return { doc, ranges };
}

function makeState(locks: PeerLock[], opts?: { enabled?: boolean }): EditorState {
  const { doc } = makeDoc();
  const plugin = createStrictCoEditingPlugin({
    getLocks: () => locks,
    initiallyEnabled: opts?.enabled ?? false,
  });
  return EditorState.create({ doc, plugins: [plugin] });
}

/** Apply a typing transaction at an absolute position; returns whether it
 *  was accepted (filterTransaction lets it through). */
function tryTypeAt(state: EditorState, pos: number): boolean {
  const tr = state.tr.insertText('X', pos);
  // EditorState.applyTransaction runs filterTransaction; a filtered tr is
  // dropped, so the doc is unchanged.
  const { state: next } = state.applyTransaction(tr);
  return next.doc.textContent !== state.doc.textContent;
}

describe('strict co-editing', () => {
  test('disabled by default — no locks, all edits allowed', () => {
    const { ranges } = makeDoc();
    const state = makeState([{ ...ranges[1]!, name: 'Bob', color: '#ff0000', clientId: 2 }]);
    expect(isStrictCoEditingEnabled(state)).toBe(false);
    expect(peerLocks(state)).toHaveLength(0);
    // Edit inside the (would-be) locked second paragraph is allowed.
    expect(tryTypeAt(state, ranges[1]!.from + 1)).toBe(true);
  });

  test('enabling computes peer locks', () => {
    const { ranges } = makeDoc();
    const lock: PeerLock = { ...ranges[1]!, name: 'Bob', color: '#ff0000', clientId: 2 };
    const state = makeState([lock]);
    let captured: Transaction | null = null;
    setStrictCoEditing(true)(state, (t) => (captured = t));
    const next = state.apply(captured!);
    expect(isStrictCoEditingEnabled(next)).toBe(true);
    expect(peerLocks(next)).toHaveLength(1);
    expect(peerLocks(next)[0]!.name).toBe('Bob');
  });

  test('blocks local edits inside a peer-locked paragraph', () => {
    const { ranges } = makeDoc();
    const lock: PeerLock = { ...ranges[1]!, name: 'Bob', color: '#00ff00', clientId: 2 };
    const state = makeState([lock], { enabled: true });
    // Typing inside paragraph 2 (locked) is rejected…
    expect(tryTypeAt(state, ranges[1]!.from + 1)).toBe(false);
    // …but paragraphs 1 and 3 (unlocked) remain editable.
    expect(tryTypeAt(state, ranges[0]!.from + 1)).toBe(true);
    expect(tryTypeAt(state, ranges[2]!.from + 1)).toBe(true);
  });

  test('selection-only transactions are never blocked', () => {
    const { ranges } = makeDoc();
    const lock: PeerLock = { ...ranges[1]!, name: 'Bob', color: '#0000ff', clientId: 2 };
    const state = makeState([lock], { enabled: true });
    const sel = TextSelection.create(state.doc, ranges[1]!.from + 1);
    const { state: next } = state.applyTransaction(state.tr.setSelection(sel));
    expect(next.selection.from).toBe(ranges[1]!.from + 1);
  });

  test('remote sync transactions are never blocked', () => {
    const { doc, ranges } = makeDoc();
    const lock: PeerLock = { ...ranges[1]!, name: 'Bob', color: '#0000ff', clientId: 2 };
    const plugin = createStrictCoEditingPlugin({
      getLocks: () => [lock],
      initiallyEnabled: true,
      isRemoteTransaction: () => true, // pretend every tr is a remote sync
    });
    const state = EditorState.create({ doc, plugins: [plugin] });
    // A doc edit inside the locked block is allowed because it's "remote".
    const { state: next } = state.applyTransaction(state.tr.insertText('X', ranges[1]!.from + 1));
    expect(next.doc.textContent).not.toBe(state.doc.textContent);
  });

  test('enabled with locks produces decorations (dashed border + badge)', () => {
    const { ranges } = makeDoc();
    const lock: PeerLock = { ...ranges[1]!, name: 'Bob', color: '#abcdef', clientId: 2 };
    const state = makeState([lock], { enabled: true });
    const ps = strictCoEditingKey.getState(state);
    expect(ps).toBeTruthy();
    // A node decoration on the locked paragraph + a badge widget.
    expect(ps!.decorations.find().length).toBeGreaterThanOrEqual(1);
  });

  test('disabling clears locks and re-allows edits', () => {
    const { ranges } = makeDoc();
    const lock: PeerLock = { ...ranges[1]!, name: 'Bob', color: '#0000ff', clientId: 2 };
    let state = makeState([lock], { enabled: true });
    expect(tryTypeAt(state, ranges[1]!.from + 1)).toBe(false);
    // Turn Strict off.
    let captured: Transaction | null = null;
    setStrictCoEditing(false)(state, (t) => (captured = t));
    state = state.apply(captured!);
    expect(isStrictCoEditingEnabled(state)).toBe(false);
    expect(peerLocks(state)).toHaveLength(0);
    expect(tryTypeAt(state, ranges[1]!.from + 1)).toBe(true);
  });
});
