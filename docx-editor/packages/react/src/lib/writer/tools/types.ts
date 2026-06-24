/**
 * Tool types — MCP-flavoured but local to the editor.
 *
 * A `Tool` is the contract a specialist agent satisfies: given
 * structured args + an editor context, it produces a structured
 * result the ChatPanel knows how to render (insert table, insert
 * tracked-change, render bubble, surface error).
 *
 * Result is a discriminated union so the panel's render path is
 * exhaustive — no string-matching on free-form replies.
 */

import type { EditorView } from 'prosemirror-view';
import type { Fragment, Schema } from 'prosemirror-model';

export interface ToolContext {
  /** Returns the full document text — caller decides whether the tool
   *  truncates / chunks it. */
  getDocText: () => string;
  /** Returns the currently-selected text (empty string if no selection). */
  getSelectionText: () => string;
  /** Active editor view, or `null` if the doc isn't focused. Tools
   *  that emit edits need this. */
  getView: () => EditorView | null;
  /** Schema for building PM nodes. */
  schema: Schema;
  signal?: AbortSignal;
}

/**
 * Per the AI-editor research (`docs/internal/11-ai-editor-research.md`),
 * every shipping AI editor STAGES output in a preview the user must
 * explicitly accept — none of them write the model's reply straight
 * into the doc. We mirror that: tools produce a `proposal` that the
 * inline preview popover renders with Replace / Insert below / Try
 * again / Discard buttons. The doc only mutates when the user clicks
 * one of those.
 *
 * `chat`  — text-only reply, rendered in the chat bubble. Used for
 *           summaries, find-issues lists, plain Q&A.
 * `proposal` — structured draft the popover renders. The shape varies
 *           by `what`; the host knows how to commit each one.
 * `error` — surfaced as an error bubble in chat.
 */
export type ToolResult =
  | { kind: 'chat'; text: string; meta?: { tool: string; elapsedMs: number } }
  | {
      kind: 'proposal';
      what: 'table' | 'outline' | 'rewrite' | 'translation' | 'snippet';
      /** Short summary line for the chat bubble + popover title. */
      summary: string;
      /** PM Fragment ready to insert/replace. Always plain PM nodes —
       *  no markdown — so the popover can both render a preview and
       *  the host can commit without reparsing. */
      fragment: Fragment;
      /** Range the proposal SHOULD replace if the user picks Replace.
       *  When null, Replace falls back to "insert at cursor". */
      replaceRange: { from: number; to: number } | null;
      /** Originating intent — drives the popover's title icon + the
       *  "Try again" handler. Loose `string` because the pipeline
       *  also stamps the classifier's `IntentKind` on every result;
       *  the popover switches on known cases and falls through. */
      intent: string;
      /** Whether the commit should land as a tracked-change
       *  suggestion (insertion/deletion marks) or a plain edit.
       *  Defaults true for rewrite/translate (so the user keeps an
       *  Accept/Reject in the doc body); false for fresh inserts. */
      asTrackedChange?: boolean;
    }
  | { kind: 'error'; message: string };

export interface Tool<Args = unknown> {
  /** Stable identifier matching an `IntentKind` value when possible. */
  name: string;
  /** One-liner for the help / Quick Prompts surface. */
  description: string;
  execute(args: Args, ctx: ToolContext): Promise<ToolResult>;
}
