/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Pipeline — single entry point ChatPanel uses for every user message.
 *
 * Flow:
 *
 *   user message
 *      │
 *      ▼
 *   classifyIntent  →  { intent, args } (Llama, JSON-mode constrained)
 *      │
 *      ▼
 *   route to the matching Tool
 *      │
 *      ▼
 *   ToolResult discriminated union
 *
 * The pipeline owns the abort signal, the assembled tool context, and
 * the (intentionally limited) chat history. ChatPanel just renders the
 * result by `kind`.
 */

import { classifyIntent } from './intents';
import { getTool } from './tools/registry';
import type { ToolContext, ToolResult } from './tools/types';

export interface PipelineRequest {
  message: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
  includeDocContext: boolean;
  includeSelection: boolean;
  /** Stream callback (chat-intent only). Other intents are atomic. */
  onDelta?: (text: string) => void;
}

export type PipelineResult = ToolResult & { intent: string };

/** Narrowed result type — the proposal branch of `PipelineResult`. */
export type PipelineProposal = Extract<PipelineResult, { kind: 'proposal' }>;

export async function runPipeline(
  req: PipelineRequest,
  ctxBase: Omit<ToolContext, 'signal'>,
  signal?: AbortSignal
): Promise<PipelineResult> {
  const ctx: ToolContext = { ...ctxBase, signal };

  const hasSelection = ctxBase.getSelectionText().trim().length > 0;
  const intent = await classifyIntent(req.message, { hasSelection }, signal);

  // Route. Each branch hands the user-supplied args to the tool with
  // sane defaults so a sparse classifier output still produces a
  // reasonable result.
  let result: ToolResult;
  switch (intent.intent) {
    case 'insertTable':
      result = await getTool('insertTable').execute(
        {
          topic: intent.topic ?? req.message,
          rows: intent.rows,
          cols: intent.cols,
        },
        ctx
      );
      break;
    case 'summarize':
      result = await getTool('summarize').execute(
        { selectionOnly: hasSelection && /selection|selected/i.test(req.message) },
        ctx
      );
      break;
    case 'rewrite':
      result = await getTool('rewrite').execute(
        { tone: intent.tone, instruction: intent.topic },
        ctx
      );
      break;
    case 'outline':
      result = await getTool('outline').execute(
        {
          topic: intent.topic ?? req.message,
          kind: guessKind(req.message),
        },
        ctx
      );
      break;
    case 'transformDoc':
      result = await getTool('transformDoc').execute(
        {
          target: intent.transformTarget ?? 'resume',
          instruction: intent.instruction,
        },
        ctx
      );
      break;
    case 'research':
      result = await getTool('research').execute({ query: intent.query ?? req.message }, ctx);
      break;
    case 'translate':
    case 'findIssues':
      // Not yet implemented as a tool — fall through to chat with a
      // hint so the model gives a usable manual reply instead of
      // throwing. Will be replaced by dedicated tools in the next pass.
      result = await getTool('chat').execute(
        {
          message: req.message,
          history: req.history,
          includeDocContext: req.includeDocContext,
          includeSelection: req.includeSelection,
          onDelta: req.onDelta,
        },
        ctx
      );
      break;
    case 'chat':
    default:
      result = await getTool('chat').execute(
        {
          message: req.message,
          history: req.history,
          includeDocContext: req.includeDocContext,
          includeSelection: req.includeSelection,
          onDelta: req.onDelta,
        },
        ctx
      );
      break;
  }
  return { ...result, intent: intent.intent };
}

function guessKind(message: string): string | undefined {
  const m = message.toLowerCase();
  if (/\bmemo\b/.test(m)) return 'memo';
  if (/\bessay\b/.test(m)) return 'essay';
  if (/\bletter\b/.test(m)) return 'letter';
  if (/\breport\b/.test(m)) return 'report';
  if (/\barticle\b/.test(m)) return 'article';
  return undefined;
}
