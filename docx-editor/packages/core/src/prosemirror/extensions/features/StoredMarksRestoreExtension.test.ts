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

describe('StoredMarksRestoreExtension', () => {
  test('restores bold storedMarks from defaultTextFormatting on selection-change', () => {
    const state = createEmptyParagraphState({ bold: true });
    // applying any transaction triggers appendTransaction; a no-op
    // SetSelection at the same position is enough.
    const next = state.apply(state.tr);
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
    const next = state.apply(state.tr);
    const names = next.storedMarks!.map((m) => m.type.name).sort();
    expect(names).toEqual(['bold', 'fontSize', 'italic']);
    const fs = next.storedMarks!.find((m) => m.type.name === 'fontSize');
    expect(fs!.attrs.size).toBe(28);
  });

  test('no-op when defaultTextFormatting is null', () => {
    const state = createEmptyParagraphState(null);
    const next = state.apply(state.tr);
    expect(next.storedMarks).toBeNull();
  });

  test('no-op when paragraph has text content', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', { defaultTextFormatting: { bold: true } }, [schema.text('hi')]),
    ]);
    const state = EditorState.create({ doc, plugins: [plugin] }).apply(
      // place cursor inside the text
      EditorState.create({ doc, plugins: [plugin] }).tr.setSelection(TextSelection.create(doc, 2))
    );
    expect(state.storedMarks).toBeNull();
  });

  test('no-op when storedMarks is already populated', () => {
    const boldMark = schema.marks.bold.create();
    const state = createEmptyParagraphState({ italic: true });
    const tr = state.tr.setStoredMarks([boldMark]);
    const next = state.apply(tr);
    // The plugin's guard should leave the explicit storedMarks alone.
    expect(next.storedMarks).not.toBeNull();
    expect(next.storedMarks!.length).toBe(1);
    expect(next.storedMarks![0].type.name).toBe('bold');
  });

  test('does not infinite-loop: second apply produces stable storedMarks', () => {
    const state = createEmptyParagraphState({ bold: true });
    const a = state.apply(state.tr);
    const b = a.apply(a.tr);
    expect(b.storedMarks).not.toBeNull();
    expect(b.storedMarks!.length).toBe(1);
    expect(b.storedMarks![0].type.name).toBe('bold');
  });

  test('restored storedMarks apply to subsequent text input', () => {
    const state = createEmptyParagraphState({ bold: true });
    const a = state.apply(state.tr);
    // simulate text input at cursor — PM applies storedMarks to the
    // inserted text run automatically when storedMarks is non-null.
    const tr = a.tr.insertText('X');
    const next = a.apply(tr);
    const firstText = next.doc.firstChild!.firstChild!;
    expect(firstText.text).toBe('X');
    expect(firstText.marks.length).toBe(1);
    expect(firstText.marks[0].type.name).toBe('bold');
  });
});
