/**
 * tryParseJson — defensive parser used to recover from the (rare)
 * case where Llama emits non-JSON despite `response_format`.
 */
import { describe, expect, it } from 'bun:test';
import { tryParseJson } from './jsonMode';

describe('tryParseJson', () => {
  it('parses clean JSON', () => {
    expect(tryParseJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it('returns null on empty/whitespace input', () => {
    expect(tryParseJson('')).toBeNull();
    expect(tryParseJson('   \n  ')).toBeNull();
  });

  it('strips markdown fences', () => {
    expect(tryParseJson<{ a: number }>('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(tryParseJson<{ a: number }>('```\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it('recovers from leading prose by extracting the first object', () => {
    const out = tryParseJson<{ headers: string[] }>(
      'Sure! Here is the JSON:\n\n{"headers": ["a", "b"]}\n\nLet me know if you want changes.'
    );
    expect(out?.headers).toEqual(['a', 'b']);
  });

  it('returns null for non-JSON garbage', () => {
    expect(tryParseJson('this is not JSON at all')).toBeNull();
  });

  it('returns null when extraction would produce an unbalanced object', () => {
    expect(tryParseJson('{ broken brace')).toBeNull();
  });
});
