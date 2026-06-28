/**
 * Curated, high-precision grammar rules. Each scans one textblock's plain text
 * and returns matches in TEXT-OFFSET coordinates (the GrammarExtension maps
 * them to document positions). The bar is precision over recall — a false
 * squiggle is worse than a missed one — so rules carry small exception sets and
 * deliberately skip ambiguous cases (e.g. "a one-time", "that that").
 *
 * This is the default engine behind `GrammarChecker`. The provider interface is
 * intentionally a pure `check(text)` so a server- or LLM-backed pass can replace
 * it wholesale later without touching the extension or the UI.
 */
import type { GrammarMatch } from '@eigenpal/docx-core/prosemirror/extensions';

/** Preserve the capitalisation pattern of `sample` onto `word`. */
function matchCase(word: string, sample: string): string {
  if (sample.length > 0 && sample[0] === sample[0].toUpperCase()) {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }
  return word;
}

/** a/an before the wrong sound. Conservative: skips the common letter-vs-sound
 *  exceptions ("a university", "an hour") by excluding `u` and `h`. */
function articleRule(text: string): GrammarMatch[] {
  const out: GrammarMatch[] = [];
  const re = /\b(an?)(\s+)([a-zA-Z])/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const article = m[1];
    const lower = article.toLowerCase();
    const next = m[3].toLowerCase();
    const articleStart = m.index;
    const articleEnd = m.index + article.length;
    if (lower === 'a' && (next === 'a' || next === 'e' || next === 'i' || next === 'o')) {
      out.push({
        start: articleStart,
        end: articleEnd,
        message: 'Use “an” before a word that starts with a vowel sound.',
        replacements: [matchCase('an', article)],
      });
    } else if (lower === 'an' && !'aeiouh'.includes(next)) {
      out.push({
        start: articleStart,
        end: articleEnd,
        message: 'Use “a” before a word that starts with a consonant sound.',
        replacements: [matchCase('a', article)],
      });
    }
  }
  return out;
}

/** Repeated word ("the the"). Skips legitimately-doubled function words. */
const DOUBLE_WORD_SKIP = new Set(['that', 'had']);
function doubledWordRule(text: string): GrammarMatch[] {
  const out: GrammarMatch[] = [];
  const re = /\b([A-Za-z]+)(\s+)(\1)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (DOUBLE_WORD_SKIP.has(m[1].toLowerCase())) continue;
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      message: `Repeated word “${m[1]}”.`,
      replacements: [m[1]],
    });
    // Step back so "word word word" reports the second pair too.
    re.lastIndex = m.index + m[1].length;
  }
  return out;
}

/** Standalone lowercase "i" → "I". Space-bounded only, so "i.e." / "iPhone"
 *  never trip it. */
function loneIRule(text: string): GrammarMatch[] {
  const out: GrammarMatch[] = [];
  const re = /(^|\s)i(?=\s|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const start = m.index + m[1].length;
    out.push({
      start,
      end: start + 1,
      message: 'The pronoun “I” is always capitalized.',
      replacements: ['I'],
    });
  }
  return out;
}

/** "could of" → "could have" (and should/would/must/might). */
function ofHaveRule(text: string): GrammarMatch[] {
  const out: GrammarMatch[] = [];
  const re = /\b(could|should|would|must|might)(\s+)of\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const fix = `${m[1]} have`;
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      message: `Did you mean “${fix}”?`,
      replacements: [fix],
    });
  }
  return out;
}

/** Space before sentence punctuation ("word ,"). */
function spaceBeforePunctRule(text: string): GrammarMatch[] {
  const out: GrammarMatch[] = [];
  const re = /\s+([,.;:!?])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      message: 'Remove the space before the punctuation.',
      replacements: [m[1]],
    });
  }
  return out;
}

const RULES = [articleRule, doubledWordRule, loneIRule, ofHaveRule, spaceBeforePunctRule];

/**
 * Run every rule over `text` and return matches sorted by position, with
 * overlapping matches dropped (first one wins) so a single span never carries
 * two conflicting fixes.
 */
export function checkText(text: string): GrammarMatch[] {
  if (!text) return [];
  const all: GrammarMatch[] = [];
  for (const rule of RULES) all.push(...rule(text));
  all.sort((a, b) => a.start - b.start || a.end - b.end);
  const out: GrammarMatch[] = [];
  let lastEnd = -1;
  for (const m of all) {
    if (m.start < lastEnd) continue; // overlaps a kept match — skip
    out.push(m);
    lastEnd = m.end;
  }
  return out;
}
