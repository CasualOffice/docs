/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { describe, test, expect } from 'bun:test';
import { checkText } from './rules';

/** Convenience: the substrings the engine flagged, in order. */
function flagged(text: string): string[] {
  return checkText(text).map((m) => text.slice(m.start, m.end));
}
function fixes(text: string): string[] {
  return checkText(text).flatMap((m) => m.replacements);
}

describe('grammar rules — precision (no false positives)', () => {
  test('clean sentence yields nothing', () => {
    expect(checkText('The quick brown fox jumps over the lazy dog.')).toEqual([]);
  });
  test('"a university" is NOT flagged (consonant sound)', () => {
    expect(checkText('She attends a university downtown.')).toEqual([]);
  });
  test('"an hour" is NOT flagged (silent h)', () => {
    expect(checkText('We waited an hour.')).toEqual([]);
  });
  test('"i.e." does not trip the lone-i rule', () => {
    expect(checkText('Use a delimiter, i.e. a comma.')).toEqual([]);
  });
  test('"that that" is allowed', () => {
    expect(checkText('I think that that approach works.')).toEqual([]);
  });
});

describe('grammar rules — catches', () => {
  test('a → an before a vowel', () => {
    expect(flagged('I ate a apple.')).toContain('a');
    expect(fixes('I ate a apple.')).toContain('an');
  });
  test('an → a before a consonant', () => {
    expect(fixes('It was an dog.')).toContain('a');
  });
  test('preserves article case', () => {
    expect(fixes('A apple a day.')).toContain('An');
  });
  test('doubled word', () => {
    expect(flagged('This is the the end.')).toContain('the the');
    expect(fixes('This is the the end.')).toContain('the');
  });
  test('lone lowercase i → I', () => {
    expect(fixes('Yesterday i went home.')).toContain('I');
  });
  test('could of → could have', () => {
    expect(fixes('You could of told me.')).toContain('could have');
  });
  test('space before punctuation', () => {
    const out = checkText('Wait , what ?');
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(fixes('Wait , what ?')).toContain(',');
  });
});
