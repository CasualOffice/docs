/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Unit tests for buildVersionDiffDoc — the version-to-version diff that
 * annotates the selected version's doc with insertion / deletion marks
 * for the in-canvas "show changes" preview.
 */
import { describe, test, expect } from 'bun:test';
import { Schema, type Node as PMNode } from 'prosemirror-model';
import { buildVersionDiffDoc } from './versionDiff';

// Minimal schema mirroring the real insertion/deletion mark attrs.
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
  },
  marks: {
    insertion: {
      attrs: { revisionId: { default: 0 }, author: { default: '' }, date: { default: null } },
      toDOM: () => ['ins', 0],
    },
    deletion: {
      attrs: { revisionId: { default: 0 }, author: { default: '' }, date: { default: null } },
      toDOM: () => ['del', 0],
    },
  },
});

function docJSON(...paragraphs: string[]): unknown {
  return {
    type: 'doc',
    content: paragraphs.map((t) => ({
      type: 'paragraph',
      content: t ? [{ type: 'text', text: t }] : [],
    })),
  };
}

/** Collect text covered by a given mark name. */
function markedText(doc: PMNode, markName: string): string {
  let out = '';
  doc.descendants((node) => {
    if (node.isText && node.marks.some((m) => m.type.name === markName)) {
      out += node.text;
    }
  });
  return out;
}

function plainText(doc: PMNode): string {
  let out = '';
  doc.descendants((node) => {
    if (node.isText) out += node.text;
  });
  return out;
}

/** Index of the top-level block that contains the deletion mark (or -1). */
function deletionBlockIndex(doc: PMNode): number {
  let idx = -1;
  doc.forEach((block, _offset, i) => {
    if (idx !== -1) return;
    block.descendants((n) => {
      if (n.isText && n.marks.some((m) => m.type.name === 'deletion')) idx = i;
    });
  });
  return idx;
}

describe('buildVersionDiffDoc', () => {
  test('no previous version → clean doc, no changes', () => {
    const { doc, hasChanges } = buildVersionDiffDoc(null, docJSON('hello world'), schema);
    expect(hasChanges).toBe(false);
    expect(markedText(doc, 'insertion')).toBe('');
    expect(markedText(doc, 'deletion')).toBe('');
  });

  test('identical docs → no changes', () => {
    const a = docJSON('hello world');
    const { hasChanges } = buildVersionDiffDoc(a, docJSON('hello world'), schema);
    expect(hasChanges).toBe(false);
  });

  test('appended text → marked as insertion', () => {
    const { doc, hasChanges } = buildVersionDiffDoc(
      docJSON('hello world'),
      docJSON('hello world again'),
      schema
    );
    expect(hasChanges).toBe(true);
    expect(markedText(doc, 'insertion')).toContain('again');
    // Unchanged words are NOT marked.
    expect(markedText(doc, 'insertion')).not.toContain('hello');
  });

  test('removed text → re-inserted with deletion mark', () => {
    const { doc, hasChanges } = buildVersionDiffDoc(
      docJSON('hello cruel world'),
      docJSON('hello world'),
      schema
    );
    expect(hasChanges).toBe(true);
    expect(markedText(doc, 'deletion')).toContain('cruel');
    // The surviving text is present and unmarked-as-deletion.
    expect(plainText(doc)).toContain('hello');
    expect(plainText(doc)).toContain('world');
  });

  test('replacement → insertion + deletion', () => {
    const { doc } = buildVersionDiffDoc(
      docJSON('the quick brown fox'),
      docJSON('the slow brown fox'),
      schema
    );
    expect(markedText(doc, 'insertion')).toContain('slow');
    expect(markedText(doc, 'deletion')).toContain('quick');
  });

  test('author is stamped on the marks', () => {
    const { doc } = buildVersionDiffDoc(docJSON('a'), docJSON('a b'), schema, { author: 'Alice' });
    let found = false;
    doc.descendants((node) => {
      for (const m of node.marks) {
        if (m.type.name === 'insertion' && m.attrs.author === 'Alice') found = true;
      }
    });
    expect(found).toBe(true);
  });

  test('new paragraph → its words marked as insertion', () => {
    const { doc, hasChanges } = buildVersionDiffDoc(
      docJSON('first para'),
      docJSON('first para', 'second para'),
      schema
    );
    expect(hasChanges).toBe(true);
    expect(markedText(doc, 'insertion')).toContain('second');
  });

  test('erased trailing words stay struck through in their own paragraph, not dumped at doc end', () => {
    // Regression: deleting the end of a paragraph (the paragraph break is
    // kept) used to anchor the struck-through text at docEnd, so it appeared
    // at the very bottom of the document instead of in place.
    const { doc, hasChanges } = buildVersionDiffDoc(
      docJSON('hello world', 'second para'),
      docJSON('hello', 'second para'),
      schema
    );
    expect(hasChanges).toBe(true);
    expect(markedText(doc, 'deletion')).toContain('world');
    // The deletion belongs to the FIRST paragraph, not the last.
    expect(deletionBlockIndex(doc)).toBe(0);
    // The last paragraph is untouched.
    const lastBlock = doc.child(doc.childCount - 1);
    expect(lastBlock.textContent).toBe('second para');
  });

  test('preview doc preserves the selected version content', () => {
    const { doc } = buildVersionDiffDoc(docJSON('one two'), docJSON('one two three'), schema);
    // Every word of the selected version survives in the preview.
    expect(plainText(doc)).toContain('one');
    expect(plainText(doc)).toContain('two');
    expect(plainText(doc)).toContain('three');
  });
});
