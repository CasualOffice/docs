/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * translateMarkdown — LLM-friendly translation strategy.
 *
 * Per-text-run translation wastes the LLM's context window: each call
 * carries one ~50-char run plus a 200-token system prompt = ~280
 * tokens of system : payload ratio of 5:1. With paragraph batching
 * we improved that, but a markdown round-trip is the real fix.
 *
 *  1. docToMarkdown(doc) — render the live ProseMirror document as
 *     markdown that preserves headings, bold/italic, hyperlinks,
 *     bullets, numbered lists. The model can translate ~600 words at
 *     a time in one call instead of 60.
 *  2. chunkMarkdown — split at paragraph boundaries below ~2000 chars
 *     so each chunk fits comfortably inside Llama-3.2-1B's 4096 ctx
 *     with room for the response.
 *  3. translateMarkdownChunkViaLlm — one LLM call per chunk. The
 *     system prompt is explicit about preserving every markdown
 *     marker so the round-trip back to PM is clean.
 *  4. markdownToFragment (existing) — round-trip the translated
 *     markdown back to PM nodes, marks intact.
 *
 * Wall-clock napkin math for a 200-page doc (~50000 words, ~250 KB
 * markdown): ~125 chunks at 2-4 sec each = 5-8 minutes total.
 * Compare to ~5000 per-run network calls or ~600 per-paragraph
 * batched API calls — and unlike either of those, the LLM doesn't
 * rate-limit.
 *
 * Progress is reported per chunk so the dialog can show a meaningful
 * "Chunk 12 of 125 — '… first 60 chars …'" indicator instead of a
 * stuck per-run counter.
 */

import { type Fragment, type Node as PMNode, type Schema } from 'prosemirror-model';
import { runChat } from './writer/controller';
import { markdownToFragment } from './writer/markdownToFragment';
import { stripModelPreamble } from './writer/stripPreamble';

const LANG_NAME_BY_CODE: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  nl: 'Dutch',
  pl: 'Polish',
  tr: 'Turkish',
  ar: 'Arabic',
  hi: 'Hindi',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
};

const CHUNK_TARGET_CHARS = 2000;

export interface MarkdownTranslateProgress {
  /** 1-based chunk index currently being translated. */
  chunk: number;
  /** Total chunks queued (matches the dialog's "of N" copy). */
  totalChunks: number;
  /** Short preview of the chunk's source text — first ~60 chars. */
  preview: string;
}

// ---------------------------------------------------------------------------
// PM → markdown
// ---------------------------------------------------------------------------

function inlineToMarkdown(node: PMNode): string {
  let text = node.text ?? '';
  if (!text) return '';
  const markNames = new Set(node.marks.map((m) => m.type.name));
  const hyperlink = node.marks.find((m) => m.type.name === 'hyperlink');
  const fontFamily = node.marks.find((m) => m.type.name === 'fontFamily');

  // Inline code first so backticks don't get escaped by emphasis.
  if (fontFamily?.attrs?.fontFamily?.toLowerCase?.().includes('mono')) {
    text = `\`${text}\``;
  } else if (markNames.has('bold') && markNames.has('italic')) {
    text = `***${text}***`;
  } else if (markNames.has('bold')) {
    text = `**${text}**`;
  } else if (markNames.has('italic')) {
    text = `*${text}*`;
  }

  if (hyperlink?.attrs?.href) {
    text = `[${text}](${hyperlink.attrs.href})`;
  }
  return text;
}

function paragraphInlineMarkdown(para: PMNode): string {
  let out = '';
  para.descendants((child) => {
    if (child.isText) {
      out += inlineToMarkdown(child);
      return false;
    }
    if (child.type.name === 'hardBreak' || child.type.name === 'hard_break') {
      out += '  \n';
      return false;
    }
    return true;
  });
  return out;
}

