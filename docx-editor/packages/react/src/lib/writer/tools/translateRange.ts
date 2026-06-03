/**
 * translateRange tool — LLM-backed translation that bypasses MyMemory
 * entirely when the Advanced LLM tier is loaded.
 *
 * Why this exists:
 *  - MyMemory is the only free translation API we can call from a
 *    static page, and it rate-limits hard ("Couldn't reach the
 *    translation service" is what the user just hit twice). When the
 *    user already paid the 880 MB cost of Llama-3.2-1B, asking that
 *    same model to translate is strictly better than gambling on
 *    MyMemory's quota.
 *  - Translation through the same JSON-mode path used elsewhere
 *    avoids the "model adds commentary around the translation"
 *    failure mode. The schema is a single string field.
 *  - The result lands as a tracked-change suggestion, just like
 *    rewrite, so the user keeps Accept / Reject control.
 *
 * Scope today: translates the user's *selection* in place. The full
 * Translate-Document dialog still uses MyMemory because per-run
 * granularity for a 50-page doc would take far too long via 1B
 * sequential calls — that's the next ship.
 */

import { Fragment } from 'prosemirror-model';
import { applyRewriteAsSuggestion } from '../applyAsSuggestion';
import { runJsonChat } from '../jsonMode';
import { stripModelPreamble } from '../stripPreamble';
import type { Tool, ToolResult } from './types';

export interface TranslateArgs {
  /** Target language. ISO code or natural-language name both accepted. */
  targetLanguage?: string;
  /** Optional source language hint. */
  sourceLanguage?: string;
}

const SCHEMA = {
  type: 'object',
  properties: {
    translation: { type: 'string', minLength: 1 },
  },
  required: ['translation'],
} as const;

const COMMON_LANGS: Record<string, string> = {
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  nl: 'Dutch',
  pl: 'Polish',
  ru: 'Russian',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  ar: 'Arabic',
  hi: 'Hindi',
  tr: 'Turkish',
};

function resolveLanguageName(input?: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (COMMON_LANGS[lower]) return COMMON_LANGS[lower];
  // Already a language name — title-case it.
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export const translateRangeTool: Tool<TranslateArgs> = {
  name: 'translate',
  description: 'Translate the selected text via the on-device LLM.',
  async execute(args, ctx): Promise<ToolResult> {
    const selection = ctx.getSelectionText().trim();
    if (!selection) {
      return {
        kind: 'error',
        message: 'Select the text you want translated first.',
      };
    }
    const target = resolveLanguageName(args.targetLanguage);
    if (!target) {
      return {
        kind: 'error',
        message: 'Tell me which language to translate into (e.g. "translate to Spanish").',
      };
    }
    const view = ctx.getView();
    if (!view) return { kind: 'error', message: 'Editor is not focused.' };

    const sourceHint = resolveLanguageName(args.sourceLanguage);
    const system =
      `You are a professional translator. ` +
      `Translate the user's text into ${target}${sourceHint ? ` from ${sourceHint}` : ''}. ` +
      `Preserve proper nouns, technical terms, and original punctuation style. ` +
      `Return ONLY a JSON object: {"translation": "<the translation>"}. ` +
      `No commentary, no quotation marks around the whole reply.`;

    let out: { translation: string };
    try {
      out = await runJsonChat<{ translation: string }>(
        [
          { role: 'system', content: system },
          { role: 'user', content: selection },
        ],
        {
          schema: SCHEMA,
          maxTokens: Math.min(768, Math.ceil(selection.length * 1.6) + 64),
          temperature: 0.2,
          signal: ctx.signal,
        }
      );
    } catch (err) {
      return {
        kind: 'error',
        message: `Translation failed — ${(err as Error).message}`,
      };
    }

    const translation = stripModelPreamble(out.translation);
    if (!translation) {
      return { kind: 'error', message: 'Model returned an empty translation.' };
    }

    const paraType = ctx.schema.nodes.paragraph;
    if (!paraType) {
      return { kind: 'error', message: 'Editor schema is missing paragraph.' };
    }
    // Translation can be multi-paragraph if the source was. Split on
    // blank lines and rebuild as paragraph nodes so the OOXML round-
    // trip preserves the structure.
    const paragraphs = translation.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    const fragment = Fragment.fromArray(
      paragraphs.map((p) => paraType.create(null, ctx.schema.text(p)))
    );

    const { from, to } = view.state.selection;
    applyRewriteAsSuggestion({ view, from, to, replacement: fragment });

    // Phase 1 holdover — commits as tracked-change suggestion. Phase 2
    // converts to the inline preview popover path.
    return {
      kind: 'chat',
      text: `Translated to ${target}. Accept or reject in the document's tracked-change review bar.`,
    };
  },
};
