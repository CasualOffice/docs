/**
 * Unit tests for the word-boundary helpers powering WordNavigationExtension
 * (Ctrl/Alt + Arrow word-wise cursor motion).
 *
 * Covers the pure offset-math layer (`isWordCharacter`, `findWordStart` /
 * `findWordEnd`, `findNextWordStart` / `findPreviousWordStart`). The
 * PM-state-aware command in WordNavigationExtension calls these directly,
 * so a regression here breaks Ctrl+Arrow behavior in the editor without
 * any other test catching it.
 */

import { describe, expect, test } from 'bun:test';
import {
  findNextWordStart,
  findPreviousWordStart,
  findWordEnd,
  findWordStart,
  isPunctuation,
  isWhitespace,
  isWordCharacter,
} from './keyboardNavigation';

describe('isWordCharacter', () => {
  test('letters, digits, underscore are word characters', () => {
    for (const ch of ['a', 'Z', '5', '_', 'ñ', 'é']) {
      expect(isWordCharacter(ch)).toBe(true);
    }
  });

  test('whitespace and punctuation are not word characters', () => {
    for (const ch of [' ', '\t', '\n', '.', ',', ';', '-', '!', '?']) {
      expect(isWordCharacter(ch)).toBe(false);
    }
  });

  test('empty string is not a word character', () => {
    expect(isWordCharacter('')).toBe(false);
  });
});

describe('isWhitespace', () => {
  test('classifies common whitespace characters', () => {
    for (const ch of [' ', '\t', '\n', '\r']) {
      expect(isWhitespace(ch)).toBe(true);
    }
  });

  test('does not classify letters or punctuation', () => {
    for (const ch of ['a', '.', ',', '_']) {
      expect(isWhitespace(ch)).toBe(false);
    }
  });
});

describe('isPunctuation', () => {
  test('classifies common punctuation', () => {
    for (const ch of ['.', ',', '!', '?', ';', ':', '-', '(', ')', '"', "'"]) {
      expect(isPunctuation(ch)).toBe(true);
    }
  });

  test('does not classify letters, digits, or whitespace', () => {
    // NOTE: `_` is intentionally NOT in this set — Unicode classifies it
    // as connector punctuation (`\p{Pc}` ⊂ `\p{P}`) AND we treat it as
    // a word character in `isWordCharacter`. Both regexes match it; the
    // overlap is fine because the word-boundary helpers below only call
    // `isWordCharacter`, never `isPunctuation`.
    for (const ch of ['a', '5', ' ']) {
      expect(isPunctuation(ch)).toBe(false);
    }
  });
});

describe('findWordStart (backwards toward word origin)', () => {
  test('returns 0 when position is at or before 0', () => {
    expect(findWordStart('hello', 0)).toBe(0);
    expect(findWordStart('hello', -1)).toBe(0);
  });

  test('returns the start of the current word', () => {
    // "hello world"
    //  01234567890
    expect(findWordStart('hello world', 4)).toBe(0); // inside "hello"
    expect(findWordStart('hello world', 5)).toBe(0); // end of "hello"
    expect(findWordStart('hello world', 9)).toBe(6); // inside "world"
  });

  test('walks backward through whitespace then word', () => {
    expect(findWordStart('hello world', 6)).toBe(0); // landed in space before "world"
  });

  test('clamps past end-of-text', () => {
    expect(findWordStart('hello', 999)).toBe(0);
  });
});

describe('findWordEnd (forward to next word boundary)', () => {
  test('returns text.length when position is past end', () => {
    expect(findWordEnd('hello', 5)).toBe(5);
    expect(findWordEnd('hello', 999)).toBe(5);
  });

  test('walks to end of current word then through whitespace', () => {
    // "hello world!"
    //  012345678901
    expect(findWordEnd('hello world!', 0)).toBe(6); // end of "hello" + skip space
    expect(findWordEnd('hello world!', 3)).toBe(6); // inside "hello"
  });

  test('stops at non-whitespace non-word boundary', () => {
    expect(findWordEnd('hello! world', 0)).toBe(5); // punctuation is non-word
  });
});

describe('findNextWordStart (Ctrl/Alt + Right)', () => {
  test('returns text.length when at end', () => {
    expect(findNextWordStart('hello', 5)).toBe(5);
  });

  test('mid-word: skips to start of NEXT word', () => {
    // "hello world"
    //  01234567890
    expect(findNextWordStart('hello world', 2)).toBe(6); // inside "hello" → start of "world"
  });

  test('at end of word: skips whitespace to start of next word', () => {
    expect(findNextWordStart('hello world', 5)).toBe(6);
  });

  test('in whitespace: lands on next word start', () => {
    expect(findNextWordStart('hello   world', 6)).toBe(8); // pos 6 = first space mid-gap
  });

  test('through punctuation reaches the next word', () => {
    // "foo, bar"
    //  01234567
    expect(findNextWordStart('foo, bar', 0)).toBe(5); // skip ", " to "bar"
  });

  test('handles trailing whitespace by returning text.length', () => {
    expect(findNextWordStart('hello   ', 5)).toBe(8);
  });
});

describe('findPreviousWordStart (Ctrl/Alt + Left)', () => {
  test('returns 0 when at start', () => {
    expect(findPreviousWordStart('hello', 0)).toBe(0);
  });

  test('mid-word: returns start of CURRENT word', () => {
    expect(findPreviousWordStart('hello world', 9)).toBe(6); // inside "world" → 6
    expect(findPreviousWordStart('hello world', 4)).toBe(0); // inside "hello" → 0
  });

  test('at start of word: jumps to the previous word start', () => {
    expect(findPreviousWordStart('hello world', 6)).toBe(0);
  });

  test('in whitespace: jumps to start of preceding word', () => {
    expect(findPreviousWordStart('hello   world', 7)).toBe(0);
  });

  test('skips punctuation back to a word', () => {
    expect(findPreviousWordStart('foo, bar', 5)).toBe(0); // before "bar" → "foo"
  });

  test('handles leading whitespace by clamping to 0', () => {
    expect(findPreviousWordStart('   hello', 2)).toBe(0);
  });
});

describe('round-trips', () => {
  test('Next then Previous returns to the same word boundary', () => {
    const text = 'one two three four';
    let pos = 0;
    pos = findNextWordStart(text, pos); // → 4 ("two")
    expect(pos).toBe(4);
    expect(findPreviousWordStart(text, pos)).toBe(0); // → "one"
  });

  test('walking forward through "a b c" hits every word start', () => {
    const text = 'a b c';
    const stops: number[] = [0];
    let pos = 0;
    while (pos < text.length) {
      const next = findNextWordStart(text, pos);
      if (next === pos) break;
      stops.push(next);
      pos = next;
    }
    expect(stops).toEqual([0, 2, 4, 5]);
  });
});
