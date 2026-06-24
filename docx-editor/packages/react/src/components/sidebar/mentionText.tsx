/**
 * Render comment text with @-mentions as inline chips.
 *
 * Walks the text once, splits on /\B@([\w-]+(?:\s[\w-]+)?)/ and wraps
 * each matched name in a primary-tinted chip. The /\B/ guard avoids
 * matching email addresses (`user@host` won't chip — `host` is
 * preceded by an alpha, so \B is false there). The optional second
 * "word" lets a mention cover two-token names like "Jane Doe" when
 * the author list includes it.
 */
import type { CSSProperties, ReactNode } from 'react';

const MENTION_CHIP_STYLE: CSSProperties = {
  display: 'inline-block',
  padding: '0 6px',
  margin: '0 1px',
  borderRadius: 4,
  background: 'var(--doc-primary-light, #e8f0fe)',
  color: 'var(--doc-primary, #1a73e8)',
  fontWeight: 500,
  fontSize: 'inherit',
  lineHeight: 'inherit',
};

/**
 * Render `text` into a fragment, replacing @Name spans with chips.
 *
 * `knownAuthors` constrains what counts as a mention: only names
 * that match a known author are chipped (case-insensitive). Random
 * `@foo` strings stay plain text — protects against random `@`
 * usage in prose getting visually elevated.
 */
export function renderCommentText(text: string, knownAuthors: readonly string[]): ReactNode {
  if (!text) return text;
  // Sort longer names first so "Jane Doe" wins over "Jane".
  const sorted = [...knownAuthors].sort((a, b) => b.length - a.length).filter(Boolean);
  if (sorted.length === 0) return text;

  const out: ReactNode[] = [];
  let i = 0;
  while (i < text.length) {
    const atIdx = text.indexOf('@', i);
    if (atIdx < 0) {
      out.push(text.slice(i));
      break;
    }
    // Email guard: @ preceded by an alphanumeric is part of an email.
    const prev = atIdx > 0 ? text.charAt(atIdx - 1) : '';
    if (prev && /[A-Za-z0-9]/.test(prev)) {
      out.push(text.slice(i, atIdx + 1));
      i = atIdx + 1;
      continue;
    }
    // Push the run before the @.
    if (atIdx > i) out.push(text.slice(i, atIdx));
    // Try matching the longest known author starting at atIdx+1.
    const tail = text.slice(atIdx + 1);
    const tailLower = tail.toLowerCase();
    let matched: string | null = null;
    for (const name of sorted) {
      if (tailLower.startsWith(name.toLowerCase())) {
        // Boundary check: the next char (if any) must be a word
        // separator — punctuation, whitespace, or end of string.
        const after = tail.charAt(name.length);
        if (after === '' || !/[A-Za-z0-9_]/.test(after)) {
          matched = name;
          break;
        }
      }
    }
    if (matched) {
      out.push(
        <span key={atIdx} style={MENTION_CHIP_STYLE}>
          @{matched}
        </span>
      );
      i = atIdx + 1 + matched.length;
    } else {
      out.push('@');
      i = atIdx + 1;
    }
  }
  return <>{out}</>;
}
