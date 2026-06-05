import { describe, expect, it } from 'bun:test';
import { computeReadability, formatReadingTime, gradeLabel, syllableCount } from './readability';

describe('computeReadability', () => {
  it('reports zero for empty input', () => {
    const out = computeReadability('');
    expect(out.words).toBe(0);
    expect(out.sentences).toBe(0);
    expect(out.gradeLevel).toBeNull();
  });

  it('counts words across multiple sentences', () => {
    const out = computeReadability('Hello world. This is a test.');
    expect(out.words).toBe(6);
    expect(out.sentences).toBe(2);
    expect(out.avgSentenceLength).toBe(3);
  });

  it('treats trailing prose without terminator as one sentence', () => {
    const out = computeReadability('Hello world');
    expect(out.words).toBe(2);
    expect(out.sentences).toBe(1);
  });

  it('flags sentences over the long-sentence threshold', () => {
    // Threshold is >25 words; build a 30-word sentence so this is
    // robust to small future tuning.
    const longSentence = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ');
    const out = computeReadability(longSentence + '.');
    expect(out.longSentences).toBe(1);
  });

  it('returns a Flesch-Kincaid grade level for prose over 10 words', () => {
    const text =
      'The quick brown fox jumps over the lazy dog. The clever fox runs through the dense forest with energy.';
    const out = computeReadability(text);
    expect(out.gradeLevel).not.toBeNull();
    // Sane bounds — this prose should not be "grade 30".
    expect(out.gradeLevel as number).toBeGreaterThan(-2);
    expect(out.gradeLevel as number).toBeLessThan(20);
  });

  it('skips grade level when the doc is too short', () => {
    const out = computeReadability('Hello.');
    expect(out.gradeLevel).toBeNull();
  });

  it('estimates reading time at ~230 words per minute', () => {
    const words = Array.from({ length: 230 }, () => 'word').join(' ');
    const out = computeReadability(words);
    // ~60_000 ms, allow generous tolerance for sentence-count rounding.
    expect(out.readingTimeMs).toBeGreaterThan(55_000);
    expect(out.readingTimeMs).toBeLessThan(65_000);
  });

  it('handles non-Latin scripts in the word count', () => {
    const out = computeReadability('Здравствуй мир');
    expect(out.words).toBe(2);
  });
});

describe('syllableCount', () => {
  it('counts monosyllables', () => {
    expect(syllableCount('the')).toBe(1);
    expect(syllableCount('dog')).toBe(1);
  });

  it('counts multi-syllable words', () => {
    expect(syllableCount('banana')).toBeGreaterThanOrEqual(2);
    expect(syllableCount('reading')).toBeGreaterThanOrEqual(2);
  });

  it('never returns less than 1', () => {
    expect(syllableCount('a')).toBe(1);
  });
});

describe('formatReadingTime', () => {
  it('shows seconds under a minute', () => {
    expect(formatReadingTime(30_000)).toBe('30 sec');
  });

  it('shows minutes once over a minute', () => {
    expect(formatReadingTime(120_000)).toBe('2 min');
  });

  it('returns em-dash for zero / negative input', () => {
    expect(formatReadingTime(0)).toBe('—');
    expect(formatReadingTime(-100)).toBe('—');
  });
});

describe('gradeLabel', () => {
  it('returns a short-doc label when grade is null', () => {
    expect(gradeLabel(null)).toContain('Too short');
  });

  it('labels grades 1-6 as plain', () => {
    expect(gradeLabel(5)).toContain('plain');
  });

  it('labels grades 7-9 as everyday', () => {
    expect(gradeLabel(8)).toContain('everyday');
  });

  it('labels grades 10-12 as scholarly', () => {
    expect(gradeLabel(11)).toContain('scholarly');
  });

  it('labels grades 13+ as academic', () => {
    expect(gradeLabel(14)).toContain('academic');
  });
});