function paragraphHeadingLevel(para: PMNode): number | null {
  // Heading-shaped paragraphs in this fork: bold + fontSize half-pt
  // >= 24. Map roughly to # / ## / ### by size.
  const first = para.firstChild;
  if (!first || !first.isText) return null;
  const bold = first.marks.some((m) => m.type.name === 'bold');
  if (!bold) return null;
  const fontSizeMark = first.marks.find((m) => m.type.name === 'fontSize');
  const size = Number((fontSizeMark?.attrs as { size?: number } | undefined)?.size ?? 0);
  if (size >= 36) return 1;
  if (size >= 30) return 2;
  if (size >= 24) return 3;
  return null;
}

function tableToMarkdown(tableNode: PMNode): string {
  const rows: string[][] = [];
  tableNode.descendants((row) => {
    if (row.type.name !== 'tableRow') return true;
    const cells: string[] = [];
    row.descendants((cell) => {
      if (cell.type.name !== 'tableCell' && cell.type.name !== 'tableHeader') return true;
      let cellText = '';
      cell.descendants((leaf) => {
        if (leaf.isText) cellText += leaf.text ?? '';
        return true;
      });
      cells.push(cellText.replace(/\|/g, '\\|').trim() || ' ');
      return false;
    });
    if (cells.length > 0) rows.push(cells);
    return false;
  });
  if (rows.length === 0) return '';
  const cols = Math.max(...rows.map((r) => r.length));
  const header = rows[0]!;
  while (header.length < cols) header.push(' ');
  const separator = Array(cols).fill('---');
  const body = rows.slice(1).map((r) => {
    while (r.length < cols) r.push(' ');
    return r;
  });
  return [
    `| ${header.join(' | ')} |`,
    `| ${separator.join(' | ')} |`,
    ...body.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');
}

export function docToMarkdown(doc: PMNode): string {
  const parts: string[] = [];
  doc.forEach((node) => {
    if (node.type.name === 'paragraph') {
      const text = paragraphInlineMarkdown(node);
      if (!text.trim()) {
        parts.push('');
        return;
      }
      const heading = paragraphHeadingLevel(node);
      if (heading != null) {
        parts.push(`${'#'.repeat(heading)} ${text.replace(/\*\*/g, '')}`);
        return;
      }
      // Bullet detection — fork prefixes bullets with `•  `.
      if (text.startsWith('•  ')) {
        parts.push(`- ${text.slice(3)}`);
        return;
      }
      const numbered = text.match(/^(\d+)\.\s\s+(.*)$/);
      if (numbered) {
        parts.push(`${numbered[1]}. ${numbered[2]}`);
        return;
      }
      parts.push(text);
      return;
    }
    if (node.type.name === 'table') {
      parts.push(tableToMarkdown(node));
      return;
    }
    if (node.type.name === 'heading') {
      // Schemas that ship a real heading node — render as #-prefixed.
      const level = Number((node.attrs as { level?: number }).level ?? 2);
      parts.push(`${'#'.repeat(Math.max(1, Math.min(6, level)))} ${node.textContent}`);
      return;
    }
    // Fallback — emit plain text.
    const txt = node.textContent?.trim();
    if (txt) parts.push(txt);
  });
  return parts
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

export function chunkMarkdown(md: string, maxChars = CHUNK_TARGET_CHARS): string[] {
  if (md.length <= maxChars) return md.trim() ? [md] : [];
  const blocks = md.split(/\n{2,}/);
  const out: string[] = [];
  let current = '';
  for (const block of blocks) {
    if (current.length === 0) {
      current = block;
      continue;
    }
    if (current.length + 2 + block.length <= maxChars) {
      current = `${current}\n\n${block}`;
    } else {
      out.push(current);
      current = block;
    }
  }
  if (current) out.push(current);
  return out;
}

// ---------------------------------------------------------------------------
// LLM call
// ---------------------------------------------------------------------------

async function translateMarkdownChunkViaLlm(
  md: string,
  source: string,
  target: string,
  signal?: AbortSignal
): Promise<string> {
  const sourceName = LANG_NAME_BY_CODE[source] ?? source;
  const targetName = LANG_NAME_BY_CODE[target] ?? target;
  const system =
    `You are a professional translator translating one markdown chunk at a time. ` +
    `Translate from ${sourceName} into ${targetName}. ` +
    `Preserve ALL markdown syntax exactly — # headings, **bold**, *italic*, ` +
    `[link text](url), - bullets, numbered lists, table pipes, line breaks. ` +
    `Translate ONLY the human-readable text. URLs, code blocks, numbers, and ` +
    `proper-noun acronyms must remain unchanged. ` +
    `Return ONLY the translated markdown — no preamble, no JSON wrapper, no commentary.`;
  const raw = await runChat(
    [
      { role: 'system', content: system },
      { role: 'user', content: md },
    ],
    {
      // Translations of European languages typically grow ~1.3-1.5x;
      // CJK can compress. Budget generously, clip on responses that
      // exceed the per-chunk cap.
      maxTokens: Math.min(2048, Math.ceil(md.length * 1.7) + 128),
      temperature: 0.12,
      signal,
    }
  );
  return stripModelPreamble(raw.trim());
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Snapshot of the live translation state emitted after each chunk
 * completes. The dialog renders this as a live preview so the user
 * watches the doc transform paragraph-by-paragraph instead of staring
 * at a counter.
 */
export interface ChunkTranslationState {
  /** Markdown chunks translated so far, in order. */
  translated: string[];
  /** Source markdown of the chunk currently being translated, or
   *  null if no chunk is in flight (start / finished). */
  inProgress: string | null;
  /** Source markdown of chunks not yet started, in order. */
  remaining: string[];
}

export interface TranslateViaMarkdownOptions {
  signal?: AbortSignal;
  onProgress?: (p: MarkdownTranslateProgress) => void;
  /** Emitted after each chunk's translation lands so the dialog can
   *  paint a "live transforming" preview. */
  onChunkStateChange?: (state: ChunkTranslationState) => void;
}

/**
 * Translate an entire PM document via the markdown round-trip
 * strategy. Returns a Fragment ready to drop into the live doc or
 * preview pane.
 *
 * Caller responsibilities:
 *   - Ensure the Advanced LLM tier is ready before invoking (no
 *     network fallback is attempted here — the dialog should route
 *     to MyMemory/Lingva when the LLM isn't loaded).
 *   - Abort via the AbortSignal if the user cancels.
 */
export async function translateDocViaMarkdown(
  doc: PMNode,
  schema: Schema,
  source: string,
  target: string,
  opts: TranslateViaMarkdownOptions = {}
): Promise<Fragment> {
  const { signal, onProgress, onChunkStateChange } = opts;
  if (source === target) return doc.content;
  const md = docToMarkdown(doc);
  if (!md.trim()) return doc.content;

  const chunks = chunkMarkdown(md);
  const translatedChunks: string[] = [];
  // Initial state — nothing translated yet, everything is remaining.
  onChunkStateChange?.({
    translated: [],
    inProgress: null,
    remaining: chunks.slice(),
  });
  for (let i = 0; i < chunks.length; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const chunk = chunks[i]!;
    onProgress?.({
      chunk: i + 1,
      totalChunks: chunks.length,
      preview: chunk.replace(/\s+/g, ' ').slice(0, 60),
    });
    // Emit "in flight" state BEFORE the LLM call so the dialog shows
    // the spinner-tinted chunk during the wait.
    onChunkStateChange?.({
      translated: translatedChunks.slice(),
      inProgress: chunk,
      remaining: chunks.slice(i + 1),
    });
    const translated = await translateMarkdownChunkViaLlm(chunk, source, target, signal);
    translatedChunks.push(translated);
    // Emit landed state — the just-finished chunk moves from
    // `inProgress` to `translated`. The dialog re-renders the live
    // preview with one more chunk in the target language.
    onChunkStateChange?.({
      translated: translatedChunks.slice(),
      inProgress: null,
      remaining: chunks.slice(i + 1),
    });
  }
  const joined = translatedChunks.join('\n\n');
  return markdownToFragment(joined, schema);
}
