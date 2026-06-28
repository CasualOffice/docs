/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Per-mark-run AI helpers — walks a PM Fragment and runs the model
 * against each contiguous text-mark-run individually, then rebuilds
 * the Fragment with the same node + mark structure as the original.
 * That's the only way to keep bold / italic / link / heading
 * boundaries from collapsing the way they did with the original
 * toast-based handler.
 *
 * Surrounding-paragraph context is included as a prompt prefix so
 * flan-t5-small has something to anchor against — "rewrite this
 * sentence to be more concise" hits very different quality when the
 * model can see the paragraphs on either side.
 */

import { Fragment, type Node as ProseMirrorNode, type Schema } from 'prosemirror-model';
import { runTask } from './controller';
import type { WriterTask } from './messages';

export interface RewriteOptions {
  /** Optional context — preceding + following text the model sees. */
  contextBefore?: string;
  contextAfter?: string;
  /** Optional tone preset that maps into the prompt prefix. */
  tone?: 'concise' | 'formal' | 'casual' | 'shorter' | 'longer' | 'polish';
}

function buildPrompt(task: WriterTask, text: string, opts: RewriteOptions): string {
  const tone = opts.tone ?? 'polish';
  const ctxBefore = opts.contextBefore?.trim();
  const ctxAfter = opts.contextAfter?.trim();
  const ctxLine =
    ctxBefore || ctxAfter ? `Context: ${ctxBefore ?? ''} […selection…] ${ctxAfter ?? ''}\n` : '';
  if (task === 'rewrite') {
    const instruction =
      tone === 'concise'
        ? 'Rewrite to be more concise, keeping the same meaning'
        : tone === 'formal'
          ? 'Rewrite in a more formal tone'
          : tone === 'casual'
            ? 'Rewrite in a more casual tone'
            : tone === 'shorter'
              ? 'Rewrite to be shorter while keeping the meaning'
              : tone === 'longer'
                ? 'Expand with more detail while keeping the meaning'
                : 'Improve clarity, grammar, and flow';
    return `${ctxLine}${instruction}: ${text}`;
  }
  if (task === 'summarize') {
    return `${ctxLine}Summarize: ${text}`;
  }
  return `${ctxLine}Fix grammar: ${text}`;
}

/**
 * Walk every text leaf inside `fragment` and replace its text with
 * the model's response, keeping the node's marks intact. Block
 * structure (paragraphs, headings, list items, tables) passes
 * through via `node.copy(newContent)` — the same recipe
 * `translateFragment` uses.
 *
 * Rejects on the first model error so the caller can surface it
 * without leaving the popover in a half-applied state.
 */
export async function rewriteFragment(
  fragment: Fragment,
  schema: Schema,
  task: WriterTask,
  opts: RewriteOptions,
  signal?: AbortSignal
): Promise<Fragment> {
  const children: ProseMirrorNode[] = [];
  for (let i = 0; i < fragment.childCount; i++) {
    const node = fragment.child(i);
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (node.isText && node.text) {
      const prompt = buildPrompt(task, node.text, opts);
      const out = await runTask(task, prompt, signal);
      const cleaned = (out ?? '').trim() || node.text;
      children.push(schema.text(cleaned, node.marks));
    } else if (node.isLeaf) {
      children.push(node);
    } else {
      const newContent = await rewriteFragment(node.content, schema, task, opts, signal);
      children.push(node.copy(newContent));
    }
  }
  return Fragment.fromArray(children);
}

/**
 * Sample text around the selection so the model has anchor context.
 * Up to `max` chars on each side. Stops at paragraph boundaries so
 * we don't feed multi-section noise.
 */
export function sampleContext(
  doc: ProseMirrorNode,
  from: number,
  to: number,
  max = 240
): { before: string; after: string } {
  const start = Math.max(0, from - max);
  const end = Math.min(doc.content.size, to + max);
  const before = doc.textBetween(start, from, ' ', ' ').trim();
  const after = doc.textBetween(to, end, ' ', ' ').trim();
  return { before, after };
}
