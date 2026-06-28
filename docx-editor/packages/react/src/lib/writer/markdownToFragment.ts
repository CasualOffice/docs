/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * markdown → PM Fragment converter for AI insertions.
 *
 * Llama-3.2-1B's output routinely carries markdown — `**bold**`,
 * `*italic*`, `` `code` ``, bullets, numbered lists, headings. The
 * chat panel renders that as proper HTML via `lib/markdown.tsx`, but
 * when the user clicks **Insert at cursor** we need the same content
 * to land in the OOXML model — not as raw asterisks the user has to
 * strip by hand.
 *
 * This walker mirrors `lib/markdown.tsx`'s block + inline parser,
 * but emits ProseMirror nodes whose marks plug straight into the
 * fork's existing OOXML round-trip:
 *
 *  - `bold` / `italic` → matching PM marks (round-trip to `w:b` /
 *    `w:i`).
 *  - `` `code` `` → `fontFamily: Consolas` mark when the schema
 *    has one; otherwise the inline text falls back to plain.
 *  - `[text](url)` → `hyperlink` mark with the `href` attr the
 *    extension expects.
 *  - Headings → paragraphs with the existing `headingStyle` attr
 *    so the layout-painter renders them at the right size.
 *  - Bullets / numbered lists → paragraphs prefixed with `•` /
 *    `N.` (the fork uses paragraph-level `numPr` for real lists,
 *    which needs a registered numbering definition that's beyond
 *    a one-shot insert — the prefix keeps the structure visible).
 *  - Fenced code → a paragraph per line, each carrying the
 *    monospace fontFamily.
 *
 * Every emitted text node carries the caller-supplied extra marks
 * (the `insertion` mark for tracked-change inserts), so the
 * tracked-change Accept / Reject UI owns the final decision.
 */

import { Fragment, type Mark, type Node as ProseMirrorNode, type Schema } from 'prosemirror-model';

interface InlineToken {
  kind: 'text' | 'bold' | 'italic' | 'code' | 'link';
  value: string;
  href?: string;
}

const INLINE_PATTERNS: { kind: InlineToken['kind']; pattern: RegExp }[] = [
  { kind: 'bold', pattern: /\*\*([^*]+)\*\*/ },
  { kind: 'bold', pattern: /__([^_]+)__/ },
  { kind: 'italic', pattern: /(^|[^*])\*([^*]+)\*/ },
  { kind: 'italic', pattern: /(^|[^_])_([^_]+)_/ },
  { kind: 'code', pattern: /`([^`]+)`/ },
  { kind: 'link', pattern: /\[([^\]]+)\]\(([^)]+)\)/ },
];

function tokeniseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    let best: { match: RegExpMatchArray; kind: InlineToken['kind'] } | null = null;
    for (const { kind, pattern } of INLINE_PATTERNS) {
      const m = remaining.match(pattern);
      if (!m) continue;
      if (!best || (m.index ?? 0) < (best.match.index ?? 0)) {
        best = { match: m, kind };
      }
    }
    if (!best || best.match.index === undefined) {
      tokens.push({ kind: 'text', value: remaining });
      break;
    }
    const before = remaining.slice(0, best.match.index);
    if (before.length > 0) tokens.push({ kind: 'text', value: before });
    if (best.kind === 'link') {
      tokens.push({ kind: 'link', value: best.match[1] ?? '', href: best.match[2] ?? '' });
    } else if (best.kind === 'italic') {
      const prefix = best.match[1] ?? '';
      if (prefix.length > 0) tokens.push({ kind: 'text', value: prefix });
      tokens.push({ kind: 'italic', value: best.match[2] ?? '' });
    } else {
      tokens.push({ kind: best.kind, value: best.match[1] ?? '' });
    }
    remaining = remaining.slice(best.match.index + best.match[0].length);
  }
  return tokens;
}

function inlineToTextNodes(
  text: string,
  schema: Schema,
  extraMarks: readonly Mark[]
): ProseMirrorNode[] {
  const out: ProseMirrorNode[] = [];
  const tokens = tokeniseInline(text);
  for (const tok of tokens) {
    if (!tok.value) continue;
    const marks: Mark[] = [...extraMarks];
    if (tok.kind === 'bold' && schema.marks.bold) marks.push(schema.marks.bold.create());
    if (tok.kind === 'italic' && schema.marks.italic) marks.push(schema.marks.italic.create());
    if (tok.kind === 'code' && schema.marks.fontFamily)
      marks.push(schema.marks.fontFamily.create({ fontFamily: 'Consolas' }));
    if (tok.kind === 'link' && schema.marks.hyperlink) {
      marks.push(schema.marks.hyperlink.create({ href: tok.href ?? '' }));
    }
    out.push(schema.text(tok.value, marks));
  }
  return out;
}

function paragraph(
  schema: Schema,
  children: ProseMirrorNode[],
  attrs: Record<string, unknown> = {}
): ProseMirrorNode | null {
  const para = schema.nodes.paragraph;
  if (!para) return null;
  return para.create(attrs, children);
}

interface Block {
  kind: 'paragraph' | 'heading' | 'bullet' | 'numbered' | 'code';
  level?: number;
  lines: string[];
}

function parseBlocks(input: string): Block[] {
  const lines = input.replace(/\r/g, '').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (line.startsWith('```')) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? '').startsWith('```')) {
        code.push(lines[i] ?? '');
        i++;
      }
      blocks.push({ kind: 'code', lines: code });
      i++;
      continue;
    }
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({
        kind: 'heading',
        level: headingMatch[1]!.length,
        lines: [headingMatch[2] ?? ''],
      });
      i++;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      blocks.push({ kind: 'bullet', lines: items });
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      blocks.push({ kind: 'numbered', lines: items });
      continue;
    }
    if (line.trim().length === 0) {
      i++;
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? '').trim().length > 0 &&
      !/^#{1,6}\s+/.test(lines[i] ?? '') &&
      !/^\s*[-*]\s+/.test(lines[i] ?? '') &&
      !/^\s*\d+\.\s+/.test(lines[i] ?? '') &&
      !(lines[i] ?? '').startsWith('```')
    ) {
      para.push(lines[i] ?? '');
      i++;
    }
    blocks.push({ kind: 'paragraph', lines: para });
  }
  return blocks;
}

