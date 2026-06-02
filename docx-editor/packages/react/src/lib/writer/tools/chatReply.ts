/**
 * chatReply tool — the "talk to the model" fallback when no document-
 * modifying intent matched.
 *
 * Unlike the old `runChat`-direct path, this one budgets context so
 * the prompt cannot overflow Llama-1B's 4096-token window:
 *
 *   - System prompt: ~120 tokens (fixed).
 *   - Selection (if any): hard cap 800 chars (~200 tokens).
 *   - Doc context (if enabled): hard cap 2400 chars (~600 tokens),
 *     taken from the START of the doc so summaries and openings hit.
 *   - History: last 4 turns (~600 tokens).
 *   - Reply budget: 384 tokens.
 *
 * Total prompt ≤ ~1500 tokens, well under the 4096 limit.
 */

import { runChat } from '../controller';
import type { Tool, ToolResult } from './types';

export interface ChatReplyArgs {
  /** The user's message. */
  message: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
  includeDocContext?: boolean;
  includeSelection?: boolean;
  /** Stream callback for live painting in the bubble. */
  onDelta?: (text: string) => void;
}

const SYSTEM_PROMPT =
  'You are an editing assistant living inside a Word-like document editor. ' +
  'Answer the user briefly and helpfully. ' +
  'When the user asks about "this document" or "the selection", use the context provided. ' +
  'Prefer plain prose over markdown. Never invent template placeholders like [Your Name] or [Date].';

const SELECTION_CAP = 800;
const DOC_CAP = 2400;
const HISTORY_TURNS = 4;

function buildSystem(docText: string, selection: string): string {
  const parts: string[] = [SYSTEM_PROMPT];
  if (selection) {
    parts.push(`User's selected text:\n"""\n${selection.slice(0, SELECTION_CAP)}\n"""`);
  }
  if (docText) {
    parts.push(
      `Document context (may be truncated):\n"""\n${docText.slice(0, DOC_CAP)}\n"""`
    );
  }
  return parts.join('\n\n');
}

export const chatReplyTool: Tool<ChatReplyArgs> = {
  name: 'chat',
  description: 'General-purpose chat with the document as optional context.',
  async execute(args, ctx): Promise<ToolResult> {
    const docText = args.includeDocContext ? ctx.getDocText() : '';
    const selection = args.includeSelection ? ctx.getSelectionText() : '';
    const messages = [
      { role: 'system' as const, content: buildSystem(docText, selection) },
      ...(args.history ?? []).slice(-HISTORY_TURNS).map((m) => ({
        role: m.role,
        content: m.content.slice(0, 600),
      })),
      { role: 'user' as const, content: args.message },
    ];
    const t0 = Date.now();
    try {
      const text = await runChat(messages, {
        maxTokens: 384,
        temperature: 0.6,
        onDelta: args.onDelta,
        signal: ctx.signal,
      });
      return {
        kind: 'chat',
        text: text.trim(),
        meta: { tool: 'chat', elapsedMs: Date.now() - t0 },
      };
    } catch (err) {
      return { kind: 'error', message: (err as Error).message };
    }
  },
};
