/// <reference lib="webworker" />
/**
 * Writer worker — dual-engine.
 *
 * Routes the controller's load / run / abort / unload calls to the
 * right inference engine based on the requested model:
 *
 * - `@huggingface/transformers` (Xenova lineage) for the small WASM-
 *   capable tier (flan-t5-small) so users without WebGPU still get
 *   grammar / tone / summarize.
 * - `@mlc-ai/web-llm` for the advanced Llama-3.2-1B-Instruct tier.
 *   WebGPU-only, ~880 MB, but the output quality is what most users
 *   actually expect from "AI rewrite".
 *
 * Only one model is resident at a time — the controller serialises
 * load/unload around feature toggles, and the worker discards the
 * previous engine before initialising the next.
 */

import { pipeline, env } from '@huggingface/transformers';
import type { CreateMLCEngine as CreateMLCEngineType } from '@mlc-ai/web-llm';
import type { JsonResponseFormat, WriterReq, WriterRes } from './messages';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

env.useBrowserCache = true;
env.allowLocalModels = false;

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

type LlmEngine = Awaited<ReturnType<typeof CreateMLCEngineType>>;

interface LoadedModel {
  modelId: string;
  backend: string;
  engine: 'transformers-js' | 'web-llm';
  pipe?: Text2TextPipeline;
  llm?: LlmEngine;
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
    case 'chat':
      await handleChat(
        req.id,
        req.modelId,
        req.messages,
        req.maxTokens ?? 512,
        req.temperature ?? 0.6,
        req.responseFormat
      );
      return;
    case 'abort':
      aborted.add(req.targetId);
      return;
    case 'unload':
      await handleUnload(req.id, req.modelId);
      return;
  }
}

function isLlmModel(modelId: string): boolean {
  // Llama-3.2-1B-Instruct-q4f16_1-MLC, Qwen2.5-…, SmolLM2-…, etc.
  return /-MLC$/i.test(modelId) || /^(Llama|Qwen|SmolLM|Phi)/i.test(modelId);
}

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
  // Evict the previous engine before loading the next so we never
  // double-occupy GPU / RAM during a model swap.
  if (loaded) {
    await evict(loaded).catch(() => {});
    loaded = null;
  }
  if (isLlmModel(modelId)) {
    await loadLlm(id, modelId);
  } else {
    await loadTransformers(id, modelId, backend);
  }
}

// ---------------------------------------------------------------------------
// transformers.js (flan-t5-small)
// ---------------------------------------------------------------------------

