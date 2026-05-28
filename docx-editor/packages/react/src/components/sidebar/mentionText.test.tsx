/**
 * renderCommentText — chips @-mentions only when the trailing name
 * matches a known author. Tests cover the boundary rules + email
 * guard documented in the source.
 */

import { describe, test, expect } from 'bun:test';
import { renderCommentText } from './mentionText';
import { isValidElement, type ReactNode } from 'react';

/**
 * Flatten the rendered output into a tagged string so the tests
 * can assert structure without a renderer. Plain strings get
 * passed through; chip elements become `[@Name]`.
 */
function flatten(node: ReactNode): string {
  if (node == null || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flatten).join('');
  if (isValidElement(node)) {
    const props = (node as { props?: { children?: ReactNode } }).props ?? {};
    const inner = flatten(props.children);
    // A chip's child is the literal "@Name" string (no further
    // nesting), so collapse to `[Name]` for the assertion.
    if (inner.startsWith('@')) return `[${inner.slice(1)}]`;
    return inner;
  }
  return '';
}

describe('renderCommentText', () => {
  test('returns plain text when there are no @-mentions', () => {
    expect(flatten(renderCommentText('hello world', ['Alice']))).toBe('hello world');
  });

  test('chips a single @-mention at the start', () => {
    expect(flatten(renderCommentText('@Alice please look', ['Alice']))).toBe(
      '[Alice] please look'
    );
  });

  test('chips a mention mid-text after whitespace', () => {
    expect(flatten(renderCommentText('hi @Bob can you check', ['Alice', 'Bob']))).toBe(
      'hi [Bob] can you check'
    );
  });

  test('leaves unknown @-handles as plain text', () => {
    expect(flatten(renderCommentText('hi @nobody', ['Alice']))).toBe('hi @nobody');
  });

  test('email addresses do not chip (email guard)', () => {
    expect(flatten(renderCommentText('mail alice@example.com', ['example']))).toBe(
      'mail alice@example.com'
    );
  });

  test('matches longer names before shorter ones (Jane Doe vs Jane)', () => {
    expect(flatten(renderCommentText('cc @Jane Doe today', ['Jane', 'Jane Doe']))).toBe(
      'cc [Jane Doe] today'
    );
  });

  test('respects word boundary — @Janeway with author "Jane" stays plain', () => {
    expect(flatten(renderCommentText('hi @Janeway', ['Jane']))).toBe('hi @Janeway');
  });

  test('empty authors list short-circuits to plain text', () => {
    expect(flatten(renderCommentText('hi @Alice', []))).toBe('hi @Alice');
  });

  test('case-insensitive matching', () => {
    expect(flatten(renderCommentText('hi @ALICE', ['alice']))).toBe('hi [alice]');
  });
});
