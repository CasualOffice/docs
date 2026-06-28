/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Unit tests for StoredMarksRestoreExtension.
 *
 * The plugin re-hydrates `state.storedMarks` from a paragraph's
 * `defaultTextFormatting` whenever the cursor ends up in an empty
 * paragraph with no storedMarks but a non-null dtf. The integration
 * scenario this guards against — select-all + Backspace strips
 * storedMarks but leaves dtf intact — is covered by e2e tests; here we
 * drive the plugin directly to verify the state machine.
 */

import { describe, test, expect } from 'bun:test';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { StoredMarksRestoreExtension } from './StoredMarksRestoreExtension';
import { ExtensionManager } from '../ExtensionManager';
import type { TextFormatting } from '../../../types/document';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      attrs: {
        defaultTextFormatting: { default: null },
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
    italic: {
      parseDOM: [{ tag: 'em' }],
      toDOM() {
        return ['em', 0];
      },
    },
    fontSize: {
      attrs: { size: {} },
      parseDOM: [{ tag: 'span[data-size]' }],
      toDOM(mark) {
        return ['span', { 'data-size': mark.attrs.size }, 0];
      },
    },
  },
});

const ext = StoredMarksRestoreExtension();
const manager = new ExtensionManager([]);
const runtime = ext.onSchemaReady({ schema, manager });
const plugin = runtime.plugins![0];

function createEmptyParagraphState(dtf: TextFormatting | null): EditorState {
  const doc = schema.node('doc', null, [
    schema.node('paragraph', { defaultTextFormatting: dtf }, []),
  ]);
  const state = EditorState.create({ doc, plugins: [plugin] });
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1)));
}

// Helper that mimics the real "select-all + Backspace" path: types text
// then deletes it, leaving a doc-changing tx in the transaction list.
// The plugin only fires after doc-changing txs (gate added 2026-05-25
// to fix the table-more click race — see plugin source for rationale).
function applyDeleteToEmpty(state: EditorState): EditorState {
  // Insert text then delete it to produce a doc-changing tx that
  // leaves the paragraph empty + the selection collapsed at the start.
  const withText = state.apply(state.tr.insertText('x'));
  const afterDelete = withText.apply(withText.tr.delete(1, 2));
  return afterDelete;
}

describe('StoredMarksRestoreExtension', () => {
  test('restores bold storedMarks from defaultTextFormatting after a doc-changing tx empties the paragraph', () => {
    const state = createEmptyParagraphState({ bold: true });
    const next = applyDeleteToEmpty(state);
    expect(next.storedMarks).not.toBeNull();
    expect(next.storedMarks!.length).toBe(1);
    expect(next.storedMarks![0].type.name).toBe('bold');
  });

  test('restores combined bold + italic + fontSize from defaultTextFormatting', () => {
    const state = createEmptyParagraphState({
      bold: true,
      italic: true,
      fontSize: 28,
    });
    const next = applyDeleteToEmpty(state);
    const names = next.storedMarks!.map((m) => m.type.name).sort();
    expect(names).toEqual(['bold', 'fontSize', 'italic']);
    const fs = next.storedMarks!.find((m) => m.type.name === 'fontSize');
    expect(fs!.attrs.size).toBe(28);
  });

  test('no-op when defaultTextFormatting is null', () => {
    const state = createEmptyParagraphState(null);
    const next = applyDeleteToEmpty(state);
    expect(next.storedMarks).toBeNull();
  });

  test('also restores on a selection-only transaction (Linux CI fix)', () => {
    // The plugin must fire on selection-only txs too — PM clears
    // storedMarks on selection changes, so a focus / browser-sync tx
    // that fires after the delete would otherwise wipe the marks we
    // set on the delete tx. The empirical evidence was Linux CI's
    // P2 #19 e2e suite failing: on Linux, a follow-up selection tx
    // landed after the Backspace and cleared storedMarks before
    // typeText ran. macOS didn't surface this because the tx
    // sequencing was different.
    //
    // Infinite-loop safety: the storedMarks-already-populated guard
    // at the top short-circuits the next round-trip after we set
    // them, so this can't recurse.
    const state = createEmptyParagraphState({ bold: true });
    const next = state.apply(state.tr); // selection-only no-op tx
    expect(next.storedMarks).not.toBeNull();
    expect(next.storedMarks!.length).toBe(1);
    expect(next.storedMarks![0].type.name).toBe('bold');
  });

  test('no-op when paragraph has text content', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', { defaultTextFormatting: { bold: true } }, [schema.text('hi')]),
    ]);
    const state = EditorState.create({ doc, plugins: [plugin] });
    // Delete one char of "hi" → doc-changing tx, but para still has content.
    const next = state.apply(state.tr.delete(1, 2));
    expect(next.storedMarks).toBeNull();
  });

  test('no-op when storedMarks is already populated', () => {
    const boldMark = schema.marks.bold.create();
    const state = createEmptyParagraphState({ italic: true });
    // Doc-changing tx with explicit storedMarks override.
    const tr = state.tr.insertText('x').delete(1, 2).setStoredMarks([boldMark]);
    const next = state.apply(tr);
    expect(next.storedMarks).not.toBeNull();
    expect(next.storedMarks!.length).toBe(1);
    expect(next.storedMarks![0].type.name).toBe('bold');
  });

  test('does not infinite-loop: a second apply on the result is a no-op', () => {
    const state = createEmptyParagraphState({ bold: true });
    const a = applyDeleteToEmpty(state);
    // Second apply is a selection-only tx — plugin must not re-fire.
    const b = a.apply(a.tr);
    expect(b.storedMarks).not.toBeNull();
    expect(b.storedMarks!.length).toBe(1);
    expect(b.storedMarks![0].type.name).toBe('bold');
  });

  test('restored storedMarks apply to subsequent text input', () => {
    const state = createEmptyParagraphState({ bold: true });
    const a = applyDeleteToEmpty(state);
    const tr = a.tr.insertText('X');
    const next = a.apply(tr);
    const firstText = next.doc.firstChild!.firstChild!;
    expect(firstText.text).toBe('X');
    expect(firstText.marks.length).toBe(1);
    expect(firstText.marks[0].type.name).toBe('bold');
  });
});
