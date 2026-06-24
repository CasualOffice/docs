import { describe, expect, it } from 'bun:test';
import { detectTabular } from './smartPaste';

describe('detectTabular', () => {
  it('treats single-line text as non-tabular', () => {
    expect(detectTabular('Just a regular sentence with, commas.')).toBeNull();
  });

  it('detects tab-delimited content', () => {
    const tsv = 'Name\tRole\nAda\tEditor\nLin\tWriter';
    const out = detectTabular(tsv);
    expect(out).not.toBeNull();
    expect(out?.delimiter).toBe('tab');
    expect(out?.rows).toBe(3);
    expect(out?.columns).toBe(2);
  });

  it('detects CSV with 3+ rows and ≥2 commas per line', () => {
    const csv = 'a, b, c\n1, 2, 3\n4, 5, 6';
    const out = detectTabular(csv);
    expect(out).not.toBeNull();
    expect(out?.delimiter).toBe('comma');
    expect(out?.columns).toBe(3);
  });

  it('rejects two-line CSV-like prose (too few rows)', () => {
    expect(detectTabular('apples, oranges\nare delicious, fruit')).toBeNull();
  });

  it('rejects prose with occasional commas', () => {
    expect(
      detectTabular('I bought eggs, milk, and bread.\nThen I drove home.\nA quiet evening.')
    ).toBeNull();
  });
});
