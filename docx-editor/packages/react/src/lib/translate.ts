/**
 * Translate helpers — shared between the TranslateDialog (preview) and
 * the editor's in-context "Replace selection" flow.
 *
 * Backend: MyMemory free public endpoint. No API key, rate-limited but
 * fine for casual single-selection translation. Same provider the
 * dialog has used since A5.
 */

import { Fragment, type Node as ProseMirrorNode, type Schema } from 'prosemirror-model';

interface ApiResponse {
  responseData?: { translatedText?: string };
  responseStatus?: number | string;
  responseDetails?: string;
}

/**
 * Translate a single text run via MyMemory. Caller is responsible for
 * splitting longer inputs (the endpoint has a per-request length cap).
 */
export async function translateText(
  text: string,
  source: string,
  target: string,
  signal?: AbortSignal
): Promise<string> {
  if (!text.trim()) return text;
  if (source === target) return text;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${source}|${target}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error('translate-http-error');
  const data = (await res.json()) as ApiResponse;
  const out = data.responseData?.translatedText;
  if (!out || typeof out !== 'string') throw new Error('translate-empty');
  return out;
}

/**
 * Recursively translate every text node inside a Fragment, preserving
 * its block structure and per-text-node marks. Each contiguous
 * mark-run is translated as its own API call so bold/italic/link/etc
 * boundaries land exactly where they did in the original selection.
 *
 * For multi-paragraph selections, each block's content is walked
 * independently; the surrounding paragraph / heading nodes are kept
 * untouched (only their `content` is replaced).
 */
export async function translateFragment(
  fragment: Fragment,
  schema: Schema,
  source: string,
  target: string,
  signal?: AbortSignal
): Promise<Fragment> {
  const children: ProseMirrorNode[] = [];
  for (let i = 0; i < fragment.childCount; i++) {
    const node = fragment.child(i);
    if (node.isText) {
      const text = node.text ?? '';
      const translated = await translateText(text, source, target, signal);
      children.push(schema.text(translated || text, node.marks));
    } else if (node.isLeaf) {
      // Atoms (images, hard breaks, etc.) pass through unchanged.
      children.push(node);
    } else {
      const newContent = await translateFragment(
        node.content,
        schema,
        source,
        target,
        signal
      );
      children.push(node.copy(newContent));
    }
  }
  return Fragment.fromArray(children);
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
