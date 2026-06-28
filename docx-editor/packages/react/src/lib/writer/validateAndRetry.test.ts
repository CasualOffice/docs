/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { describe, expect, it } from 'bun:test';
import { combineValidators, noPlaceholderValidator, type Validator } from './validateAndRetry';

describe('noPlaceholderValidator', () => {
  it('passes a clean resume', () => {
    const out = {
      name: 'Alex Morgan',
      summary: 'Senior engineer with seven years of experience.',
      experience: [{ role: 'Engineer', company: 'Acme', dates: 'Mar 2019 – Dec 2021' }],
    };
    expect(noPlaceholderValidator(out)).toEqual([]);
  });

  it('catches [Your Name] in a top-level field', () => {
    const out = { name: '[Your Name]' };
    const issues = noPlaceholderValidator(out);
    expect(issues.length).toBe(1);
    expect(issues[0]?.field).toBe('name');
    expect(issues[0]?.text).toBe('[Your Name]');
  });

  it('catches [Insert here] nested inside an array', () => {
    const out = { sections: [{ heading: 'Goals', body: 'See [Insert here] for details.' }] };
    const issues = noPlaceholderValidator(out);
    expect(issues.length).toBe(1);
    expect(issues[0]?.field).toBe('sections[0].body');
  });

  it('catches "TBD" / "TODO" / "N/A" stub values', () => {
    const out = { name: 'Real Name', headline: 'TBD', summary: 'TODO' };
    const issues = noPlaceholderValidator(out);
    expect(issues.length).toBe(2);
    expect(issues.map((i) => i.field).sort()).toEqual(['headline', 'summary']);
  });

  it('catches "lorem ipsum" anywhere in a value', () => {
    const out = { body: 'Lorem ipsum dolor sit amet.' };
    const issues = noPlaceholderValidator(out);
    expect(issues.length).toBe(1);
    expect(issues[0]?.field).toBe('body');
  });

  it('ignores empty strings (model leaves a field blank correctly)', () => {
    const out = { name: '', headline: '' };
    expect(noPlaceholderValidator(out)).toEqual([]);
  });

  it('walks deeply nested structures and reports the full path', () => {
    const out = {
      experience: [{ role: 'Eng', bullets: ['Real bullet.', 'Started at [Company Name].'] }],
    };
    const issues = noPlaceholderValidator(out);
    expect(issues.length).toBe(1);
    expect(issues[0]?.field).toBe('experience[0].bullets[1]');
  });
});

describe('combineValidators', () => {
  it('concatenates issues from every validator', () => {
    const a: Validator<unknown> = () => [{ field: 'x', text: 'a', reason: 'first' }];
    const b: Validator<unknown> = () => [{ field: 'y', text: 'b', reason: 'second' }];
    const combined = combineValidators(a, b);
    const issues = combined({});
    expect(issues.length).toBe(2);
    expect(issues[0]?.reason).toBe('first');
    expect(issues[1]?.reason).toBe('second');
  });

  it('returns an empty list when every validator passes', () => {
    const empty: Validator<unknown> = () => [];
    expect(combineValidators(empty, empty)({})).toEqual([]);
  });
});
