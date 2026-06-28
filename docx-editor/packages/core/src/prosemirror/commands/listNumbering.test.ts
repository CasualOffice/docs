/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Unit tests for restartListNumbering / continueListNumbering.
 *
 * The renderer (`layout-bridge/toFlowBlocks.ts`) consumes
 * `listStartOverride` already; this suite pins the command-level
 * contract that the menu entries depend on.
 */

import { describe, test, expect } from 'bun:test';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { restartListNumbering, continueListNumbering } from './listNumbering';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      attrs: {
        numPr: { default: null },
        listStartOverride: { default: null },
      },
      toDOM: () => ['p', 0],
    },
    text: { group: 'inline' },
  },
});

function stateWithListPara(
  numPr: { numId: number; ilvl: number } | null,
  startOverride: number | null = null
): EditorState {
  const doc = schema.node('doc', null, [
    schema.node('paragraph', { numPr, listStartOverride: startOverride }, [schema.text('item')]),
  ]);
  return EditorState.create({ doc }).apply(
    EditorState.create({ doc }).tr.setSelection(TextSelection.create(doc, 1))
  );
}

function getParaAttrs(state: EditorState): Record<string, unknown> {
  return state.doc.firstChild!.attrs;
}

describe('restartListNumbering', () => {
  test('sets listStartOverride=1 on a numbered-list paragraph', () => {
    const state = stateWithListPara({ numId: 2, ilvl: 0 });
    let next = state;
    const ok = restartListNumbering(state, (tr) => {
      next = state.apply(tr);
    });
    expect(ok).toBe(true);
    expect(getParaAttrs(next).listStartOverride).toBe(1);
  });

  test('returns false when cursor is in a non-list paragraph', () => {
    const state = stateWithListPara(null);
    const ok = restartListNumbering(state, () => {
      throw new Error('dispatch should not run');
    });
    expect(ok).toBe(false);
  });

  test('preserves existing numPr when applying restart', () => {
    const state = stateWithListPara({ numId: 5, ilvl: 2 });
    let next = state;
    restartListNumbering(state, (tr) => {
      next = state.apply(tr);
    });
    const numPr = getParaAttrs(next).numPr as { numId: number; ilvl: number };
    expect(numPr.numId).toBe(5);
    expect(numPr.ilvl).toBe(2);
    expect(getParaAttrs(next).listStartOverride).toBe(1);
  });
});

describe('continueListNumbering', () => {
  test('clears an existing listStartOverride', () => {
    const state = stateWithListPara({ numId: 2, ilvl: 0 }, 1);
    let next = state;
    const ok = continueListNumbering(state, (tr) => {
      next = state.apply(tr);
    });
    expect(ok).toBe(true);
    expect(getParaAttrs(next).listStartOverride).toBeNull();
  });

  test('returns false when the paragraph has no override to clear', () => {
    const state = stateWithListPara({ numId: 2, ilvl: 0 }, null);
    const ok = continueListNumbering(state, () => {
      throw new Error('dispatch should not run');
    });
    expect(ok).toBe(false);
  });

  test('returns false on a non-paragraph selection', () => {
    // No paragraph attr — should bail out cleanly.
    const noListSchema = new Schema({
      nodes: {
        doc: { content: 'block+' },
        paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
        text: { group: 'inline' },
      },
    });
    const doc = noListSchema.node('doc', null, [
      noListSchema.node('paragraph', null, [noListSchema.text('x')]),
    ]);
    const state = EditorState.create({ doc });
    const ok = continueListNumbering(state, () => {});
    expect(ok).toBe(false);
  });
});
