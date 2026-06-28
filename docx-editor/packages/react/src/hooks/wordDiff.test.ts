/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { describe, expect, it } from 'bun:test';
import { diffStats, diffWords } from './wordDiff';

describe('diffWords', () => {
  it('returns a single keep segment for identical inputs', () => {
    const out = diffWords('the quick brown fox', 'the quick brown fox');
    expect(out).toEqual([{ op: 'keep', text: 'the quick brown fox' }]);
  });

  it('produces only adds when before is empty', () => {
    const out = diffWords('', 'hello world');
    expect(out).toEqual([{ op: 'add', text: 'hello world' }]);
  });

  it('produces only removes when after is empty', () => {
    const out = diffWords('hello world', '');
    expect(out).toEqual([{ op: 'remove', text: 'hello world' }]);
  });

  it('marks word replacements as add+remove', () => {
    const out = diffWords('the quick brown fox', 'the slow brown fox');
    const removed = out.filter((s) => s.op === 'remove').map((s) => s.text.trim());
    const added = out.filter((s) => s.op === 'add').map((s) => s.text.trim());
    expect(removed).toContain('quick');
    expect(added).toContain('slow');
  });

  it('preserves a stable mid-string region across edits', () => {
    const out = diffWords('alpha bravo charlie', 'alpha foxtrot charlie');
    const keptText = out
      .filter((s) => s.op === 'keep')
      .map((s) => s.text)
      .join('');
    expect(keptText).toContain('alpha');
    expect(keptText).toContain('charlie');
  });

  it('handles punctuation cleanly', () => {
    const out = diffWords('hello, world', 'hello world');
    // "hello" and "world" should be kept; the comma removed.
    const removed = out.filter((s) => s.op === 'remove').map((s) => s.text);
    expect(removed.join('')).toContain(',');
  });

  it('diffStats counts words only, not punctuation or spaces', () => {
    const segs = diffWords('one two', 'one two three.');
    const stats = diffStats(segs);
    expect(stats.added).toBe(1); // "three"
    expect(stats.removed).toBe(0);
  });

  it('diffStats handles add + remove asymmetry', () => {
    const segs = diffWords('a b c d', 'a x y d');
    const stats = diffStats(segs);
    expect(stats.added).toBe(2); // "x", "y"
    expect(stats.removed).toBe(2); // "b", "c"
  });
});
