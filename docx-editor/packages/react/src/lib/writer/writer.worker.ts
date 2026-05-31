/// <reference lib="webworker" />
/**
 * Writer worker — real implementation.
 *
 * Wires `@huggingface/transformers` (the Xenova lineage continued
 * under the official HF org). On `load` we instantiate a pipeline
 * for the requested model id and stream the HF CDN's progress
 * callbacks back to the controller. On `run` we dispatch to the
 * right pipeline per task — text-to-text generation for grammar /
 * tone / summarize, all driven through flan-t5-small's instruction
 * prefix.
 *
 * Backend ranking: WebGPU > WASM-SIMD > WASM. The controller picks
 * the recommended backend at boot and the worker passes it through
 * to `pipeline(..., { device })`. If the requested device fails
 * during init we fall back to WASM-SIMD.
 */

import { pipeline, env } from '@huggingface/transformers';
import type { WriterReq, WriterRes } from './messages';

// `@huggingface/transformers` doesn't export `Pipeline` / `ProgressInfo`
// as named types — pipelines are inferred from the task literal via
// `AllTasks[T]`. Define the shapes we touch locally so the worker
// stays self-contained and survives upstream rename churn.
type ProgressInfo = {
  status?: string;
  file?: string;
  loaded?: number;
  total?: number;
};
type Text2TextPipeline = (
  text: string,
  opts: Record<string, unknown>
) => Promise<Array<{ generated_text: string }>>;

const ctx = self as unknown as DedicatedWorkerGlobalScope;

// Cache model weights in the browser's Cache API so re-enabling is a
// cache hit. The library does this by default; we just make the
// behaviour explicit here so a future review tells the reader at a
// glance.
env.useBrowserCache = true;
env.allowLocalModels = false;

interface LoadedPipeline {
  modelId: string;
  backend: string;
  pipe: Text2TextPipeline;
}

let loaded: LoadedPipeline | null = null;
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
      await handleUnload(req.id, req.modelId);
      return;
  }
}

/**
 * Map our `WriterBackend` to the transformers.js device key. The
 * library accepts `'webgpu' | 'wasm' | 'cpu' | 'auto' | ...`; the
 * SIMD distinction is handled internally based on browser caps, so
 * we route both `wasm` and `wasm-simd` to `'wasm'`.
 */
function deviceForBackend(backend: string): 'webgpu' | 'wasm' {
  return backend === 'webgpu' ? 'webgpu' : 'wasm';
}

