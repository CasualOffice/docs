/**
 * Unit tests for setMark / removeMark
 *
 * Regression: previously these called setStoredMarks BEFORE setNodeMarkup.
 * ProseMirror's Transaction.addStep clears storedMarks on every step, so
 * the stored marks were wiped before dispatch — the user's font/size/color
 * choice in an empty paragraph silently dropped, and typed text fell back
 * to the editor default. This test pins the correct ordering.
 */

import { describe, test, expect } from 'bun:test';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { setMark, removeMark } from './markUtils';

// Includes a nested-block container (table cell) so we can verify that the
// "paragraph inside a wrapper" shape — same shape as header/footer content
// and table-cell paragraphs — also gets the storedMarks fix.
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
    tableCell: {
      group: 'block',
      content: 'paragraph+',
      toDOM: () => ['td', 0],
    },
    text: { group: 'inline' },
  },
  marks: {
    fontFamily: {
      attrs: {
        ascii: { default: null },
        hAnsi: { default: null },
      },
      toDOM: () => ['span', 0],
    },
    fontSize: {
      attrs: { size: { default: 24 } },
      toDOM: () => ['span', 0],
    },
    textColor: {
      attrs: {
        rgb: { default: null },
        themeColor: { default: null },
        themeTint: { default: null },
        themeShade: { default: null },
      },
      toDOM: () => ['span', 0],
    },
    bold: { toDOM: () => ['strong', 0] },
  },
});

function createEmptyParaState() {
  const doc = schema.node('doc', null, [schema.node('paragraph', null, [])]);
  let state = EditorState.create({ doc });
  // Cursor inside the empty paragraph (pos 1 = inside para).
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1)));
  return state;
}

function applyCommand(state: EditorState, cmd: ReturnType<typeof setMark>): EditorState {
  let next = state;
  cmd(state, (tr) => {
    next = state.apply(tr);
  });
  return next;
}

describe('setMark on empty paragraph', () => {
  // Each style mark type goes through the same setMark code path; pin them all
  // so a regression on any one (font/size/color) is caught with a clear failure.
  const cases = [
    {
      markName: 'fontFamily',
      attrs: { ascii: 'Georgia', hAnsi: 'Georgia' },
      expectAttr: 'ascii',
      expectValue: 'Georgia',
    },
    { markName: 'fontSize', attrs: { size: 48 }, expectAttr: 'size', expectValue: 48 },
    { markName: 'textColor', attrs: { rgb: 'FF0000' }, expectAttr: 'rgb', expectValue: 'FF0000' },
  ] as const;

  for (const { markName, attrs, expectAttr, expectValue } of cases) {
    test(`storedMarks survive after dispatch (${markName})`, () => {
      const next = applyCommand(createEmptyParaState(), setMark(schema.marks[markName], attrs));

      expect(next.storedMarks).not.toBeNull();
      expect(next.storedMarks!.length).toBe(1);
      expect(next.storedMarks![0].type.name).toBe(markName);
      expect(next.storedMarks![0].attrs[expectAttr]).toBe(expectValue);
    });
  }

  test('paragraph defaultTextFormatting reflects the stored mark', () => {
    const next = applyCommand(
      createEmptyParaState(),
      setMark(schema.marks.fontFamily, { ascii: 'Verdana', hAnsi: 'Verdana' })
    );

    expect(next.doc.firstChild!.attrs.defaultTextFormatting).toEqual({
      fontFamily: { ascii: 'Verdana', hAnsi: 'Verdana' },
    });
  });

  test('multiple setMark calls accumulate stored marks', () => {
    let state = createEmptyParaState();
    state = applyCommand(
      state,
      setMark(schema.marks.fontFamily, { ascii: 'Georgia', hAnsi: 'Georgia' })
    );
    state = applyCommand(state, setMark(schema.marks.fontSize, { size: 48 }));
    state = applyCommand(state, setMark(schema.marks.textColor, { rgb: '0000FF' }));

    const names = state.storedMarks!.map((m) => m.type.name).sort();
    expect(names).toEqual(['fontFamily', 'fontSize', 'textColor']);

    expect(state.doc.firstChild!.attrs.defaultTextFormatting).toEqual({
      fontFamily: { ascii: 'Georgia', hAnsi: 'Georgia' },
      fontSize: 48,
      color: { rgb: '0000FF', themeColor: null, themeTint: null, themeShade: null },
    });
  });

  test('replacing a mark of the same type updates the stored value', () => {
    let state = createEmptyParaState();
    state = applyCommand(
      state,
      setMark(schema.marks.fontFamily, { ascii: 'Georgia', hAnsi: 'Georgia' })
    );
    state = applyCommand(
      state,
      setMark(schema.marks.fontFamily, { ascii: 'Verdana', hAnsi: 'Verdana' })
    );

    expect(state.storedMarks!.length).toBe(1);
    expect(state.storedMarks![0].attrs.ascii).toBe('Verdana');
  });
});

describe('removeMark on empty paragraph', () => {
  test('clears the mark from storedMarks while preserving siblings', () => {
    let state = createEmptyParaState();
    state = applyCommand(
      state,
      setMark(schema.marks.fontFamily, { ascii: 'Georgia', hAnsi: 'Georgia' })
    );
    state = applyCommand(state, setMark(schema.marks.fontSize, { size: 48 }));
    state = applyCommand(state, removeMark(schema.marks.fontFamily));

    expect(state.storedMarks!.length).toBe(1);
    expect(state.storedMarks![0].type.name).toBe('fontSize');
    expect(state.doc.firstChild!.attrs.defaultTextFormatting).toEqual({ fontSize: 48 });
  });

  test('removing the last mark clears defaultTextFormatting', () => {
    let state = createEmptyParaState();
    state = applyCommand(
      state,
      setMark(schema.marks.fontFamily, { ascii: 'Georgia', hAnsi: 'Georgia' })
    );
    state = applyCommand(state, removeMark(schema.marks.fontFamily));

    expect(state.storedMarks!.length).toBe(0);
    expect(state.doc.firstChild!.attrs.defaultTextFormatting).toBeNull();
  });
});

describe('setMark on paragraph nested inside a wrapper block', () => {
  // Same shape as table-cell paragraphs and header/footer-editor paragraphs
  // (each is a separate EditorView using the same StarterKit extensions).
  // $from.before() must point at the inner paragraph, not the wrapper —
  // otherwise setNodeMarkup would patch the wrong node.
  function createNestedEmptyParaState() {
    const doc = schema.node('doc', null, [
      schema.node('tableCell', null, [schema.node('paragraph', null, [])]),
    ]);
    let state = EditorState.create({ doc });
    // pos 2 = inside the inner paragraph (1 enters tableCell, 1 enters paragraph).
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)));
    return state;
  }

  test('storedMarks survive and inner paragraph attrs update', () => {
    const next = applyCommand(
      createNestedEmptyParaState(),
      setMark(schema.marks.fontFamily, { ascii: 'Georgia', hAnsi: 'Georgia' })
    );

    expect(next.storedMarks).not.toBeNull();
    expect(next.storedMarks!.length).toBe(1);
    expect(next.storedMarks![0].attrs.ascii).toBe('Georgia');

    const cell = next.doc.firstChild!;
    expect(cell.type.name).toBe('tableCell');
    const para = cell.firstChild!;
    expect(para.type.name).toBe('paragraph');
    expect(para.attrs.defaultTextFormatting).toEqual({
      fontFamily: { ascii: 'Georgia', hAnsi: 'Georgia' },
    });
  });
});
