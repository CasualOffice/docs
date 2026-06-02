/**
 * findIssues tool — proof-reads the selection (or full doc when
 * nothing's selected) and returns a structured list of issues so the
 * chat bubble can render them as actionable cards.
 *
 * Why a tool (vs raw "list typos"):
 *  - Llama-1B free-form output for proofreading tends to be one of
 *    two failure modes: either it rewrites the whole passage in its
 *    own voice, or it hallucinates issues that aren't there. A JSON
 *    schema with explicit {original, suggestion, reason, kind} fields
 *    keeps it honest — it can only emit issues that fit the shape.
 *  - The result is a CHAT bubble (formatted as a list), not a
 *    document edit. Users typically want to look at the list and
 *    decide which suggestions to apply by hand. Direct insertion of
 *    an "improved" passage is what `applyRewrite` is for.
 */

import { runJsonChat } from '../jsonMode';
import type { Tool, ToolResult } from './types';

export interface FindIssuesArgs {
  /** When true, scan the selection. When false, scan the doc text. */
  selectionOnly?: boolean;
}

interface IssueJson {
  issues: {
    kind: 'typo' | 'grammar' | 'awkward' | 'redundant';
    original: string;
    suggestion: string;
    reason?: string;
  }[];
}

const SCHEMA = {
  type: 'object',
  properties: {
    issues: {
      type: 'array',
      minItems: 0,
      maxItems: 10,
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['typo', 'grammar', 'awkward', 'redundant'] },
          original: { type: 'string', minLength: 1, maxLength: 160 },
          suggestion: { type: 'string', minLength: 1, maxLength: 200 },
          reason: { type: 'string', maxLength: 160 },
        },
        required: ['kind', 'original', 'suggestion'],
      },
    },
  },
  required: ['issues'],
} as const;

const SYSTEM = `You are a careful copy editor reading a passage for issues.

Return a JSON object with an "issues" array. Each issue must have:
- "kind": one of "typo" (spelling), "grammar" (rules), "awkward" (clunky phrasing), "redundant" (filler).
- "original": EXACT substring from the user's passage (≤ 160 chars). Must be a literal copy — do not paraphrase.
- "suggestion": the corrected version.
- "reason": short one-line explanation (optional).

Rules:
- Only report REAL issues. Empty issues array is fine if the passage is clean.
- Do not invent issues. If you're unsure, leave it out.
- Do not rewrite the whole passage. Keep each "original" focused on the problem.
- Output ONLY the JSON object.`;

// Cap the scanned text so the call always fits the 4096 ctx window
// even when summed with the system prompt and JSON output budget.
const SCAN_CAP = 3500;

const KIND_EMOJI: Record<IssueJson['issues'][number]['kind'], string> = {
  typo: '🔤',
  grammar: '📐',
  awkward: '✏️',
  redundant: '✂️',
};

export const findIssuesTool: Tool<FindIssuesArgs> = {
  name: 'findIssues',
  description: 'Find typos and weak phrasing in the selection (or document).',
  async execute(args, ctx): Promise<ToolResult> {
    const raw = args.selectionOnly
      ? ctx.getSelectionText().trim()
      : ctx.getSelectionText().trim() || ctx.getDocText().trim();
    if (!raw) {
      return { kind: 'error', message: 'There is no text to scan.' };
    }
    const passage = raw.slice(0, SCAN_CAP);
    const truncated = raw.length > SCAN_CAP;

    let out: IssueJson;
    try {
      out = await runJsonChat<IssueJson>(
        [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `Passage:\n\n${passage}` },
        ],
        { schema: SCHEMA, maxTokens: 600, temperature: 0.15, signal: ctx.signal }
      );
    } catch (err) {
      return { kind: 'error', message: `Proofread failed — ${(err as Error).message}` };
    }

    const issues = (out.issues ?? []).filter(
      (i) => i.original?.trim() && i.suggestion?.trim()
    );
    if (issues.length === 0) {
      return {
        kind: 'chat',
        text: 'No issues found in the passage. Looks clean!',
      };
    }

    // Render as a markdown bullet list the Markdown component already
    // knows how to paint in chat bubbles.
    const lines = issues.map((i) => {
      const emoji = KIND_EMOJI[i.kind] ?? '•';
      const reason = i.reason ? ` — ${i.reason}` : '';
      return `- ${emoji} **${i.kind}**: \`${i.original}\` → \`${i.suggestion}\`${reason}`;
    });
    const header = `Found **${issues.length}** issue${issues.length === 1 ? '' : 's'}${
      truncated ? ' (scanned first 3.5 KB):' : ':'
    }`;
    return {
      kind: 'chat',
      text: `${header}\n${lines.join('\n')}`,
    };
  },
};
