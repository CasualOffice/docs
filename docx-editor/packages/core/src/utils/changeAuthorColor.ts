/**
 * Per-author colors for tracked changes — the Word / Google-Docs "by author"
 * convention: each reviewer's suggestions get a distinct, stable color, and the
 * decoration carries insert-vs-delete (underline = insertion, strikethrough =
 * deletion). This lets multiple reviewers' changes be told apart at a glance.
 *
 * When the change has no author (anonymous / single-user), the caller falls back
 * to the classic green-insert / red-delete styling.
 */

/** Saturated line/decoration color + a faint background tint, per author slot. */
export interface ChangeColor {
  solid: string;
  bg: string;
}

// 8 distinct, reasonably color-blind-distinguishable hues (Google-Docs-ish).
const CHANGE_AUTHOR_PALETTE: readonly ChangeColor[] = [
  { solid: '#1a73e8', bg: 'rgba(26, 115, 232, 0.10)' }, // blue
  { solid: '#188038', bg: 'rgba(24, 128, 56, 0.10)' }, // green
  { solid: '#9334e6', bg: 'rgba(147, 52, 230, 0.10)' }, // purple
  { solid: '#e8710a', bg: 'rgba(232, 113, 10, 0.10)' }, // orange
  { solid: '#12a4af', bg: 'rgba(18, 164, 175, 0.10)' }, // teal
  { solid: '#d93025', bg: 'rgba(217, 48, 37, 0.10)' }, // red
  { solid: '#a142f4', bg: 'rgba(161, 66, 244, 0.10)' }, // violet
  { solid: '#b06000', bg: 'rgba(176, 96, 0, 0.10)' }, // brown
];

/** Stable string hash (djb2-ish) so the same author always maps to the same slot. */
function hashAuthor(author: string): number {
  let h = 0;
  for (let i = 0; i < author.length; i++) {
    h = (h * 31 + author.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Color for a tracked-change author, or `null` when there's no author (the
 * caller then uses the default green-insert / red-delete styling).
 */
export function colorForAuthor(author?: string | null): ChangeColor | null {
  if (!author) return null;
  return CHANGE_AUTHOR_PALETTE[hashAuthor(author) % CHANGE_AUTHOR_PALETTE.length];
}
