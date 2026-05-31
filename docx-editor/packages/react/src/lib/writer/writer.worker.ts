/// <reference lib="webworker" />
/**
 * Writer worker — P1 stub.
 *
 * The protocol matches what the real transformers.js implementation
 * will do in P2, so the controller + UI code we ship in P1 doesn't
 * change. The stub fakes:
 *
 * - download progress (10 streamed `progress` events over ~3 s)
 * - load completion with a small `warmupMs`
 * - per-task inference (echoes the input with a prefix; ~150 ms latency)
 * - abort handling
 * - unload
 *
 * Replace this file in P2 with the real pipeline runner.
 */

import type { WriterReq, WriterRes } from './messages';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

interface LoadedModel {
  modelId: string;
  backend: string;
  loadedAt: number;
}

let loaded: LoadedModel | null = null;
const aborted = new Set<string>();

function post(msg: WriterRes): void {
  ctx.postMessage(msg);
}

ctx.addEventListener('message', (e: MessageEvent<WriterReq>) => {
  void handle(e.data);
});

async function handle(req: WriterReq): Promise<void> {
  switch (req.kind) {
    case 'load':
      await handleLoad(req.id, req.modelId, req.backend);
      return;
    case 'run':
      await handleRun(req.id, req.modelId, req.task, req.input);
      return;
    case 'abort':
      aborted.add(req.targetId);
      return;
    case 'unload':
      handleUnload(req.id, req.modelId);
      return;
  }
}

async function handleLoad(id: string, modelId: string, backend: string): Promise<void> {
  if (loaded?.modelId === modelId) {
    post({ id, kind: 'loaded', modelId, backend: loaded.backend as never, warmupMs: 0 });
    return;
  }
  // Simulate streamed download progress — total fake size, 10 chunks
  // over ~3 seconds so the UI shows a moving bar.
  const totalBytes = 95 * 1024 * 1024;
  const chunkBytes = Math.floor(totalBytes / 10);
  for (let i = 1; i <= 10; i++) {
    if (aborted.has(id)) {
      post({ id, kind: 'error', code: 'aborted', message: 'Aborted' });
      aborted.delete(id);
      return;
    }
    await sleep(300);
    post({ id, kind: 'progress', loaded: chunkBytes * i, total: totalBytes });
  }
  // Pretend warm-up inference.
  await sleep(120);
  loaded = { modelId, backend, loadedAt: Date.now() };
  post({ id, kind: 'loaded', modelId, backend: backend as never, warmupMs: 120 });
}

async function handleRun(id: string, modelId: string, task: string, input: string): Promise<void> {
  if (!loaded || loaded.modelId !== modelId) {
    post({
      id,
      kind: 'error',
      code: 'unsupported',
      message: 'Model not loaded — load it first.',
    });
    return;
  }
  const t0 = Date.now();
  await sleep(120 + Math.random() * 60);
  if (aborted.has(id)) {
    post({ id, kind: 'error', code: 'aborted', message: 'Aborted' });
    aborted.delete(id);
    return;
  }
  const output = stubInference(task, input);
  post({ id, kind: 'output', output, inferenceMs: Date.now() - t0 });
}

function handleUnload(id: string, modelId: string): void {
  if (loaded?.modelId === modelId) loaded = null;
  post({ id, kind: 'unloaded', modelId });
}

function stubInference(task: string, input: string): string {
  // Deterministic stub so tests can assert. The real worker swaps these
  // for actual model calls in P2.
  switch (task) {
    case 'gec':
      // Pretend we fixed grammar by stripping doubled spaces and
      // capitalising the first letter — visible-but-not-actually-AI.
      return capitaliseFirst(input.replace(/\s+/g, ' ').trim());
    case 'rewrite':
      return `[rewritten] ${input.trim()}`;
    case 'summarize':
      return `[summary] ${input.trim().slice(0, 80)}${input.length > 80 ? '…' : ''}`;
    default:
      return input;
  }
}

function capitaliseFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
