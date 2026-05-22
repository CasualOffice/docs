/// <reference lib="webworker" />
/**
 * Format converter Web Worker — bridges to @schnsrw/core (WASM).
 *
 * Vite picks this file up via `new Worker(new URL('./format-converter.worker.ts', import.meta.url), { type: 'module' })`
 * in `format-converter.ts` and bundles it as a separate chunk. The WASM
 * artefact (~7 MB) is lazy-loaded on first message — the chunk only
 * lands in the browser when the user opens or exports a non-DOCX file.
 */

import { init, convert, convertToString, detectFormat } from '@schnsrw/core';
import type { Format } from '@schnsrw/core';

declare const self: DedicatedWorkerGlobalScope;

export interface ConvertRequest {
  id: number;
  kind: 'convert';
  bytes: Uint8Array;
  from?: Format;
  to: Format;
}

export interface DetectRequest {
  id: number;
  kind: 'detect';
  bytes: Uint8Array;
}

export type WorkerRequest = ConvertRequest | DetectRequest;

export interface ConvertOk {
  id: number;
  ok: true;
  kind: 'convert';
  /** Binary output (docx/odt/pdf) — undefined when `text` is set. */
  bytes?: Uint8Array;
  /** UTF-8 output (md/txt) — undefined when `bytes` is set. */
  text?: string;
}

export interface DetectOk {
  id: number;
  ok: true;
  kind: 'detect';
  format: Format | null;
}

export interface WorkerErr {
  id: number;
  ok: false;
  error: string;
}

export type WorkerResponse = ConvertOk | DetectOk | WorkerErr;

let initialized = false;

async function ensureInit(): Promise<void> {
  if (initialized) return;
  await init();
  initialized = true;
}

const TEXT_FORMATS: ReadonlySet<Format> = new Set(['md', 'txt']);

self.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  try {
    await ensureInit();
    if (msg.kind === 'detect') {
      const det = await detectFormat(msg.bytes);
      const reply: DetectOk = { id: msg.id, ok: true, kind: 'detect', format: det.format };
      self.postMessage(reply);
      return;
    }
    // kind === 'convert'
    if (TEXT_FORMATS.has(msg.to)) {
      const text = await convertToString(msg.bytes, { from: msg.from, to: msg.to });
      const reply: ConvertOk = { id: msg.id, ok: true, kind: 'convert', text };
      self.postMessage(reply);
    } else {
      const bytes = await convert(msg.bytes, { from: msg.from, to: msg.to });
      const reply: ConvertOk = { id: msg.id, ok: true, kind: 'convert', bytes };
      // Transfer the underlying buffer to avoid the structured-clone copy.
      self.postMessage(reply, [bytes.buffer as ArrayBuffer]);
    }
  } catch (err) {
    const reply: WorkerErr = {
      id: msg.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(reply);
  }
});
