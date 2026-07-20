/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Main-thread shim over `format-converter.worker.ts`. Lazy-loads the worker
 * (and the 7 MB WASM behind it) on first call.
 *
 * Use this for two flows only:
 *   - Open: foreign format bytes → DOCX bytes → feed our existing parser.
 *   - Export-as: our existing serializer → DOCX bytes → foreign format bytes/string.
 *
 * In-editor live operations stay on the existing TS pipeline — this file
 * is convert-as-bytes only.
 */

import type { Format } from '@schnsrw/core';
import type {
  ConvertRequest,
  DetectRequest,
  WorkerRequest,
  WorkerResponse,
} from './format-converter.worker';

export type { Format };

/** Format we route through the converter. DOCX stays on the native path. */
export type ForeignFormat = Exclude<Format, 'docx' | 'pdf'>;

const FOREIGN_FORMATS: ReadonlySet<ForeignFormat> = new Set(['odt', 'md', 'txt']);

export function isForeignFormat(ext: string): ext is ForeignFormat {
  return FOREIGN_FORMATS.has(ext as ForeignFormat);
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (r: WorkerResponse) => void>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./format-converter.worker.ts', import.meta.url), {
    type: 'module',
  });
  worker.addEventListener('message', (e: MessageEvent<WorkerResponse>) => {
    const resolver = pending.get(e.data.id);
    if (!resolver) return;
    pending.delete(e.data.id);
    resolver(e.data);
  });
  return worker;
}

function send<T extends WorkerResponse>(req: WorkerRequest, transfer: Transferable[]): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    pending.set(req.id, (r) => {
      if (r.ok) resolve(r as T);
      else reject(new Error(r.error));
    });
    getWorker().postMessage(req, transfer);
  });
}

/**
 * Convert from any supported format to DOCX bytes. Used by File → Open
 * when the user picks a .odt/.md/.txt file — we hand the result to the
 * existing DOCX parser.
 */
export async function convertToDocx(bytes: Uint8Array, from: ForeignFormat): Promise<Uint8Array> {
  const req: ConvertRequest = {
    id: nextId++,
    kind: 'convert',
    bytes,
    from,
    to: 'docx',
  };
  const reply = await send<{
    id: number;
    ok: true;
    kind: 'convert';
    bytes?: Uint8Array;
  }>(req, [bytes.buffer]);
  if (!reply.bytes) throw new Error('Converter returned no bytes');
  return reply.bytes;
}

/**
 * Normalize opened-file bytes to DOCX bytes for the editor's DOCX parser.
 *
 * If `fileName` names a foreign format we can convert (.odt / .md / .markdown /
 * .txt / config sources), route the bytes through the WASM converter; otherwise
 * return them unchanged (DOCX and unknown types feed the parser as before).
 *
 * This is the shared entry point for EVERY file-open path. The in-editor
 * File → Open picker already did this inline; the FileSource / home-screen open
 * path did not, so a stored/recent `.md` was handed straight to the DOCX zip
 * parser and rendered as garbage. Both paths now funnel through here.
 *
 * Note: on the conversion branch the input buffer is transferred to the worker
 * (neutered); callers must use the returned buffer and not the original. The
 * pass-through branch leaves the input untouched.
 */
export async function toDocxBytes(bytes: ArrayBuffer, fileName?: string): Promise<ArrayBuffer> {
  const fmt = fileName ? formatFromFilename(fileName) : null;
  if (fmt && isForeignFormat(fmt)) {
    const out = await convertToDocx(new Uint8Array(bytes), fmt);
    // Own exactly the converter's output slice.
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
  }
  return bytes;
}

/**
 * Convert DOCX bytes to a foreign format. Used by File → Export As — the
 * existing serializer produces the DOCX bytes, we hand them off here.
 *
 * Returns either `Uint8Array` (for `odt`) or `string` (for `md`/`txt`).
 */
export async function exportDocxAs(
  docxBytes: Uint8Array,
  to: ForeignFormat
): Promise<Uint8Array | string> {
  const req: ConvertRequest = {
    id: nextId++,
    kind: 'convert',
    bytes: docxBytes,
    from: 'docx',
    to,
  };
  const reply = await send<{
    id: number;
    ok: true;
    kind: 'convert';
    bytes?: Uint8Array;
    text?: string;
  }>(req, [docxBytes.buffer]);
  if (reply.text !== undefined) return reply.text;
  if (reply.bytes !== undefined) return reply.bytes;
  throw new Error('Converter returned neither bytes nor text');
}

/** Sniff the format of a file by its bytes. Falls back to the extension. */
export async function detectFormat(bytes: Uint8Array): Promise<Format | null> {
  const req: DetectRequest = { id: nextId++, kind: 'detect', bytes };
  const reply = await send<{ id: number; ok: true; kind: 'detect'; format: Format | null }>(req, [
    bytes.buffer,
  ]);
  return reply.format;
}

/** Viewer-only formats that bypass the WASM converter. */
export type ViewerFormat = 'rtf' | 'eml';

/** Best-effort guess of the format from a filename. */
export function formatFromFilename(name: string): Format | ViewerFormat | null {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  if (!m) return null;
  const ext = m[1].toLowerCase();
  if (ext === 'docx' || ext === 'odt' || ext === 'md' || ext === 'txt' || ext === 'pdf') {
    return ext;
  }
  if (ext === 'markdown') return 'md';
  if (ext === 'rtf') return 'rtf';
  if (ext === 'eml') return 'eml';
  // Structured-config / plain-source files open in the source editor (no
  // markdown preview). They're highlighted per-extension by CodeMirror; here
  // they just need to route like .txt rather than the DOCX zip parser.
  if (
    ext === 'yml' ||
    ext === 'yaml' ||
    ext === 'toml' ||
    ext === 'conf' ||
    ext === 'cfg' ||
    ext === 'ini' ||
    ext === 'env' ||
    ext === 'properties'
  ) {
    return 'txt';
  }
  return null;
}
