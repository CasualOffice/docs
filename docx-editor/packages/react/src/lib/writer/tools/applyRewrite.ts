/**
 * applyRewrite tool — rewrites the selection in the requested tone
 * and applies the result as a tracked-change suggestion.
 *
 * Why a tool (vs raw chat → markdown insert):
 *  - Plain output (no markdown). The model is constrained by a JSON
 *    schema with one string field, so it can't drift into commentary.
 *  - Tracked-change apply. Goes through `applyRewriteAsSuggestion`
 *    so the user always gets Accept / Reject for any AI edit.
 */

import { Fragment } from 'prosemirror-model';
import { summariseDocStructure } from '../docContext';
import { runJsonChat } from '../jsonMode';
import { stripModelPreamble } from '../stripPreamble';
import type { Tool, ToolResult } from './types';

export interface RewriteArgs {
  /** Tone keyword. */
  tone?: string;
  /** Optional free-form instruction ("make it sound more like Hemingway"). */
  instruction?: string;
}

const SCHEMA = {
  type: 'object',
  properties: {
    rewrite: { type: 'string', minLength: 1 },
  },
  required: ['rewrite'],
} as const;

const TONE_HINTS: Record<string, string> = {
  polish: 'Polish the writing for clarity and flow. Keep length and meaning.',
  concise: 'Make it noticeably more concise. Cut filler and weak phrases.',
  formal: 'Raise the register to formal business English.',
  casual: 'Make it sound conversational and friendly.',
  shorter: 'Shorten by roughly 30%. Keep all key facts.',
  longer: 'Expand with more detail and supporting context.',
};

export const applyRewriteTool: Tool<RewriteArgs> = {
  name: 'rewrite',
  description: 'Rewrite the selection in a chosen tone and apply as a tracked change.',
  async execute(args, ctx): Promise<ToolResult> {
    const selection = ctx.getSelectionText().trim();
    if (!selection) {
      return { kind: 'error', message: 'Select the text you want to rewrite first.' };
    }
    const view = ctx.getView();
    if (!view) return { kind: 'error', message: 'Editor is not focused.' };

    const toneHint =
      (args.tone && TONE_HINTS[args.tone.toLowerCase()]) ||
      TONE_HINTS.polish;
    const extra = args.instruction?.trim();
    // Pass the structural context so the model knows whether this is
    // a resume bullet, an academic paragraph, a memo body, etc. —
    // significantly improves rewrite quality for docs whose tone the
    // selection itself doesn't fully telegraph.
    const docContext = summariseDocStructure({
      docText: ctx.getDocText(),
      view: ctx.getView(),
      selectionText: selection,
    });

    const system = `You are an expert editor working inside the user's document.
${toneHint}
${extra ? `Additional instruction: ${extra}` : ''}

About the document (for tone awareness — do not mention this in the output):
${docContext}

Preserve the original language, proper nouns, and any inline structure (bullets stay bullets).
Return ONLY a JSON object: {"rewrite": "<the rewritten text, plain prose, no markdown>"}.`;

    let out: { rewrite: string };
    try {
      out = await runJsonChat<{ rewrite: string }>(
        [
          { role: 'system', content: system.trim() },
          { role: 'user', content: `Original:\n\n${selection}` },
        ],
        { schema: SCHEMA, maxTokens: Math.min(512, Math.ceil(selection.length * 1.4) + 64), temperature: 0.4, signal: ctx.signal }
      );
    } catch (err) {
      return { kind: 'error', message: `Rewrite failed — ${(err as Error).message}` };
    }

    const replacement = stripModelPreamble(out.rewrite);
    if (!replacement) return { kind: 'error', message: 'Model returned an empty rewrite.' };

    const { from, to } = view.state.selection;
    // Build a Fragment of paragraphs from the rewrite. Splitting on
    // blank lines keeps multi-paragraph rewrites readable; a single
    // paragraph just becomes one paragraph.
    const paraType = ctx.schema.nodes.paragraph;
    if (!paraType) return { kind: 'error', message: 'Editor schema is missing paragraph.' };
    const paragraphs = replacement.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    const replacementFragment = Fragment.fromArray(
      paragraphs.map((p) => paraType.create(null, ctx.schema.text(p)))
    );

    // Phase 2: stage the rewrite as a proposal — no doc mutation
    // here. The inline preview popover lets the user diff against the
    // original (Source pane) and pick Replace / Insert below / Try
    // again / Discard. On Replace with `asTrackedChange: true`, the
    // popover routes through `applyRewriteAsSuggestion` so the final
    // edit still lands as Google-Docs-style tracked changes.
    return {
      kind: 'proposal',
      what: 'rewrite',
      summary: `Rewrite — ${replacement.length} chars`,
      fragment: replacementFragment,
      replaceRange: { from, to },
      intent: 'rewrite',
      asTrackedChange: true,
    };
  },
};
