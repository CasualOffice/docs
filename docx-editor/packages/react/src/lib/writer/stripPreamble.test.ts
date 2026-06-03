import { describe, expect, it } from 'bun:test';
import { stripModelPreamble } from './stripPreamble';

describe('stripModelPreamble', () => {
  it('removes "Here is the rewritten passage:" prefix', () => {
    const out = stripModelPreamble(
      'Here is the rewritten passage:\n\nThe quick brown fox jumps.'
    );
    expect(out).toBe('The quick brown fox jumps.');
  });

  it('removes "Here is the rewrite:" variant', () => {
    expect(stripModelPreamble('Here is the rewrite: hello world.')).toBe('hello world.');
  });

  it('removes "Here\'s a summary:" variant', () => {
    expect(stripModelPreamble("Here's a summary: bullet one. bullet two.")).toBe(
      'bullet one. bullet two.'
    );
  });

  it('removes "Sure! Here is" variant', () => {
    expect(stripModelPreamble('Sure! Here is your rewrite: actual content.')).toBe(
      'actual content.'
    );
  });

  it('removes "Of course! Here\'s" variant', () => {
    expect(stripModelPreamble("Of course! Here's the rewritten passage:\n\nReal text.")).toBe(
      'Real text.'
    );
  });

  it('removes trailing "Let me know if" flourish', () => {
    expect(
      stripModelPreamble('Real content here.\n\nLet me know if you want changes.')
    ).toBe('Real content here.');
  });

  it('removes trailing "Hope this helps" flourish', () => {
    expect(stripModelPreamble('Real content.\n\nHope this helps!')).toBe('Real content.');
  });

  it('strips wrapping quotes after preamble', () => {
    expect(stripModelPreamble('Here is the rewrite: "actual content"')).toBe('actual content');
  });

  it('leaves text without preamble unchanged', () => {
    expect(stripModelPreamble('Just a plain reply.')).toBe('Just a plain reply.');
  });

  it('returns original when stripping would empty the text', () => {
    // "Here is the rewrite:" alone would strip to empty — return original.
    expect(stripModelPreamble('Here is the rewrite:')).toBe('Here is the rewrite:');
  });

  it('handles empty input safely', () => {
    expect(stripModelPreamble('')).toBe('');
  });

  it('preserves middle-of-text "Here is" phrasing', () => {
    // Only LEADING preamble is stripped — model-emitted preamble at
    // start; legitimate prose mid-text stays put.
    expect(
      stripModelPreamble("The CEO said: Here is the new plan. It's solid.")
    ).toBe("The CEO said: Here is the new plan. It's solid.");
  });
});
