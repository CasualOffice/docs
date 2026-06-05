import { describe, expect, it } from 'bun:test';
import { EditorState } from 'prosemirror-state';
import { Schema } from 'prosemirror-model';
import { READABILITY_PLUGIN_KEY, readabilityPlugin } from './readabilityPlugin';

// Minimal PM schema — just doc + paragraph + text — enough for the
// long-sentence walker. Real fork uses a richer schema; the plugin
// only consults paragraph + text nodes so a stub works for unit
// coverage.
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
  },
});

function stateWith(paragraphs: string[]): EditorState {
  const para = schema.nodes.paragraph;
  const doc = schema.nodes.doc.create(
    null,
    paragraphs.map((t) => para.create(null, t ? schema.text(t) : null))
  );
  return EditorState.create({
    schema,
    doc,
    plugins: [readabilityPlugin(true)],
  });
}

describe('readabilityPlugin', () => {
  it('produces zero decorations for short sentences', () => {
    const state = stateWith(['Hello world. Another short one.']);
    const dec = READABILITY_PLUGIN_KEY.getState(state)!.decorations;
    expect(dec.find().length).toBe(0);
  });

  it('flags a 30-word sentence', () => {
    const long = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ') + '.';
    const state = stateWith([long]);
    const dec = READABILITY_PLUGIN_KEY.getState(state)!.decorations;
    expect(dec.find().length).toBe(1);
  });

  it('does not flag a 25-word sentence (boundary)', () => {
    const at = Array.from({ length: 25 }, (_, i) => `word${i}`).join(' ') + '.';
    const state = stateWith([at]);
    const dec = READABILITY_PLUGIN_KEY.getState(state)!.decorations;
    expect(dec.find().length).toBe(0);
  });

  it('flags a 40-word sentence as long', () => {
    const veryLong = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ') + '.';
    const state = stateWith([veryLong]);
    const dec = READABILITY_PLUGIN_KEY.getState(state)!.decorations;
    expect(dec.find().length).toBe(1);
    // The very-long variant uses a different background colour but
    // PM's Decoration doesn't expose its spec publicly. The count
    // assertion already proves the walker flagged it; the visual
    // distinction is verified by inspection in Playwright /
    // screenshot tests, not here.
  });

  it('handles a paragraph with multiple sentences — flags only the long ones', () => {
    const short = 'Short one.';
    const long = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ') + '.';
    const state = stateWith([`${short} ${long} ${short}`]);
    const dec = READABILITY_PLUGIN_KEY.getState(state)!.decorations;
    expect(dec.find().length).toBe(1);
  });

  it('returns empty decorations when disabled', () => {
    const long = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ') + '.';
    const para = schema.nodes.paragraph;
    const doc = schema.nodes.doc.create(null, [para.create(null, schema.text(long))]);
    const state = EditorState.create({
      schema,
      doc,
      plugins: [readabilityPlugin(false)],
    });
    const dec = READABILITY_PLUGIN_KEY.getState(state)!.decorations;
    expect(dec.find().length).toBe(0);
  });
});