async function handleLoad(id: string, modelId: string, backend: string): Promise<void> {
  if (loaded?.modelId === modelId) {
    post({
      id,
      kind: 'loaded',
      modelId,
      backend: loaded.backend as never,
      warmupMs: 0,
    });
    return;
  }
  const t0 = Date.now();
  // Streamed download progress from HF — `progress_callback` fires
  // once per file (config, tokeniser, encoder, decoder, ...) with
  // `{loaded, total}` byte counts. We bucket them into a single
  // monotonic 0..1 bar by summing the totals.
  let totalBytes = 0;
  let loadedBytes = 0;
  const fileTotals = new Map<string, number>();

  const onProgress = (p: ProgressInfo): void => {
    if (aborted.has(id)) return;
    if (p.status === 'progress' && typeof p.file === 'string') {
      const prev = fileTotals.get(p.file);
      if (prev === undefined && typeof p.total === 'number') {
        fileTotals.set(p.file, p.total);
        totalBytes += p.total;
      }
      if (typeof p.loaded === 'number') {
        // Per-file delta; rebuild loadedBytes from the running totals.
        loadedBytes = 0;
        for (const [, t] of fileTotals) loadedBytes += t;
        // ^ rough — we don't have per-file `loaded` accumulated, so
        // post the partial loaded for the current file added to
        // previous-file totals. For the UI's purposes (0..1 bar) the
        // bucketed approximation is enough.
        post({ id, kind: 'progress', loaded: p.loaded, total: p.total ?? p.loaded });
      }
    }
  };

  try {
    const device = deviceForBackend(backend);
    const pipe = (await pipeline('text2text-generation', modelId, {
      device,
      progress_callback: onProgress,
    })) as unknown as Text2TextPipeline;
    if (aborted.has(id)) {
      aborted.delete(id);
      post({ id, kind: 'error', code: 'aborted', message: 'Aborted' });
      return;
    }
    loaded = { modelId, backend, pipe };
    post({
      id,
      kind: 'loaded',
      modelId,
      backend: backend as never,
      warmupMs: Date.now() - t0,
    });
  } catch (err) {
    const msg = (err as Error).message || 'load-failed';
    // WebGPU init can throw if the device handle disappears; the
    // controller already passes the resolved backend, so a single
    // fallback to WASM here keeps the user moving without another
    // round-trip through the UI.
    if (backend === 'webgpu' && !aborted.has(id)) {
      try {
        const pipe = (await pipeline('text2text-generation', modelId, {
          device: 'wasm',
          progress_callback: onProgress,
        })) as unknown as Text2TextPipeline;
        loaded = { modelId, backend: 'wasm', pipe };
        post({
          id,
          kind: 'loaded',
          modelId,
          backend: 'wasm' as never,
          warmupMs: Date.now() - t0,
        });
        return;
      } catch (err2) {
        post({
          id,
          kind: 'error',
          code: 'backend-failed',
          message: (err2 as Error).message || msg,
        });
        return;
      }
    }
    post({
      id,
      kind: 'error',
      code: classifyError(msg),
      message: msg,
    });
  } finally {
    aborted.delete(id);
    void loadedBytes;
    void totalBytes;
  }
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
  const prompt = buildPrompt(task, input);
  try {
    // The pipeline's call signature is `(text, options) => result`.
    // For text2text-generation, the result is `{ generated_text }[]`.
    const result = await loaded.pipe(prompt, {
      max_new_tokens: 256,
      do_sample: false,
    });
    if (aborted.has(id)) {
      aborted.delete(id);
      post({ id, kind: 'error', code: 'aborted', message: 'Aborted' });
      return;
    }
    const output = result?.[0]?.generated_text ?? '';
    post({ id, kind: 'output', output, inferenceMs: Date.now() - t0 });
  } catch (err) {
    const msg = (err as Error).message || 'run-failed';
    post({ id, kind: 'error', code: classifyError(msg), message: msg });
  }
}

async function handleUnload(id: string, modelId: string): Promise<void> {
  if (loaded?.modelId === modelId) {
    // Best-effort: transformers.js doesn't expose a `dispose()` on the
    // pipeline directly in every version, so we just drop the ref and
    // let GC reclaim the tensors. The Cache API entry stays.
    loaded = null;
  }
  post({ id, kind: 'unloaded', modelId });
}

/**
 * Map the model+task combo to the prompt prefix that flan-t5-small
 * was instruction-tuned for. Empty input goes back as-is so the
 * caller doesn't run inference on whitespace.
 */
function buildPrompt(task: string, input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  switch (task) {
    case 'gec':
      return `fix grammar: ${trimmed}`;
    case 'rewrite':
      // The controller can pass extras via `opts` once the right-click
      // menu is wired with tone presets (formal / casual / concise).
      // For P2 we default to "polish the wording" which flan-t5-small
      // interprets as a light rewrite.
      return `Rewrite to improve clarity and tone: ${trimmed}`;
    case 'summarize':
      return `summarize: ${trimmed}`;
    default:
      return trimmed;
  }
}

function classifyError(
  msg: string
): WriterRes extends infer R ? (R extends { kind: 'error'; code: infer C } ? C : never) : never {
  if (/abort/i.test(msg)) return 'aborted' as never;
  if (/oom|memory|allocation/i.test(msg)) return 'oom' as never;
  if (/network|fetch|cors|timeout/i.test(msg)) return 'network' as never;
  if (/webgpu|wasm|backend|device/i.test(msg)) return 'backend-failed' as never;
  return 'unknown' as never;
}
