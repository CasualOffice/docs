/**
 * SmartQuotesExtension — unit tests for the typographic substitutions.
 *
 * Tests the plugin's `handleTextInput` against a minimal mock view
 * (the input handler reads view.state + calls view.dispatch — no DOM).
 * Drives the test by simulating the same call PM makes when the user
 * types a character: handleTextInput(view, from, to, char).
 */

import { describe, test, expect } from 'bun:test';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { Plugin } from 'prosemirror-state';
import { SmartQuotesExtension } from './SmartQuotesExtension';

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
});

/** Build a fresh state with the given text + cursor at the end. */
function makeState(initialText: string): EditorState {
  const paragraph = initialText
    ? schema.nodes.paragraph.create(null, schema.text(initialText))
    : schema.nodes.paragraph.create();
  const doc = schema.topNodeType.create(null, [paragraph]);
  let state = EditorState.create({ doc, schema, plugins: getPlugins() });
  const end = doc.content.size - 1; // inside the paragraph
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, end)));
  return state;
}

function getPlugins(): Plugin[] {
  // createExtension returns a factory; call it to get the
  // configured extension instance, then invoke its onSchemaReady
  // with a minimal ctx (SmartQuotes doesn't read anything from
  // manager, schema, or options).
  const ext = SmartQuotesExtension();
  const runtime = ext.onSchemaReady({ schema, manager: null as never } as never);
  return runtime.plugins ?? [];
}

/** Replay the typed-character path against a state: returns next state. */
function type(state: EditorState, ch: string): EditorState {
  const { from, to } = state.selection;
  // Build a mock view exposing state + a dispatch that captures the
  // transaction so we can apply it.
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
  // Fall through: insert as-is, mirroring PM's default behaviour.
  return state.apply(state.tr.insertText(ch, from, to));
}

function text(state: EditorState): string {
  return state.doc.textContent;
}

describe('SmartQuotesExtension', () => {
  test('replaces leading " with opening curly double quote', () => {
    let s = makeState('');
    s = type(s, '"');
    expect(text(s)).toBe('“');
  });

  test('replaces trailing " (after a word) with closing curly double quote', () => {
    let s = makeState('Hello');
    s = type(s, '"');
    expect(text(s)).toBe('Hello”');
  });

  test('opens after whitespace, closes after word — full sentence', () => {
    let s = makeState('');
    for (const ch of 'He said "hi"') s = type(s, ch);
    expect(text(s)).toBe('He said “hi”');
  });

  test('apostrophe inside word becomes curly closing single quote', () => {
    let s = makeState('don');
    s = type(s, "'");
    s = type(s, 't');
    expect(text(s)).toBe('don’t');
  });

  test('-- collapses into em dash', () => {
    let s = makeState('hi-');
    s = type(s, '-');
    expect(text(s)).toBe('hi—');
  });

  test('... collapses into ellipsis', () => {
    let s = makeState('wait..');
    s = type(s, '.');
    expect(text(s)).toBe('wait…');
  });

  test('single - does not become em dash by itself', () => {
    let s = makeState('foo');
    s = type(s, '-');
    expect(text(s)).toBe('foo-');
  });

  test('two . do not become ellipsis until the third', () => {
    let s = makeState('huh');
    s = type(s, '.');
    s = type(s, '.');
    expect(text(s)).toBe('huh..');
    s = type(s, '.');
    expect(text(s)).toBe('huh…');
  });
});