async function loadTransformers(id: string, modelId: string, backend: string): Promise<void> {
  const t0 = Date.now();
  const fileTotals = new Map<string, number>();
  const onProgress = (p: ProgressInfo): void => {
    if (aborted.has(id)) return;
    if (p.status === 'progress' && typeof p.file === 'string') {
      if (!fileTotals.has(p.file) && typeof p.total === 'number') {
        fileTotals.set(p.file, p.total);
      }
      if (typeof p.loaded === 'number') {
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
    loaded = { modelId, backend, engine: 'transformers-js', pipe };
    post({
      id,
      kind: 'loaded',
      modelId,
      backend: backend as never,
      warmupMs: Date.now() - t0,
    });
  } catch (err) {
    const msg = (err as Error).message || 'load-failed';
    if (backend === 'webgpu' && !aborted.has(id)) {
      try {
        const pipe = (await pipeline('text2text-generation', modelId, {
          device: 'wasm',
          progress_callback: onProgress,
        })) as unknown as Text2TextPipeline;
        loaded = { modelId, backend: 'wasm', engine: 'transformers-js', pipe };
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
    post({ id, kind: 'error', code: classifyError(msg), message: msg });
  } finally {
    aborted.delete(id);
  }
}

// ---------------------------------------------------------------------------
// WebLLM (Llama-3.2-1B)
// ---------------------------------------------------------------------------

async function loadLlm(id: string, modelId: string): Promise<void> {
  const t0 = Date.now();
  try {
    // Dynamic import keeps the WebLLM bundle out of the cold path for
    // users who never enable the advanced tier.
    const { CreateMLCEngine } = await import('@mlc-ai/web-llm');
    const llm = await CreateMLCEngine(modelId, {
      initProgressCallback: (info) => {
        if (aborted.has(id)) return;
        // WebLLM reports `progress` in 0..1; pretend total = 100,
        // loaded = pct so the controller's monotonic bar lines up
        // with the transformers.js progress shape.
        const pct = Math.max(0, Math.min(1, info.progress));
        post({ id, kind: 'progress', loaded: Math.round(pct * 100), total: 100 });
      },
    });
    if (aborted.has(id)) {
      aborted.delete(id);
      post({ id, kind: 'error', code: 'aborted', message: 'Aborted' });
      return;
    }
    loaded = { modelId, backend: 'webgpu', engine: 'web-llm', llm };
    post({
      id,
      kind: 'loaded',
      modelId,
      backend: 'webgpu' as never,
      warmupMs: Date.now() - t0,
    });
  } catch (err) {
    const msg = (err as Error).message || 'load-failed';
    post({ id, kind: 'error', code: classifyError(msg), message: msg });
  } finally {
    aborted.delete(id);
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

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
  try {
    let output = '';
    if (loaded.engine === 'web-llm' && loaded.llm) {
      const { system, user } = chatPrompt(task, input);
      const reply = await loaded.llm.chat.completions.create({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.4,
        max_tokens: 384,
        stream: false,
      });
      output = reply.choices[0]?.message?.content ?? '';
    } else if (loaded.engine === 'transformers-js' && loaded.pipe) {
      const result = await loaded.pipe(buildT5Prompt(task, input), {
        max_new_tokens: 256,
        do_sample: false,
      });
      output = result?.[0]?.generated_text ?? '';
    }
    if (aborted.has(id)) {
      aborted.delete(id);
      post({ id, kind: 'error', code: 'aborted', message: 'Aborted' });
      return;
    }
    post({ id, kind: 'output', output: output.trim(), inferenceMs: Date.now() - t0 });
  } catch (err) {
    const msg = (err as Error).message || 'run-failed';
    post({ id, kind: 'error', code: classifyError(msg), message: msg });
  }
}

// ---------------------------------------------------------------------------
// Chat (streaming)
// ---------------------------------------------------------------------------

async function handleChat(
  id: string,
  modelId: string,
  messages: { role: string; content: string }[],
  maxTokens: number,
  temperature: number,
  responseFormat?: JsonResponseFormat
): Promise<void> {
  if (!loaded || loaded.modelId !== modelId) {
    post({
      id,
      kind: 'error',
      code: 'unsupported',
      message: 'Model not loaded — enable the Advanced LLM tier first.',
    });
    return;
  }
  // Chat only flows through the WebLLM tier. flan-t5-small isn't a
  // conversational model; routing chat to it produces nonsense, so we
  // surface a clean error instead.
  if (loaded.engine !== 'web-llm' || !loaded.llm) {
    post({
      id,
      kind: 'error',
      code: 'unsupported',
      message: 'Chat needs the Advanced LLM tier (Llama-3.2-1B).',
    });
    return;
  }
  const t0 = Date.now();
  try {
    // JSON-mode tool calls don't need streaming — they're consumed by
    // the pipeline as a whole object, not painted token-by-token in a
    // chat bubble. Non-streaming also lets WebLLM apply schema-grammar
    // constraints across the full generation in one go.
    if (responseFormat) {
      const reply = await loaded.llm.chat.completions.create({
        messages: messages as Parameters<typeof loaded.llm.chat.completions.create>[0]['messages'],
        temperature,
        max_tokens: maxTokens,
        stream: false,
        response_format: responseFormat,
      });
      if (aborted.has(id)) {
        aborted.delete(id);
        post({ id, kind: 'error', code: 'aborted', message: 'Aborted' });
        return;
      }
      const content = reply.choices?.[0]?.message?.content ?? '';
      // Emit once as a single delta so the controller's accumulator
      // produces the full object for the caller.
      if (content) post({ id, kind: 'chat-delta', text: content });
      post({ id, kind: 'chat-done', inferenceMs: Date.now() - t0 });
      return;
    }
    const stream = await loaded.llm.chat.completions.create({
      messages: messages as Parameters<typeof loaded.llm.chat.completions.create>[0]['messages'],
      temperature,
      max_tokens: maxTokens,
      stream: true,
    });
    for await (const chunk of stream as AsyncIterable<{
      choices?: { delta?: { content?: string } }[];
    }>) {
      if (aborted.has(id)) {
        aborted.delete(id);
        post({ id, kind: 'error', code: 'aborted', message: 'Aborted' });
        return;
      }
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) post({ id, kind: 'chat-delta', text: delta });
    }
    post({ id, kind: 'chat-done', inferenceMs: Date.now() - t0 });
  } catch (err) {
    const msg = (err as Error).message || 'chat-failed';
    post({ id, kind: 'error', code: classifyError(msg), message: msg });
  }
}

async function handleUnload(id: string, modelId: string): Promise<void> {
  if (loaded?.modelId === modelId) {
    await evict(loaded).catch(() => {});
    loaded = null;
  }
  post({ id, kind: 'unloaded', modelId });
}

async function evict(m: LoadedModel): Promise<void> {
  if (m.engine === 'web-llm' && m.llm) {
    // WebLLM exposes `unload()` to release the GPU buffers.
    if (typeof (m.llm as unknown as { unload?: () => Promise<void> }).unload === 'function') {
      await (m.llm as unknown as { unload: () => Promise<void> }).unload();
    }
  }
  // transformers.js doesn't surface a dispose API; dropping the ref is
  // best-effort and GC reclaims the tensors.
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

function buildT5Prompt(task: string, input: string): string {
  if (!input.trim()) return input;
  switch (task) {
    case 'gec':
      return `fix grammar: ${input}`;
    case 'rewrite':
      return `Rewrite to improve clarity and tone: ${input}`;
    case 'summarize':
      return `summarize: ${input}`;
    default:
      return input;
  }
}

function chatPrompt(task: string, input: string): { system: string; user: string } {
  // Llama-style instruction prompts. Kept short so the model has room
  // for output within the 384-token budget.
  switch (task) {
    case 'gec':
      return {
        system:
          'You are a careful copy editor. Return ONLY the corrected text, no commentary, no quotation marks.',
        user: `Fix grammar, agreement, and punctuation in:\n\n${input}`,
      };
    case 'rewrite':
      return {
        system:
          "You are a professional editor. Return ONLY the rewritten passage. Match the original's language and length unless the user asks otherwise. No commentary, no quotation marks.",
        user: `Rewrite the following passage to improve clarity and flow while keeping the meaning intact:\n\n${input}`,
      };
    case 'summarize':
      return {
        system:
          'You are a precise summariser. Return ONLY the summary as a single short paragraph. No commentary, no quotation marks.',
        user: `Summarise:\n\n${input}`,
      };
    default:
      return { system: 'You are a helpful assistant.', user: input };
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