const HEADING_SIZE_HALFPT: Record<number, number> = {
  1: 36,
  2: 32,
  3: 28,
  4: 26,
  5: 24,
  6: 24,
};

export function markdownToFragment(
  markdown: string,
  schema: Schema,
  extraMarks: readonly Mark[] = []
): Fragment {
  const blocks = parseBlocks(markdown);
  const children: ProseMirrorNode[] = [];
  for (const block of blocks) {
    if (block.kind === 'paragraph') {
      const inline = inlineToTextNodes(block.lines.join(' '), schema, extraMarks);
      const para = paragraph(schema, inline);
      if (para) children.push(para);
      continue;
    }
    if (block.kind === 'heading') {
      const sizeHalfPt = HEADING_SIZE_HALFPT[block.level ?? 3] ?? 26;
      const headingMarks: Mark[] = [...extraMarks];
      if (schema.marks.bold) headingMarks.push(schema.marks.bold.create());
      if (schema.marks.fontSize)
        headingMarks.push(schema.marks.fontSize.create({ size: sizeHalfPt }));
      const inline = inlineToTextNodes(block.lines[0] ?? '', schema, headingMarks);
      const para = paragraph(schema, inline);
      if (para) children.push(para);
      continue;
    }
    if (block.kind === 'bullet' || block.kind === 'numbered') {
      block.lines.forEach((item, idx) => {
        const prefix = block.kind === 'bullet' ? '•  ' : `${idx + 1}.  `;
        const prefixed = inlineToTextNodes(prefix + item, schema, extraMarks);
        const para = paragraph(schema, prefixed, { indentLeft: 360 });
        if (para) children.push(para);
      });
      continue;
    }
    if (block.kind === 'code') {
      const codeMarks: Mark[] = [...extraMarks];
      if (schema.marks.fontFamily)
        codeMarks.push(schema.marks.fontFamily.create({ fontFamily: 'Consolas' }));
      for (const line of block.lines) {
        const inline = [schema.text(line || ' ', codeMarks)];
        const para = paragraph(schema, inline);
        if (para) children.push(para);
      }
      continue;
    }
  }
  return Fragment.fromArray(children);
}
