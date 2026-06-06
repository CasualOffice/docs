/**
 * Self-correction loop for JSON-mode tool outputs.
 *
 * Llama-3.2-1B is small enough that even with JSON-mode + a strict
 * schema it still hallucinates placeholders (`[Your Name]`,
 * `[Insert here]`, `TBD`, `Lorem ipsum`). The schema enforces the
 * SHAPE but not the SEMANTICS. We've stripped the prompt preamble at
 * the leaf level, but field-internal placeholders slip through and
 * land in the user's doc.
 *
 * This wrapper runs a deterministic validator on the model's first
 * response. If issues are found, it runs ONE retry with the original
 * messages PLUS the model's bad output PLUS an explicit issue list
 * and a "regenerate fixing these" instruction. Costs one extra LLM
 * call when the validator flags something; zero when the first try
 * is clean.
 *
 * Adding a tool-specific validator is a one-liner — pass a function
 * `(out: T) => ValidationIssue[]` that returns issue records. The
 * universal `noPlaceholderValidator` here covers the common cases
 * across resume / cover-letter / memo / blog / academic / slide-deck.
 */

import type { ChatMessage } from './messages';
import { runJsonChat, type JsonChatOptions } from './jsonMode';

export interface ValidationIssue {
  /** Dot-path to the field. Empty when the issue isn't located. */
  field: string;
  /** Truncated sample of the offending text. */
  text: string;
  /** Short human-readable explanation. Goes into the retry prompt. */
  reason: string;
}

export type Validator<T> = (out: T) => ValidationIssue[];

const BRACKET_PLACEHOLDER_RE =
  /\[(?:Your Name|Your Editor's Name|Your Title|Your Email|Insert(?: here)?|Recipient(?:'s name)?|Recipient's Title|Company(?: Name)?|Date|Today's Date|Hiring Manager|Position|Address|Phone|Skills?|Education|placeholder|TODO|TBD)\]/i;
const TBD_RE = /^\s*(?:TBD|TODO|N\/A|XXX+|\?\?\?+)\s*$/i;
const LOREM_RE = /\blorem ipsum\b/i;

function walkStrings(
  node: unknown,
  path: string,
  visit: (path: string, str: string) => void
): void {
  if (typeof node === 'string') {
    visit(path, node);
    return;
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) walkStrings(node[i], `${path}[${i}]`, visit);
    return;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      walkStrings(v, path ? `${path}.${k}` : k, visit);
    }
  }
}

/**
 * Catches the common placeholder leakage patterns that survive
 * JSON-mode + schema enforcement. Run as a default validator on
 * any transformDoc-shaped tool output.
 */
export const noPlaceholderValidator: Validator<unknown> = (out) => {
  const issues: ValidationIssue[] = [];
  walkStrings(out, '', (path, str) => {
    if (BRACKET_PLACEHOLDER_RE.test(str)) {
      const m = str.match(BRACKET_PLACEHOLDER_RE);
      issues.push({
        field: path,
        text: m?.[0] ?? str.slice(0, 60),
        reason: 'contains a [bracket] placeholder',
      });
      return;
    }
    if (TBD_RE.test(str)) {
      issues.push({
        field: path,
        text: str,
        reason: 'is a stub value (TBD / TODO / N/A / ???)',
      });
      return;
    }
    if (LOREM_RE.test(str)) {
      issues.push({
        field: path,
        text: str.slice(0, 60),
        reason: 'contains "lorem ipsum" filler text',
      });
      return;
    }
  });
  return issues;
};

/**
 * Combine multiple validators into one. Returns the concatenated
 * issue list; callers can pass an array of issues straight to the
 * retry prompt formatter.
 */
export function combineValidators<T>(...vs: Validator<T>[]): Validator<T> {
  return (out) => vs.flatMap((v) => v(out));
}

/**
 * Format a validation issue list into a user-message tail that the
 * model can act on. Cap each field's offending text at 60 chars so
 * long strings don't blow the context budget on the retry call.
 */
function formatRetryPrompt(issues: ValidationIssue[]): string {
  const bulletList = issues
    .slice(0, 8) // cap so the retry message stays under a few hundred tokens
    .map((i) => {
      const field = i.field ? `**${i.field}**` : '(top-level)';
      return `- ${field}: ${i.reason} (saw: "${i.text}")`;
    })
    .join('\n');
  return [
    'Your previous JSON output has issues that block its use in the document:',
    '',
    bulletList,
    '',
    'Regenerate the JSON with these fixed. Use only real, concrete content drawn from the source document. ' +
      'Never use bracketed placeholders, "TBD", "TODO", "N/A", or "lorem ipsum" stubs. ' +
      'If the source content does not supply a field, leave that field blank rather than inventing a placeholder.',
  ].join('\n');
}

export interface ValidationOptions<T> extends JsonChatOptions {
  /** Validator to run on the model's first response. Default = the
   *  universal placeholder validator. Pass `combineValidators(...)`
   *  for multiple semantic checks. */
  validator?: Validator<T>;
  /** Disable the retry pass (for tests or known-clean prompts). */
  noRetry?: boolean;
  /** Optional hook the caller can use to log / count retries —
   *  useful for diagnostic UI. */
  onRetry?: (issues: ValidationIssue[]) => void;
}

/**
 * Wraps `runJsonChat` with one validate-and-retry pass.
 *
 *   - First try → if validator returns no issues, return the
 *     response unchanged.
 *   - If issues → build a follow-up `user` message that lists each
 *     issue with its field path + reason + offending text snippet,
 *     thread the original messages + the model's bad output + the
 *     follow-up, and re-run `runJsonChat` once more.
 *   - The retry's result is returned regardless — we don't loop. One
 *     extra LLM call is the cost ceiling.
 */
export async function runJsonChatWithValidation<T = unknown>(
  messages: ChatMessage[],
  opts: ValidationOptions<T> = {}
): Promise<T> {
  const validator: Validator<T> = opts.validator ?? (noPlaceholderValidator as Validator<T>);
  const baseOpts: JsonChatOptions = {
    schema: opts.schema,
    maxTokens: opts.maxTokens,
    temperature: opts.temperature,
    signal: opts.signal,
  };

  const first = await runJsonChat<T>(messages, baseOpts);
  const issues = validator(first);
  if (issues.length === 0 || opts.noRetry) return first;
  opts.onRetry?.(issues);

  const retryMessages: ChatMessage[] = [
    ...messages,
    { role: 'assistant', content: JSON.stringify(first) },
    { role: 'user', content: formatRetryPrompt(issues) },
  ];
  return runJsonChat<T>(retryMessages, {
    ...baseOpts,
    // Slightly higher temp on retry so the model doesn't just echo
    // the placeholder it produced the first time.
    temperature: (baseOpts.temperature ?? 0.2) + 0.05,
  });
}
