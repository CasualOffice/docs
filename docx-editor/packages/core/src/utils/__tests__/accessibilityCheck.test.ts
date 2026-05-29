/**
 * Unit tests for checkAccessibility — heading-jump + missing-alt detection.
 */

import { describe, test, expect } from 'bun:test';
import { Schema, type Node as PMNode } from 'prosemirror-model';
import { checkAccessibility } from '../accessibilityCheck';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      attrs: {
        outlineLevel: { default: null }, // 0 = H1, 1 = H2, ...
        styleId: { default: null },
      },
      toDOM: () => ['p', 0],
    },
    image: {
      group: 'inline',
      inline: true,
      atom: true,
      attrs: {
        src: { default: '' },
        alt: { default: null },
      },
      toDOM: () => ['img'],
    },
    text: { group: 'inline' },
  },
});

function heading(level: number, text: string): PMNode {
  return schema.node(
    'paragraph',
    { outlineLevel: level - 1 }, // 1-indexed → 0-indexed
    text ? [schema.text(text)] : []
  );
}

function para(text: string): PMNode {
  return schema.node('paragraph', null, text ? [schema.text(text)] : []);
}

function paraWithImage(alt: string | null): PMNode {
  return schema.node('paragraph', null, [schema.node('image', { src: 'foo.png', alt })]);
}

function doc(...blocks: PMNode[]): PMNode {
  return schema.node('doc', null, blocks);
}

describe('checkAccessibility', () => {
  test('empty doc → no issues', () => {
    const d = doc(para(''));
    expect(checkAccessibility(d)).toEqual([]);
  });

  test('plain prose, no headings, no images → no issues', () => {
    const d = doc(para('Plain prose.'), para('More prose.'));
    expect(checkAccessibility(d)).toEqual([]);
  });

  test('well-ordered headings (H1 → H2 → H3) → no issues', () => {
    const d = doc(heading(1, 'Intro'), heading(2, 'Sub'), heading(3, 'Deeper'));
    expect(checkAccessibility(d)).toEqual([]);
  });

  test('going shallower is fine (H3 → H1 → H2) → no issues', () => {
    // Closing a section is normal — only going *deeper* by >1 is a jump.
    const d = doc(heading(3, 'A'), heading(1, 'B'), heading(2, 'C'));
    expect(checkAccessibility(d)).toEqual([]);
  });

  test('H1 → H3 (skips H2) → one heading-jump issue', () => {
    const d = doc(heading(1, 'Intro'), heading(3, 'Detail'));
    const issues = checkAccessibility(d);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      kind: 'heading-jump',
      previousLevel: 1,
      level: 3,
      text: 'Detail',
    });
  });

  test('H1 → H4 (skips two) → one heading-jump issue with level=4', () => {
    const d = doc(heading(1, 'Intro'), heading(4, 'Deep'));
    const issues = checkAccessibility(d);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ kind: 'heading-jump', previousLevel: 1, level: 4 });
  });

  test('image with empty alt → missing-alt issue', () => {
    const d = doc(paraWithImage(''));
    const issues = checkAccessibility(d);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('missing-alt');
  });

  test('image with null alt → missing-alt issue', () => {
    const d = doc(paraWithImage(null));
    const issues = checkAccessibility(d);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('missing-alt');
  });

  test('image with non-empty alt → no issue', () => {
    const d = doc(paraWithImage('A red apple on a table.'));
    expect(checkAccessibility(d)).toEqual([]);
  });

  test('mixed: heading jump + missing-alt → both issues reported', () => {
    const d = doc(heading(1, 'Intro'), paraWithImage(null), heading(3, 'Skip'));
    const issues = checkAccessibility(d);
    expect(issues).toHaveLength(2);
    expect(issues.some((i) => i.kind === 'missing-alt')).toBe(true);
    expect(issues.some((i) => i.kind === 'heading-jump')).toBe(true);
  });
});
