/**
 * Word-level diff for the version-history panel.
 *
 * The user asked for a "GitHub-like" view of what changed between
 * two snapshots of the document. A character-level diff is too noisy
 * (it splits inside words); a paragraph-level diff is too coarse
 * (any edit re-flows the whole paragraph). Word-level is the sweet
 * spot most diff tools settle on (jsdiff's `diffWords`, GitHub's PR
 * inline view).
 *
 * Algorithm: classic LCS over word tokens. O(N*M) time, O(N*M)
 * memory — fine for the 5-30 KB snapshots we'll diff (one history
 * entry's `before` vs the next entry's `before`). Above ~50 K tokens
 * the algorithm degrades; the panel caller truncates first.
 *
 * Tokenisation splits on whitespace AND on punctuation boundaries so
 * "hello, world" and "hello , world" diff cleanly — punctuation is a
 * token. Whitespace runs become a single space token so trailing-
 * newline edits don't produce a flood of empty tokens.
 *
 * Output is a flat sequence of segments — each one is "kept",
 * "added", or "removed". Run-length encoded so the renderer can wrap
 * runs in a single `<ins>` / `<del>` / unstyled span instead of one
 * span per word.
 */

export type DiffOp = 'keep' | 'add' | 'remove';

export interface DiffSegment {
  op: DiffOp;
  text: string;
}

const TOKEN_RE = /[A-Za-z0-9_]+|[^\sA-Za-z0-9_]|\s+/g;

function tokenise(text: string): string[] {
  return text.match(TOKEN_RE) ?? [];
}

function isWhitespace(token: string): boolean {
  return /^\s+$/.test(token);
}

/**
 * Compute the longest common subsequence length matrix between two
 * token arrays. Returns the N+1 × M+1 DP table; callers walk it to
 * reconstruct segments.
 */
function lcsTable(a: string[], b: string[]): number[][] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
      }
    }
  }
  return dp;
}

/**
 * Walk the LCS table backwards to emit segments. We RLE-merge
 * consecutive segments with the same op so the renderer's span count
 * stays small. Whitespace tokens stick to the surrounding kept run so
 * the diff doesn't visually shred at every space.
 */
function emit(a: string[], b: string[], dp: number[][]): DiffSegment[] {
  const out: DiffSegment[] = [];
  const push = (op: DiffOp, text: string): void => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.op === op) {
      last.text += text;
    } else {
      out.push({ op, text });
    }
  };

  let i = a.length;
  let j = b.length;
  // Reverse path: prepend tokens so order is correct.
  const stack: DiffSegment[] = [];
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      stack.push({ op: 'keep', text: a[i - 1]! });
      i--;
      j--;
    } else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) {
      stack.push({ op: 'remove', text: a[i - 1]! });
      i--;
    } else {
      stack.push({ op: 'add', text: b[j - 1]! });
      j--;
    }
  }
  while (i > 0) {
    stack.push({ op: 'remove', text: a[i - 1]! });
    i--;
  }
  while (j > 0) {
    stack.push({ op: 'add', text: b[j - 1]! });
    j--;
  }
  for (let k = stack.length - 1; k >= 0; k--) {
    const s = stack[k]!;
    // Stick lone whitespace tokens to the previous segment so spaces
    // don't fragment the diff visually.
    if (s.op === 'remove' && isWhitespace(s.text) && out.length > 0) {
      push(out[out.length - 1]!.op, s.text);
      continue;
    }
    if (s.op === 'add' && isWhitespace(s.text) && out.length > 0) {
      push(out[out.length - 1]!.op, s.text);
      continue;
    }
    push(s.op, s.text);
  }
  return out;
}

export function diffWords(before: string, after: string): DiffSegment[] {
  if (before === after) {
    return before ? [{ op: 'keep', text: before }] : [];
  }
  if (!before) return after ? [{ op: 'add', text: after }] : [];
  if (!after) return [{ op: 'remove', text: before }];
  const a = tokenise(before);
  const b = tokenise(after);
  const dp = lcsTable(a, b);
  return emit(a, b, dp);
}

/**
 * Walk a ProseMirror JSON tree (or any tree with `text` leaves +
 * `content` children) and concatenate every text leaf with paragraph-
 * style newlines so the diff inputs match what the user sees on
 * screen. Defensive: accepts `unknown` so it's safe to call on stale
 * `before` snapshots whose schema may have shifted between capture
 * and revert.
 */
export function extractText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as {
    type?: string;
    text?: string;
    content?: unknown[];
  };
  if (typeof n.text === 'string') return n.text;
  if (!Array.isArray(n.content)) return '';
  const parts: string[] = [];
  for (const child of n.content) {
    parts.push(extractText(child));
  }
  // Most block types get a trailing newline; tables / inlines don't.
  const blockTypes = new Set([
    'paragraph',
    'heading',
    'tableRow',
    'listItem',
    'bullet_list',
    'ordered_list',
  ]);
  const sep = n.type && blockTypes.has(n.type) ? '\n' : '';
  return parts.join('') + sep;
}

/**
 * Summarise a diff as `+M added · -N removed words` for the panel's
 * compact entry row. Counts WORDS (excluding punctuation + spaces)
 * so the numbers match the user's intuition.
 */
export function diffStats(segments: DiffSegment[]): { added: number; removed: number } {
  const countWords = (text: string): number => {
    const m = text.match(/[A-Za-z0-9_]+/g);
    return m ? m.length : 0;
  };
  let added = 0;
  let removed = 0;
  for (const s of segments) {
    if (s.op === 'add') added += countWords(s.text);
    else if (s.op === 'remove') removed += countWords(s.text);
  }
  return { added, removed };
}
