/**
 * Translate helpers — shared between the TranslateDialog (preview),
 * the right-click quick-translate, and the full-document
 * TranslateDocumentDialog.
 *
 * Backend: MyMemory free public endpoint. No API key. The free tier
 * is rate-limited (~5 req/sec, daily char quota), so we layer three
 * reliability tricks on top of the raw fetch:
 *
 *  1. An in-memory cache keyed by `${source}|${target}|${text}` so
 *     language-flips / re-runs don't re-hit the network for inputs
 *     we've already seen.
 *  2. Exponential backoff on 429 / 5xx with a small retry budget.
 *  3. Skip empty / whitespace-only / no-letter runs (punctuation,
 *     pure digits) — there's no value in translating "," and they
 *     burn quota.
 *
 * `translateFragment` reports progress through an optional callback
 * so the dialog can keep the user informed during long docs.
 */

import { Fragment, type Node as ProseMirrorNode, type Schema } from 'prosemirror-model';

interface ApiResponse {
  responseData?: { translatedText?: string };
  responseStatus?: number | string;
  responseDetails?: string;
}

const cache = new Map<string, string>();

const RETRY_DELAYS_MS = [800, 1800, 4000] as const;

function shouldSkip(text: string): boolean {
  // Empty, whitespace, or no-letter runs (digits, punctuation only).
  // `\p{L}` covers every script's letters so non-Latin docs still
  // route real text through the API.
  if (!text || !text.trim()) return true;
  return !/\p{L}/u.test(text);
}

/**
 * Translate a single text run. Cached, retried, and skipped where
 * appropriate. Returns the original text on skip (so the caller can
 * paste it back into the Fragment unchanged).
 *
 * Always uses MyMemory — per-run on-device LLM calls are 3-5 sec each
 * and `translateFragment` runs them sequentially. A 50-run doc would
 * take 3+ minutes wall-clock with no incremental render, locking the
 * tab. The chat `translateRange` tool still uses Llama for SHORT
 * single-passage translation; this lower-level per-run helper does
 * not.
 */
export async function translateText(
  text: string,
  source: string,
  target: string,
  signal?: AbortSignal
): Promise<string> {
  if (source === target) return text;
  if (shouldSkip(text)) return text;

  const key = `${source}|${target}|${text}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${source}|${target}`;
      const res = await fetch(url, { signal });
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`translate-http-${res.status}`);
      }
      if (!res.ok) throw new Error(`translate-http-${res.status}`);
      const data = (await res.json()) as ApiResponse;
      // MyMemory occasionally returns 200 with a quota-exceeded payload;
      // surface it as a retryable error if `responseStatus` is 4xx-ish.
      const status = Number(data.responseStatus);
      if (Number.isFinite(status) && status >= 400) {
        throw new Error(`translate-status-${status}`);
      }
      const out = data.responseData?.translatedText;
      if (!out || typeof out !== 'string') throw new Error('translate-empty');
      cache.set(key, out);
      return out;
    } catch (err) {
      const e = err as Error;
      if (e.name === 'AbortError') throw e;
      lastErr = e;
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay === undefined) break;
      await sleep(delay, signal);
    }
  }
  throw lastErr ?? new Error('translate-failed');
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const id = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(id);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true }
    );
  });
}

export interface TranslateProgress {
  /** How many text runs we've finished. */
  completed: number;
  /** Total runs to translate (excludes skips). */
  total: number;
}

export interface TranslateFragmentOptions {
  /** Per-run progress callback for UI feedback. */
  onProgress?: (p: TranslateProgress) => void;
}

/**
 * Recursively translate every text leaf in `fragment`, preserving the
 * block structure (paragraphs, headings, lists, tables) and the marks
 * on each text node. Skipped / cached runs don't count against
 * progress totals so the bar reflects real work.
 */
export async function translateFragment(
  fragment: Fragment,
  schema: Schema,
  source: string,
  target: string,
  signal?: AbortSignal,
  opts: TranslateFragmentOptions = {}
): Promise<Fragment> {
  // First pass: count translatable text runs so the progress bar can
  // resolve to a real percentage.
  const total = countTranslatable(fragment, source, target);
  let completed = 0;
  const tick = (): void => {
    completed++;
    opts.onProgress?.({ completed, total });
  };
  return walk(fragment, schema, source, target, signal, tick);
}

function countTranslatable(fragment: Fragment, source: string, target: string): number {
  if (source === target) return 0;
  let count = 0;
  fragment.descendants((node) => {
    if (node.isText && node.text && !shouldSkip(node.text)) count++;
  });
  return count;
}

async function walk(
  fragment: Fragment,
  schema: Schema,
  source: string,
  target: string,
  signal: AbortSignal | undefined,
  tick: () => void
): Promise<Fragment> {
  const children: ProseMirrorNode[] = [];
  for (let i = 0; i < fragment.childCount; i++) {
    const node = fragment.child(i);
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (node.isText) {
      const text = node.text ?? '';
      const translated = await translateText(text, source, target, signal);
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      // Only count as work if we actually hit the API.
      if (!shouldSkip(text) && source !== target) tick();
      children.push(schema.text(translated || text, node.marks));
      // Yield to the main thread so React can paint the progress
      // update and the Cancel button can register. Without this the
      // tab feels stuck on a 100-run doc even though each individual
      // API call is fast.
      await yieldToMainThread();
    } else if (node.isLeaf) {
      children.push(node);
    } else {
      const newContent = await walk(node.content, schema, source, target, signal, tick);
      children.push(node.copy(newContent));
    }
  }
  return Fragment.fromArray(children);
}

function yieldToMainThread(): Promise<void> {
  // setTimeout(0) is the standard "release the event loop for one
  // tick" pattern — schedules the continuation after pending UI work.
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * For tests / dev tools — wipe the in-memory translation cache.
 */
export function clearTranslateCacheForTests(): void {
  cache.clear();
}

/**
 * Top-ten globally-spoken languages plus a few that round out coverage.
 * Codes match MyMemory's ISO 639-1 expectations.
 */
export const TRANSLATE_LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'pl', label: 'Polish' },
  { code: 'tr', label: 'Turkish' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh', label: 'Chinese (Simplified)' },
];
