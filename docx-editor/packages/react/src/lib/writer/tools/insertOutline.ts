/**
 * insertOutline tool — builds a structured outline (memo / essay /
 * report) directly as PM heading + paragraph nodes.
 *
 * The previous chat path produced bracketed placeholders like
 * `[Your Editor's Name]` and `[Date]` because the model defaulted to
 * a stale memo template it had seen in pre-training. We fix that two
 * ways:
 *
 *  1. JSON schema forces sections with `heading` + `content` strings.
 *     The model can't emit raw `[brackets]` because the schema
 *     describes the artefact (heading text, body text), not a
 *     template form.
 *  2. The system prompt explicitly forbids placeholder text.
 *
 * Sections land in the doc as heading paragraphs (bold, sized by
 * level) followed by body paragraphs — same nodes the layout-painter
 * already knows how to render.
 */

import { markdownToFragment } from '../markdownToFragment';
import { runJsonChat } from '../jsonMode';
import type { Tool, ToolResult } from './types';

export interface OutlineArgs {
  topic: string;
  /** Optional document kind hint: "memo" | "essay" | "report" | "letter". */
  kind?: string;
}

interface OutlineJson {
  title: string;
  sections: { heading: string; content: string }[];
}

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 80 },
    sections: {
      type: 'array',
      minItems: 3,
      maxItems: 6,
      items: {
        type: 'object',
        properties: {
          heading: { type: 'string', minLength: 1, maxLength: 60 },
          content: { type: 'string', minLength: 20, maxLength: 600 },
        },
        required: ['heading', 'content'],
      },
    },
  },
  required: ['title', 'sections'],
} as const;

function systemPromptFor(kind: string): string {
  return `You generate the content for a ${kind} that will be inserted into a Word document.

Return a JSON object with:
- "title": short title for the document (3-10 words).
- "sections": 3-5 sections, each with:
  - "heading": short section heading (2-6 words).
  - "content": 1-2 paragraphs of real, specific prose for that section. Plain text. No markdown. No bullet points.

Critical rules:
- Write REAL content, not a template. Never use bracketed placeholders like [Your Name], [Date], [Recipient], [Insert here].
- Be specific to the user's topic. If a name or date is needed, leave it out or describe it generically ("the project lead", "later this quarter").
- Each section's content must be self-contained and immediately usable.
- Output ONLY the JSON object. No commentary, no markdown fences.`;
}

export const insertOutlineTool: Tool<OutlineArgs> = {
  name: 'outline',
  description: 'Insert a structured outline (memo, essay, report) into the document.',
  async execute(args, ctx): Promise<ToolResult> {
    const kind = (args.kind || guessKind(args.topic) || 'memo').toLowerCase();
    const topic = (args.topic ?? '').trim() || 'general subject';

    let outline: OutlineJson;
    try {
      outline = await runJsonChat<OutlineJson>(
        [
          { role: 'system', content: systemPromptFor(kind) },
          {
            role: 'user',
            content: `${kind.charAt(0).toUpperCase() + kind.slice(1)} topic: ${topic}`,
          },
        ],
        { schema: SCHEMA, maxTokens: 900, temperature: 0.5, signal: ctx.signal }
      );
    } catch (err) {
      return { kind: 'error', message: `Couldn't draft the outline — ${(err as Error).message}` };
    }
    const sections = (outline.sections ?? []).filter((s) => s.heading?.trim() && s.content?.trim());
    if (sections.length === 0) {
      return { kind: 'error', message: 'Model returned no sections.' };
    }

    const view = ctx.getView();
    if (!view) return { kind: 'error', message: 'Editor is not focused.' };

    // Build markdown that markdownToFragment already supports —
    // headings (`#`) + paragraphs — then route through the tracked-
    // change apply path so the user can accept/reject.
    const lines: string[] = [];
    if (outline.title) lines.push(`# ${outline.title}`);
    for (const s of sections) {
      lines.push('');
      lines.push(`## ${s.heading.trim()}`);
      lines.push('');
      lines.push(s.content.trim());
    }
    const md = lines.join('\n');

    // Phase 2: stage as a proposal. Markdown → PM fragment up front so
    // the popover can render a meaningful preview AND the host can
    // commit without reparsing.
    const fragment = markdownToFragment(md, ctx.schema);
    if (fragment.childCount === 0) {
      return { kind: 'error', message: 'Model returned an outline that produced no PM nodes.' };
    }
    return {
      kind: 'proposal',
      what: 'outline',
      summary: `Outline — “${outline.title}” · ${sections.length} sections`,
      fragment,
      // Outline is fresh content inserted at cursor — no selection to
      // overwrite. Replace falls back to Insert at cursor in the
      // popover's commit row.
      replaceRange: null,
      intent: 'outline',
      asTrackedChange: true,
    };
  },
};

function guessKind(topic: string): string | null {
  const t = topic.toLowerCase();
  if (/\bmemo\b/.test(t)) return 'memo';
  if (/\bessay\b/.test(t)) return 'essay';
  if (/\bletter\b/.test(t)) return 'letter';
  if (/\breport\b/.test(t)) return 'report';
  if (/\barticle\b/.test(t)) return 'article';
  return null;
}
