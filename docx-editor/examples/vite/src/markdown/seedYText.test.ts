/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { test, expect } from 'bun:test';
import * as Y from 'yjs';
import { seedYText } from './seedYText';

/**
 * The markdown editor's collab content lives in a shared Y.Text. These tests
 * pin the data-layer contract yCollab rides on: the first peer seeds the room,
 * later peers find it already populated and don't duplicate, and concurrent
 * edits converge.
 */

function sync(a: Y.Doc, b: Y.Doc): void {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
}

test('seeds an empty Y.Text with the opened file content', () => {
  const doc = new Y.Doc();
  const text = doc.getText('content');
  seedYText(text, '# Hello');
  expect(text.toString()).toBe('# Hello');
});

test('a second peer joining a populated room does NOT re-seed (no duplication)', () => {
  const first = new Y.Doc();
  seedYText(first.getText('content'), '# Shared doc');

  const second = new Y.Doc();
  sync(first, second);

  // The joiner runs the same seed call, but the text is already populated.
  seedYText(second.getText('content'), '# Shared doc');
  sync(first, second);

  expect(second.getText('content').toString()).toBe('# Shared doc');
  expect(first.getText('content').toString()).toBe('# Shared doc');
});

test('empty initial content seeds nothing', () => {
  const doc = new Y.Doc();
  seedYText(doc.getText('content'), '');
  expect(doc.getText('content').length).toBe(0);
});

test('concurrent edits from two peers converge', () => {
  const a = new Y.Doc();
  const b = new Y.Doc();
  seedYText(a.getText('content'), 'start');
  sync(a, b);

  // Both peers append at the end concurrently, then sync.
  a.getText('content').insert(a.getText('content').length, ' A');
  b.getText('content').insert(b.getText('content').length, ' B');
  sync(a, b);

  expect(a.getText('content').toString()).toBe(b.getText('content').toString());
  expect(a.getText('content').toString()).toContain('start');
  expect(a.getText('content').toString()).toContain('A');
  expect(a.getText('content').toString()).toContain('B');
});
