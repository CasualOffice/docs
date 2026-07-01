/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Core types for the DocOps JSON IR.
 *
 * The LLM sees only these types + the tool catalog — no ProseMirror, no OOXML, no Yjs.
 * Every mutation becomes a PM transaction, so it participates in undo and Yjs sync.
 */

/** Semantic block address — never raw PM positions. */
export type Locator =
  | { kind: 'selection' }
  | { kind: 'block'; blockId: string }
  | { kind: 'range'; fromBlockId: string; toBlockId: string }
  | { kind: 'outline'; path: number[] }
  | { kind: 'docStart' }
  | { kind: 'docEnd' };

export type DocOpsErrorCode =
  | 'LOCATOR_NOT_FOUND'
  | 'VALIDATION'
  | 'UNSUPPORTED'
  | 'LOCKED'
  | 'CONFLICT'
  | 'TOO_LARGE';

export type DocOpsSuccess<T = unknown> = {
  ok: true;
  data?: T;
  changedBlockIds?: string[];
  diffSummary?: string;
  suggestionId?: string;
};

export type DocOpsError = {
  ok: false;
  code: DocOpsErrorCode;
  message: string;
  retryable: boolean;
};

export type DocOpsResult<T = unknown> = DocOpsSuccess<T> | DocOpsError;

/** Anthropic-compatible tool definition. */
export interface DocOpsTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}
