/**
 * Typed wire protocol between the controller (main thread) and the
 * writer worker. See `docs/internal/10-writing-assistant-design.md` § 6.
 *
 * Every request carries a UUID `id` so responses route back to the
 * correct awaiting promise. `abort` references a previous request's
 * `id` via `targetId`.
 */

import type { WriterBackend } from './capabilities';

export type WriterTask = 'gec' | 'rewrite' | 'summarize';

export type WriterReq =
  | { id: string; kind: 'load'; modelId: string; backend: WriterBackend }
  | {
      id: string;
      kind: 'run';
      modelId: string;
      task: WriterTask;
      input: string;
      opts?: Record<string, unknown>;
    }
  | { id: string; kind: 'abort'; targetId: string }
  | { id: string; kind: 'unload'; modelId: string };

export type WriterErrorCode =
  | 'oom'
  | 'network'
  | 'backend-failed'
  | 'unsupported'
  | 'aborted'
  | 'unknown';

export type WriterRes =
  | { id: string; kind: 'progress'; loaded: number; total: number }
  | { id: string; kind: 'loaded'; modelId: string; backend: WriterBackend; warmupMs: number }
  | { id: string; kind: 'output'; output: string; inferenceMs: number }
  | { id: string; kind: 'error'; code: WriterErrorCode; message: string }
  | { id: string; kind: 'unloaded'; modelId: string };

export function newRequestId(): string {
  // crypto.randomUUID is available in every modern browser; tsup
  // / Vite both polyfill where needed.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID (very old browsers).
  return `wr-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
