/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { test, expect } from 'bun:test';
import { colorForAuthor } from './changeAuthorColor';

test('no author → null (caller uses the default green/red styling)', () => {
  expect(colorForAuthor(undefined)).toBeNull();
  expect(colorForAuthor(null)).toBeNull();
  expect(colorForAuthor('')).toBeNull();
});

test('same author always maps to the same color (stable)', () => {
  const a = colorForAuthor('Alice');
  const b = colorForAuthor('Alice');
  expect(a).not.toBeNull();
  expect(a).toEqual(b!);
});

test('different authors generally get different colors', () => {
  // Across a handful of names we expect at least 2 distinct hues (the palette
  // has 8 slots; collisions are possible but not for all of these).
  const names = ['Alice', 'Bob', 'Carol', 'Dave', 'Erin', 'Frank'];
  const solids = new Set(names.map((n) => colorForAuthor(n)!.solid));
  expect(solids.size).toBeGreaterThan(1);
});

test('returns both a solid line color and a faint bg tint', () => {
  const c = colorForAuthor('Reviewer')!;
  expect(c.solid).toMatch(/^#[0-9a-f]{6}$/i);
  expect(c.bg).toContain('rgba(');
});
