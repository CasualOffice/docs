/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * suggestActions — picks chat quick-prompt chips that fit the live
 * document. Demonstrates that the assistant knows what the user is
 * working on without forcing them to spell it out.
 *
 * The mapping is intentionally hand-curated rather than asking Llama
 * to brainstorm prompts at boot — these chips are the first thing
 * users see when they open chat, so a fast, deterministic suggestion
 * set beats a 1-2 second LLM cold start every time. Each list is
 * ordered by likely value for that doc type.
 *
 * Five prompts per type — enough variety to demonstrate awareness,
 * few enough to fit one row above the chat input on desktop.
 */

import { inferDocKind, type DocKind } from './docContext';

interface SuggestOptions {
  /** Full plain-text snapshot of the doc — already produced by chat
   *  panel for system-prompt budgeting; passing it here is free. */
  docText: string;
  /** Headings extracted from the doc (compact list, lowercased ok). */
  headings?: string[];
  /** True when the user has a non-empty selection — adds selection-
   *  scoped suggestions ahead of doc-scoped ones. */
  hasSelection?: boolean;
}

const GENERIC_PROMPTS: readonly string[] = [
  'Summarize this document',
  'Find typos and weak phrasing',
  'Brainstorm 5 ideas about…',
  'Outline a memo',
  'Make this more concise',
];

const SELECTION_PROMPTS: readonly string[] = [
  'Rewrite this concisely',
  'Make this more formal',
  'Transform this into a table',
  'Translate to Spanish',
  'Find typos in this passage',
];

const BY_KIND: Record<NonNullable<DocKind>, readonly string[]> = {
  resume: [
    'Make this ATS-friendly',
    'Create a cover letter from this',
    'Find typos and weak phrasing',
    'Add a Skills section',
    'Translate to Spanish',
  ],
  'cover-letter': [
    'Make this more confident',
    'Shorten to 250 words',
    'Make this more formal',
    'Find typos and weak phrasing',
    'Translate to Spanish',
  ],
  memo: [
    'Add a Next Steps section',
    'Make this more action-oriented',
    'Summarize the key points',
    'Create a follow-up email',
    'Find typos and weak phrasing',
  ],
  academic: [
    'Tighten the abstract',
    'Make this more concise',
    'Check the argument flow',
    'Find typos and weak phrasing',
    'Translate to Spanish',
  ],
  'meeting-notes': [
    'Extract action items',
    'Summarize key decisions',
    'Create a follow-up memo',
    'Find typos and weak phrasing',
    'Translate to Spanish',
  ],
  'markdown-doc': [
    'Rewrite this as a blog post',
    'Summarize in 3 bullets',
    'Add a TL;DR section',
    'Find typos and weak phrasing',
    'Translate to Spanish',
  ],
};

const MAX_PROMPTS = 5;

export function getQuickPromptsForDoc(opts: SuggestOptions): string[] {
  const text = opts.docText ?? '';
  const headings = opts.headings ?? [];
  const kind = inferDocKind(text, headings);

  // Order: selection-scoped → kind-specific → generic. Dedupe + cap.
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (p: string): void => {
    const key = p.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(p);
  };

  if (opts.hasSelection) {
    for (const p of SELECTION_PROMPTS) push(p);
  }
  if (kind) {
    for (const p of BY_KIND[kind]) push(p);
  }
  for (const p of GENERIC_PROMPTS) push(p);

  return out.slice(0, MAX_PROMPTS);
}
