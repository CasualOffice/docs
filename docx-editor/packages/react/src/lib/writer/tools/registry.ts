/**
 * Tool registry — single place the pipeline looks up which tool
 * handles which intent.
 */

import { applyRewriteTool } from './applyRewrite';
import { chatReplyTool } from './chatReply';
import { findIssuesTool } from './findIssues';
import { insertOutlineTool } from './insertOutline';
import { insertTableTool } from './insertTable';
import { summarizeDocTool } from './summarizeDoc';
import { transformDocTool } from './transformDoc';
import { translateRangeTool } from './translateRange';
import type { Tool } from './types';

const TOOLS = {
  insertTable: insertTableTool,
  summarize: summarizeDocTool,
  rewrite: applyRewriteTool,
  outline: insertOutlineTool,
  translate: translateRangeTool,
  findIssues: findIssuesTool,
  transformDoc: transformDocTool,
  chat: chatReplyTool,
} as const;

export type ToolName = keyof typeof TOOLS;

export function getTool<N extends ToolName>(name: N): (typeof TOOLS)[N] {
  return TOOLS[name];
}

export function listTools(): { name: ToolName; description: string }[] {
  return (Object.keys(TOOLS) as ToolName[]).map((name) => ({
    name,
    description: (TOOLS[name] as Tool).description,
  }));
}
