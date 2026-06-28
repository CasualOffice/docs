/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

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
import {
  toggleSmallCaps,
  toggleAllCaps,
  toggleHidden,
  toggleEmboss,
  toggleImprint,
  toggleTextShadow,
  toggleTextOutline,
  setCharacterAttrs,
} from './formatting';

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
    emboss: { toDOM: () => ['span', 0] },
    imprint: { toDOM: () => ['span', 0] },
    textShadow: { toDOM: () => ['span', 0] },
    textOutline: { toDOM: () => ['span', 0] },
    characterSpacing: {
      attrs: {
        spacing: { default: null },
        position: { default: null },
        scale: { default: null },
        kerning: { default: null },
      },
      toDOM: () => ['span', 0],
    },
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
  cmd:
    | typeof toggleSmallCaps
    | typeof toggleAllCaps
    | typeof toggleHidden
    | typeof toggleEmboss
    | typeof toggleImprint
    | typeof toggleTextShadow
    | typeof toggleTextOutline
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

describe('text effects (U3) — emboss / imprint / textShadow / textOutline', () => {
  // One representative test per mark — the wrapper shape mirrors
  // toggleSmallCaps / toggleAllCaps / toggleHidden which already have
  // full coverage above. We pin: applies on selection, toggles off,
  // coexists with the other three (all four can stack on one run).
  test.each([
    ['toggleEmboss', toggleEmboss, 'emboss'],
    ['toggleImprint', toggleImprint, 'imprint'],
    ['toggleTextShadow', toggleTextShadow, 'textShadow'],
    ['toggleTextOutline', toggleTextOutline, 'textOutline'],
  ] as const)('%s applies and toggles its mark', (_, cmd, markName) => {
    const a = apply(stateWithSelectedText('hello'), cmd);
    expect(hasMark(a, markName)).toBe(true);
    const b = apply(a, cmd);
    expect(hasMark(b, markName)).toBe(false);
  });

  test('all four effects coexist on the same selection', () => {
    const a = apply(stateWithSelectedText('hello'), toggleEmboss);
    const b = apply(a, toggleImprint);
    const c = apply(b, toggleTextShadow);
    const d = apply(c, toggleTextOutline);
    expect(hasMark(d, 'emboss')).toBe(true);
    expect(hasMark(d, 'imprint')).toBe(true);
    expect(hasMark(d, 'textShadow')).toBe(true);
    expect(hasMark(d, 'textOutline')).toBe(true);
  });

  test('each command returns false when its mark is missing from the schema', () => {
    const bareSchema = new Schema({
      nodes: {
        doc: { content: 'block+' },
        paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
        text: { group: 'inline' },
      },
      marks: {},
    });
    const doc = bareSchema.node('doc', null, [
      bareSchema.node('paragraph', null, [bareSchema.text('hello')]),
    ]);
    const state = EditorState.create({ doc });
    expect(toggleEmboss(state, () => {})).toBe(false);
    expect(toggleImprint(state, () => {})).toBe(false);
    expect(toggleTextShadow(state, () => {})).toBe(false);
    expect(toggleTextOutline(state, () => {})).toBe(false);
  });
});

describe('setCharacterAttrs (U1 — Character spacing dialog)', () => {
  function applyAttrs(
    state: EditorState,
    attrs: {
      spacing: number | null;
      position: number | null;
      scale: number | null;
      kerning: number | null;
    }
  ): EditorState {
    let next = state;
    setCharacterAttrs(attrs)(state, (tr) => {
      next = state.apply(tr);
    });
    return next;
  }

  function getMarkAttrs(state: EditorState): Record<string, unknown> | null {
    let attrs: Record<string, unknown> | null = null;
    state.doc.descendants((node) => {
      if (!node.isText) return;
      for (const m of node.marks) {
        if (m.type.name === 'characterSpacing') {
          attrs = m.attrs;
        }
      }
    });
    return attrs;
  }

  test('writes all four attrs in a single mark', () => {
    const next = applyAttrs(stateWithSelectedText('hello'), {
      spacing: 40,
      position: 4,
      scale: 90,
      kerning: 24,
    });
    expect(getMarkAttrs(next)).toEqual({
      spacing: 40,
      position: 4,
      scale: 90,
      kerning: 24,
    });
  });

  test('removes the mark when every field is null', () => {
    const a = applyAttrs(stateWithSelectedText('hello'), {
      spacing: 40,
      position: null,
      scale: null,
      kerning: null,
    });
    expect(getMarkAttrs(a)).not.toBeNull();
    const b = applyAttrs(a, { spacing: null, position: null, scale: null, kerning: null });
    expect(getMarkAttrs(b)).toBeNull();
  });

  test('replaces existing attrs (does not merge silently)', () => {
    const a = applyAttrs(stateWithSelectedText('hello'), {
      spacing: 40,
      position: 4,
      scale: 90,
      kerning: 24,
    });
    const b = applyAttrs(a, {
      spacing: null,
      position: null,
      scale: 110,
      kerning: null,
    });
    expect(getMarkAttrs(b)).toEqual({
      spacing: null,
      position: null,
      scale: 110,
      kerning: null,
    });
  });

  test('returns false when characterSpacing mark is missing from schema', () => {
    const bareSchema = new Schema({
      nodes: {
        doc: { content: 'block+' },
        paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
        text: { group: 'inline' },
      },
      marks: {},
    });
    const doc = bareSchema.node('doc', null, [
      bareSchema.node('paragraph', null, [bareSchema.text('hello')]),
    ]);
    const state = EditorState.create({ doc });
    const result = setCharacterAttrs({
      spacing: 10,
      position: null,
      scale: null,
      kerning: null,
    })(state, () => {});
    expect(result).toBe(false);
  });
});
