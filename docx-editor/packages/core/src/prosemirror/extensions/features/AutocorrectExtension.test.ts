/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * AutocorrectExtension — symbol sequences + common-typo dictionary.
 * Drives the plugin's handleTextInput against a mock view (no DOM),
 * same harness shape as SmartQuotesExtension.test.ts.
 */

import { describe, test, expect } from 'bun:test';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { Plugin } from 'prosemirror-state';
import { AutocorrectExtension } from './AutocorrectExtension';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
  },
});

function getPlugins(): Plugin[] {
  const ext = AutocorrectExtension();
  const runtime = ext.onSchemaReady({ schema, manager: null as never } as never);
  return runtime.plugins ?? [];
}

function makeState(initialText: string): EditorState {
  const paragraph = initialText
    ? schema.nodes.paragraph.create(null, schema.text(initialText))
    : schema.nodes.paragraph.create();
  const doc = schema.topNodeType.create(null, [paragraph]);
  let state = EditorState.create({ doc, schema, plugins: getPlugins() });
  const end = doc.content.size - 1;
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, end)));
  return state;
}

function type(state: EditorState, ch: string): EditorState {
  const { from, to } = state.selection;
  let captured: Transaction | null = null;
  const view = {
    state,
    dispatch(tr: Transaction): void {
      captured = tr;
    },
  };
  let handled = false;
  for (const plugin of getPlugins()) {
    const h = plugin.props.handleTextInput as
      | ((view: unknown, from: number, to: number, text: string) => boolean)
      | undefined;
    if (!h) continue;
    if (h(view, from, to, ch)) {
      handled = true;
      break;
    }
  }
  if (handled && captured) return state.apply(captured);
  return state.apply(state.tr.insertText(ch, from, to));
}

function text(state: EditorState): string {
  return state.doc.textContent;
}

describe('AutocorrectExtension — symbols', () => {
  test('(c) becomes ©', () => {
    let s = makeState('(c');
    s = type(s, ')');
    expect(text(s)).toBe('©');
  });

  test('(tm) becomes ™', () => {
    let s = makeState('hello (tm');
    s = type(s, ')');
    expect(text(s)).toBe('hello ™');
  });

  test('--> becomes →', () => {
    let s = makeState('go --');
    s = type(s, '>');
    expect(text(s)).toBe('go →');
  });

  test('<-- becomes ←', () => {
    let s = makeState('back <-');
    s = type(s, '-');
    expect(text(s)).toBe('back ←');
  });

  test('plain text with no sequence is untouched', () => {
    let s = makeState('abc');
    s = type(s, 'd');
    expect(text(s)).toBe('abcd');
  });
});

describe('AutocorrectExtension — typo dictionary', () => {
  test('teh + space becomes the', () => {
    let s = makeState('teh');
    s = type(s, ' ');
    expect(text(s)).toBe('the ');
  });

  test('leading case preserved: Teh → The', () => {
    let s = makeState('Teh');
    s = type(s, ' ');
    expect(text(s)).toBe('The ');
  });

  test('correction fires mid-sentence', () => {
    let s = makeState('I adn');
    s = type(s, ' ');
    expect(text(s)).toBe('I and ');
  });

  test('non-typo word is left alone', () => {
    let s = makeState('cat');
    s = type(s, ' ');
    expect(text(s)).toBe('cat ');
  });

  test('typo only corrects on word boundary, not mid-word', () => {
    let s = makeState('teh');
    s = type(s, 'x'); // still typing — no boundary yet
    expect(text(s)).toBe('tehx');
  });

  test('multi-word expansion: alot → a lot', () => {
    let s = makeState('alot');
    s = type(s, ' ');
    expect(text(s)).toBe('a lot ');
  });
});
