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
import { summariseDocStructure } from '../docContext';
import { stripModelPreamble } from '../stripPreamble';
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
  "You are the user's writing assistant for THIS document. " +
  "The 'About this document' block below is your live picture of what they're working on — " +
  "USE IT. Never ask 'what document are you working on?' or 'tell me about your document' — " +
  "you already have it. When the user asks something vague like 'modify this' or 'help me out', " +
  "first restate what you see (one line: 'I see this is a resume for Alex Morgan with Summary, " +
  "Experience, Education, and Skills sections'), then ask ONE specific question about WHAT they " +
  "want changed. Don't enumerate every possibility — pick the one most-likely option and ask. " +
  'Treat their selection (when present) as the focus of any edit. ' +
  "When the user asks for a transformation ('make a table', 'rewrite as a resume', 'format this'), " +
  'answer briefly in chat and tell them the proposal preview is in the document; the editor will ' +
  'stage the actual content for Replace / Insert below / Discard. ' +
  'Prefer plain prose over markdown. Never invent template placeholders like [Your Name] or [Date]. ' +
  "If you don't know about recent events, prices, or external facts, say so honestly — you don't have " +
  "internet access for general lookups (the user can call out 'what is X' to trigger a Wikipedia " +
  'lookup specifically).';

const SELECTION_CAP = 800;
const DOC_CAP = 2400;
const HISTORY_TURNS = 4;

interface BuildSystemOpts {
  docText: string;
  selection: string;
  context: string;
}

function buildSystem({ docText, selection, context }: BuildSystemOpts): string {
  const parts: string[] = [SYSTEM_PROMPT];
  if (context) parts.push(`About this document:\n${context}`);
  if (selection) {
    parts.push(`User's selected text:\n"""\n${selection.slice(0, SELECTION_CAP)}\n"""`);
  }
  if (docText) {
    parts.push(`Document text (may be truncated):\n"""\n${docText.slice(0, DOC_CAP)}\n"""`);
  }
  return parts.join('\n\n');
}

export const chatReplyTool: Tool<ChatReplyArgs> = {
  name: 'chat',
  description: 'General-purpose chat with the document as optional context.',
  async execute(args, ctx): Promise<ToolResult> {
    const docText = args.includeDocContext ? ctx.getDocText() : '';
    const selection = args.includeSelection ? ctx.getSelectionText() : '';
    // Always-on structured summary of the document. Even when the user
    // hasn't toggled "Use doc context", we surface a one-paragraph
    // picture so the model knows what it's living inside (resume vs
    // memo, length, headings, selection state). This is what flips
    // chat from "generic LLM" to "assistant for this doc".
    const context = summariseDocStructure({
      docText: ctx.getDocText(),
      view: ctx.getView(),
      selectionText: ctx.getSelectionText(),
    });
    const messages = [
      {
        role: 'system' as const,
        content: buildSystem({ docText, selection, context }),
      },
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
        text: stripModelPreamble(text),
        meta: { tool: 'chat', elapsedMs: Date.now() - t0 },
      };
    } catch (err) {
      return { kind: 'error', message: (err as Error).message };
    }
  },
};
