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
import type { Schema } from 'prosemirror-model';

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

/** Discriminated result the pipeline returns to the UI. */
export type ToolResult =
  | { kind: 'chat'; text: string; meta?: { tool: string; elapsedMs: number } }
  | {
      kind: 'inserted';
      what: 'table' | 'outline' | 'rewrite' | 'translation' | 'snippet';
      summary: string;
      /** True if the insertion landed as a tracked-change suggestion
       *  that needs Accept / Reject. */
      tracked: boolean;
    }
  | { kind: 'error'; message: string };

export interface Tool<Args = unknown> {
  /** Stable identifier matching an `IntentKind` value when possible. */
  name: string;
  /** One-liner for the help / Quick Prompts surface. */
  description: string;
  execute(args: Args, ctx: ToolContext): Promise<ToolResult>;
}
