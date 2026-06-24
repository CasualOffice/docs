/**
 * Unit tests for findReplaceUtils — pins the regex flag plumbing
 * surfaced by the Phase 1.5 U7 checkbox in the Find dialog.
 *
 * `createSearchPattern` already supported `useRegex`; the dialog now
 * routes the new checkbox state into the `FindOptions` it passes
 * down. This suite locks the semantics so a future refactor of the
 * options object doesn't silently invert literal / regex behavior.
 */
import { describe, test, expect } from 'bun:test';
import {
  createDefaultFindOptions,
  createSearchPattern,
  findAllMatches,
  escapeRegexString,
} from './findReplaceUtils';

describe('createSearchPattern', () => {
  test('literal search escapes regex metacharacters', () => {
    // `1.cat` should NOT match `1Xcat` — the dot must be treated as a
    // literal dot, not a regex wildcard.
    const re = createSearchPattern('1.cat', {
      matchCase: false,
      matchWholeWord: false,
      useRegex: false,
    });
    expect(re).not.toBeNull();
    expect(re!.source).toContain('\\.'); // dot is escaped
    expect('1Xcat'.match(re!)).toBeNull();
    expect('1.cat'.match(re!)).not.toBeNull();
  });

  test('regex search treats metacharacters as regex', () => {
    // Same `1.cat` but with regex on — `.` is wildcard.
    const re = createSearchPattern('1.cat', {
      matchCase: false,
      matchWholeWord: false,
      useRegex: true,
    });
    expect(re).not.toBeNull();
    expect('1Xcat'.match(re!)).not.toBeNull();
    expect('1.cat'.match(re!)).not.toBeNull();
  });

  test('invalid regex returns null (never throws)', () => {
    const re = createSearchPattern('[unclosed', {
      matchCase: false,
      matchWholeWord: false,
      useRegex: true,
    });
    expect(re).toBeNull();
  });

  test('useRegex composes with matchWholeWord (\\b boundaries)', () => {
    const re = createSearchPattern('\\d+', {
      matchCase: false,
      matchWholeWord: true,
      useRegex: true,
    });
    expect(re).not.toBeNull();
    expect(re!.source).toBe('\\b\\d+\\b');
    expect('42 abc'.match(re!)?.[0]).toBe('42');
    expect('abc42'.match(re!)).toBeNull(); // no word boundary at start
  });

  test('useRegex composes with matchCase (drop /i flag)', () => {
    const re = createSearchPattern('CAT', {
      matchCase: true,
      matchWholeWord: false,
      useRegex: true,
    });
    expect(re).not.toBeNull();
    expect(re!.flags).toBe('g');
    expect('CAT'.match(re!)).not.toBeNull();
    expect('cat'.match(re!)).toBeNull();
  });
});

describe('findAllMatches with useRegex', () => {
  const HAYSTACK = 'cat 1cat catfish';

  test('literal "cat" matches all three occurrences', () => {
    const matches = findAllMatches(HAYSTACK, 'cat', {
      matchCase: false,
      matchWholeWord: false,
      useRegex: false,
    });
    expect(matches.length).toBe(3);
  });

  test('regex "\\dcat" matches only the digit-prefixed run', () => {
    const matches = findAllMatches(HAYSTACK, '\\dcat', {
      matchCase: false,
      matchWholeWord: false,
      useRegex: true,
    });
    expect(matches.length).toBe(1);
    expect(HAYSTACK.slice(matches[0].start, matches[0].end)).toBe('1cat');
  });

  test('regex pattern that yields zero matches returns empty array', () => {
    const matches = findAllMatches(HAYSTACK, '^dog', {
      matchCase: false,
      matchWholeWord: false,
      useRegex: true,
    });
    expect(matches).toEqual([]);
  });

  test('invalid regex returns empty array without throwing', () => {
    const matches = findAllMatches(HAYSTACK, '[unclosed', {
      matchCase: false,
      matchWholeWord: false,
      useRegex: true,
    });
    expect(matches).toEqual([]);
  });
});

describe('createDefaultFindOptions', () => {
  test('useRegex defaults to false (literal search by default)', () => {
    const opts = createDefaultFindOptions();
    expect(opts.useRegex).toBe(false);
    expect(opts.matchCase).toBe(false);
    expect(opts.matchWholeWord).toBe(false);
  });
});

describe('escapeRegexString', () => {
  test('escapes all regex metacharacters', () => {
    expect(escapeRegexString('.')).toBe('\\.');
    expect(escapeRegexString('*+?')).toBe('\\*\\+\\?');
    expect(escapeRegexString('[hello]')).toBe('\\[hello\\]');
    expect(escapeRegexString('plain')).toBe('plain');
  });
});
