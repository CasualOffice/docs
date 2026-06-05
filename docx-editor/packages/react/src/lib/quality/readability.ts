/**
 * Readability statistics — Hemingway-style heuristics that score the
 * document without invoking an LLM. Live-computed in the status bar
 * so users get instant feedback while writing, without burning a
 * model round-trip.
 *
 * Outputs:
 *   - words: total word count (matches the existing status-bar word
 *     pill, kept here so callers can pull everything from one place).
 *   - sentences: count detected via `.!?` boundaries.
 *   - longSentences: sentences with > LONG_SENTENCE_WORDS words —
 *     candidates the user might want to split.
 *   - avgSentenceLength: rounded to 1 decimal.
 *   - readingTimeMs: based on AVG_READING_WPM. Stored as ms so
 *     callers can format as seconds for short docs or minutes for
 *     longer ones.
 *   - gradeLevel: Flesch-Kincaid US-grade-level. Returns null when
 *     the doc is too short to score reliably (< 10 words).
 *
 * Tokenisation is deliberately permissive — we tolerate trailing
 * whitespace, multiple punctuation, and Unicode letters via `\p{L}`
 * so non-English text is still counted (gradeLevel falls back to
 * null since Flesch-Kincaid is English-only).
 */

export interface ReadabilityStats {
  words: number;
  sentences: number;
  longSentences: number;
  avgSentenceLength: number;
  readingTimeMs: number;
  /** Flesch-Kincaid US grade level. Null when the doc is too short
   *  to score (or when it looks non-English). */
  gradeLevel: number | null;
}

const AVG_READING_WPM = 230;
const LONG_SENTENCE_WORDS = 25;

const WORD_RE = /\p{L}+(?:'\p{L}+)*/gu;
const SENTENCE_BREAK_RE = /[.!?]+(?=\s|$)/g;
const VOWEL_GROUP_RE = /[aeiouy]+/gi;

function countWords(text: string): string[] {
  return text.match(WORD_RE) ?? [];
}

function countSentences(text: string): number {
  const matches = text.match(SENTENCE_BREAK_RE);
  // Treat any trailing prose without terminal punctuation as one more
  // sentence so a doc like "hello world" doesn't read as 0 sentences.
  const stripped = text.trim();
  if (!stripped) return 0;
  const base = matches?.length ?? 0;
  const endsWithTerminator = /[.!?]\s*$/.test(stripped);
  return base + (endsWithTerminator ? 0 : 1);
}

/**
 * Approximate syllable counter — exported so a future inline lint can
 * tag "purple-prose" sentences. Standard heuristic: count vowel
 * groups, drop a silent trailing `e`, treat `le` ending as +1.
 */
export function syllableCount(word: string): number {
  const w = word.toLowerCase();
  if (w.length <= 3) return 1;
  let body = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  body = body.replace(/^y/, '');
  const groups = body.match(VOWEL_GROUP_RE);
  return Math.max(1, groups?.length ?? 1);
}

/**
 * Flesch-Kincaid US grade level — the canonical readability score.
 * Lower = easier; ~Grade 8 is plain-English target for most prose.
 * Returns null when the input is too short (< 10 words) since the
 * formula's variance explodes on small samples.
 */
function fleschKincaidGrade(words: string[], sentences: number): number | null {
  if (words.length < 10 || sentences < 1) return null;
  let syllables = 0;
  for (const w of words) syllables += syllableCount(w);
  const wordsPerSentence = words.length / sentences;
  const syllablesPerWord = syllables / words.length;
  // 0.39 * (words/sentences) + 11.8 * (syllables/word) − 15.59
  return Math.round((0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59) * 10) / 10;
}

export function computeReadability(text: string): ReadabilityStats {
  const words = countWords(text);
  const sentences = countSentences(text);
  // Count long sentences by walking the text in `.!?`-delimited
  // chunks. Cheaper than running countWords per chunk inside a loop
  // by reusing the SENTENCE_BREAK_RE split.
  const longSentences = (() => {
    if (sentences === 0) return 0;
    const parts = text.split(/[.!?]+/);
    let count = 0;
    for (const p of parts) {
      const w = countWords(p);
      if (w.length > LONG_SENTENCE_WORDS) count += 1;
    }
    return count;
  })();
  const avgSentenceLength = sentences ? Math.round((words.length / sentences) * 10) / 10 : 0;
  const readingTimeMs = (words.length / AVG_READING_WPM) * 60 * 1000;
  const gradeLevel = fleschKincaidGrade(words, sentences);
  return {
    words: words.length,
    sentences,
    longSentences,
    avgSentenceLength,
    readingTimeMs,
    gradeLevel,
  };
}

/**
 * Format reading time as "N sec" under a minute, "N min" otherwise.
 * Returns "—" for empty docs so the status pill stays single-line.
 */
export function formatReadingTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}

/**
 * Map a Flesch-Kincaid grade level to a friendly label. The cut-offs
 * mirror Hemingway / WCAG common guidance.
 */
export function gradeLabel(grade: number | null): string {
  if (grade == null) return 'Too short to score';
  if (grade <= 6) return `Grade ${grade} · plain`;
  if (grade <= 9) return `Grade ${grade} · everyday`;
  if (grade <= 12) return `Grade ${grade} · scholarly`;
  return `Grade ${grade} · academic`;
}
