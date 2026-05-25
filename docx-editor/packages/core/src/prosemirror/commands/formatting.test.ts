/**
 * Unit tests for the lightweight mark-toggle commands surfaced by
 * Phase 1.5 (toggleSmallCaps, toggleAllCaps, toggleHidden). The
 * underlying `toggleMark` helper has its own coverage; this suite
 * pins the wrapper-level "does it find the mark by schema name and
 * apply it to a selection?" contract that the toolbar / menu entries
 * depend on.
 */

import { describe, test, expect } from 'bun:test';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { toggleSmallCaps, toggleAllCaps, toggleHidden } from './formatting';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      toDOM: () => ['p', 0],
    },
    text: { group: 'inline' },
  },
  marks: {
    smallCaps: { toDOM: () => ['span', 0] },
    allCaps: { toDOM: () => ['span', 0] },
    hidden: { toDOM: () => ['span', 0] },
  },
});

function stateWithSelectedText(text: string): EditorState {
  const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text(text)])]);
  let state = EditorState.create({ doc });
  // Select the entire text node.
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 1 + text.length)));
  return state;
}

function apply(
  state: EditorState,
  cmd: typeof toggleSmallCaps | typeof toggleAllCaps | typeof toggleHidden
): EditorState {
  let next = state;
  cmd(state, (tr) => {
    next = state.apply(tr);
  });
  return next;
}

function hasMark(state: EditorState, markName: string): boolean {
  let found = false;
  state.doc.descendants((node) => {
    if (node.isText) {
      for (const m of node.marks) {
        if (m.type.name === markName) {
          found = true;
        }
      }
    }
  });
  return found;
}

describe('toggleSmallCaps', () => {
  test('applies smallCaps mark on a fresh selection', () => {
    const next = apply(stateWithSelectedText('hello'), toggleSmallCaps);
    expect(hasMark(next, 'smallCaps')).toBe(true);
  });

  test('toggles smallCaps off on a second invocation', () => {
    const a = apply(stateWithSelectedText('hello'), toggleSmallCaps);
    const b = apply(a, toggleSmallCaps);
    expect(hasMark(b, 'smallCaps')).toBe(false);
  });
});

describe('toggleAllCaps', () => {
  test('applies allCaps mark on a fresh selection', () => {
    const next = apply(stateWithSelectedText('hello'), toggleAllCaps);
    expect(hasMark(next, 'allCaps')).toBe(true);
  });

  test('does not collide with smallCaps — both can coexist', () => {
    const a = apply(stateWithSelectedText('hello'), toggleSmallCaps);
    const b = apply(a, toggleAllCaps);
    expect(hasMark(b, 'smallCaps')).toBe(true);
    expect(hasMark(b, 'allCaps')).toBe(true);
  });
});

describe('toggleHidden', () => {
  test('applies hidden mark on a fresh selection', () => {
    const next = apply(stateWithSelectedText('hello'), toggleHidden);
    expect(hasMark(next, 'hidden')).toBe(true);
  });

  test('toggles hidden off on a second invocation', () => {
    const a = apply(stateWithSelectedText('hello'), toggleHidden);
    const b = apply(a, toggleHidden);
    expect(hasMark(b, 'hidden')).toBe(false);
  });

  test('coexists with smallCaps / allCaps on the same selection', () => {
    const a = apply(stateWithSelectedText('hello'), toggleHidden);
    const b = apply(a, toggleSmallCaps);
    const c = apply(b, toggleAllCaps);
    expect(hasMark(c, 'hidden')).toBe(true);
    expect(hasMark(c, 'smallCaps')).toBe(true);
    expect(hasMark(c, 'allCaps')).toBe(true);
  });

  test('returns false when the schema has no hidden mark', () => {
    const noHiddenSchema = new Schema({
      nodes: {
        doc: { content: 'block+' },
        paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
        text: { group: 'inline' },
      },
      marks: {},
    });
    const doc = noHiddenSchema.node('doc', null, [
      noHiddenSchema.node('paragraph', null, [noHiddenSchema.text('hello')]),
    ]);
    const state = EditorState.create({ doc });
    const result = toggleHidden(state, () => {});
    expect(result).toBe(false);
  });
});
