/**
 * WriterController — module-level singleton that owns the worker, the
 * state machine, and the public hook UI components subscribe to.
 *
 * See `docs/internal/10-writing-assistant-design.md` § 7.
 *
 * UI never touches the worker directly. Components call
 * `useWriterState()` to read the current snapshot and reflect
 * downloads / errors / ready state; they call action helpers
 * (`enableFeature`, `disableFeature`, `runTask`, ...) for behaviour.
 */

import { useSyncExternalStore } from 'react';
import { getDeviceCapabilities, type DeviceCapabilities } from './capabilities';
import { FEATURES, MODELS, type FeatureId, type FeatureSpec, isFeatureSupported } from './registry';
import {
  newRequestId,
  type JsonResponseFormat,
  type WriterErrorCode,
  type WriterReq,
  type WriterRes,
  type WriterTask,
} from './messages';
import {
  hasCurrentConsent,
  loadAdvancedOpen,
  loadAutoLoad,
  loadEnabledFeatures,
  saveAdvancedOpen,
  saveAutoLoad,
  saveConsentVersion,
  saveEnabledFeatures,
  CURRENT_CONSENT_VERSION,
} from './storage';

export type WriterPhase =
  | 'idle'
  | 'checking-caps'
  | 'confirming'
  | 'downloading'
  | 'loading'
  | 'ready'
  | 'busy'
  | 'evicting'
  | 'error';

export interface WriterState {
  phase: WriterPhase;
  enabledFeatures: FeatureId[];
  /** Model currently resident in the worker, if any. */
  loadedModelId: string | null;
  /** Live download progress (0..1) when phase === 'downloading'. */
  progress: number;
  /** Last successful inference latency in ms (for the status pill). */
  lastInferenceMs: number | null;
  errorCode: WriterErrorCode | null;
  errorMessage: string | null;
  capabilities: DeviceCapabilities | null;
  /** UI bit: is the Advanced disclosure expanded. */
  advancedOpen: boolean;
  /** Auto-load on next boot. */
  autoLoad: boolean;
  /** True after the user has signed off on the consent copy. */
  consented: boolean;
}

let workerUrl: string | null = null;

/**
 * Host must call this exactly once before any feature is enabled —
 * the consumer's bundler is what produces the worker asset URL. The
 * library can't bake the path in because tsup doesn't know how to
 * resolve `new URL('./writer.worker.ts', import.meta.url)`.
 */
export function setWriterWorkerUrl(url: string): void {
  workerUrl = url;
}

/** Visible to the consumer's `setWriterWorkerUrl` adapters / tests. */
export function getWriterWorkerUrl(): string | null {
  return workerUrl;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let state: WriterState = {
  phase: 'idle',
  enabledFeatures: [],
  loadedModelId: null,
  progress: 0,
  lastInferenceMs: null,
  errorCode: null,
  errorMessage: null,
  capabilities: null,
  advancedOpen: false,
  autoLoad: true,
  consented: false,
};

const listeners = new Set<() => void>();

function setState(patch: Partial<WriterState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

function getStateSnapshot(): WriterState {
  return state;
}

// ---------------------------------------------------------------------------
// Worker bridge
// ---------------------------------------------------------------------------

let worker: Worker | null = null;
const pending = new Map<
  string,
  {
    resolve: (out: string) => void;
    reject: (err: Error) => void;
    onProgress?: (loaded: number, total: number) => void;
    onDelta?: (text: string) => void;
    accumulated?: string;
  }
>();

function ensureWorker(): Worker {
  if (worker) return worker;
  if (!workerUrl) {
    throw new Error(
      'Writing Assistant worker URL is not configured — call `setWriterWorkerUrl(url)` at editor mount.'
    );
  }
  worker = new Worker(workerUrl, { type: 'module', name: 'writer-worker' });
  worker.onmessage = (e: MessageEvent<WriterRes>) => handleWorkerMessage(e.data);
  worker.onerror = () => {
    setState({
      phase: 'error',
      errorCode: 'unknown',
      errorMessage: 'The Writing Assistant worker stopped unexpectedly.',
    });
    // Recycle so the next call can spin up a fresh worker.
    worker?.terminate();
    worker = null;
  };
  return worker;
}

function handleWorkerMessage(msg: WriterRes): void {
  switch (msg.kind) {
    case 'progress': {
      const p = pending.get(msg.id);
      p?.onProgress?.(msg.loaded, msg.total);
      if (state.phase === 'downloading' && msg.total > 0) {
        setState({ progress: msg.loaded / msg.total });
      }
      return;
    }
    case 'loaded': {
      setState({
        phase: 'ready',
        loadedModelId: msg.modelId,
        progress: 1,
        errorCode: null,
        errorMessage: null,
      });
      const p = pending.get(msg.id);
      if (p) {
        pending.delete(msg.id);
        p.resolve('loaded');
      }
      return;
    }
    case 'output': {
      setState({ phase: 'ready', lastInferenceMs: msg.inferenceMs });
      const p = pending.get(msg.id);
      if (p) {
        pending.delete(msg.id);
        p.resolve(msg.output);
      }
      return;
    }
    case 'chat-delta': {
      const p = pending.get(msg.id);
      if (!p) return;
      p.accumulated = (p.accumulated ?? '') + msg.text;
      p.onDelta?.(msg.text);
      return;
    }
    case 'chat-done': {
      setState({ phase: 'ready', lastInferenceMs: msg.inferenceMs });
      const p = pending.get(msg.id);
      if (p) {
        pending.delete(msg.id);
        p.resolve(p.accumulated ?? '');
      }
      return;
    }
    case 'error': {
      // Distinguish per-request errors from controller-wide failures.
      const p = pending.get(msg.id);
      if (p) {
        pending.delete(msg.id);
        p.reject(new Error(msg.message));
      }
      if (msg.code !== 'aborted') {
        setState({
          phase: 'error',
          errorCode: msg.code,
          errorMessage: msg.message,
        });
      }
      return;
    }
    case 'unloaded': {
      setState({
        loadedModelId: null,
        phase: state.enabledFeatures.length === 0 ? 'idle' : state.phase,
      });
      const p = pending.get(msg.id);
      if (p) {
        pending.delete(msg.id);
        p.resolve('unloaded');
      }
      return;
    }
  }
}

function postWorker(req: WriterReq): void {
  ensureWorker().postMessage(req);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

let booted = false;

/**
 * Run once at editor mount. Detects capabilities, restores persisted
 * features + consent, and schedules an auto-load if the user had a
 * feature on last session.
 */
export async function bootWriterController(): Promise<void> {
  if (booted) return;
  booted = true;
  const enabled = loadEnabledFeatures();
  const autoLoad = loadAutoLoad();
  const consented = hasCurrentConsent();
  const advancedOpen = loadAdvancedOpen();
  setState({
    enabledFeatures: enabled,
    autoLoad,
    consented,
    advancedOpen,
    phase: 'checking-caps',
  });
  try {
    const caps = await getDeviceCapabilities();
    setState({ capabilities: caps, phase: 'idle' });
  } catch {
    setState({ phase: 'idle' });
  }
  if (autoLoad && consented && enabled.length > 0) {
    // Background-load — don't block boot.
    void loadModelsFor(enabled).catch(() => {
      // Errors surface through the state machine.
    });
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export interface EnableOpts {
  /** When true, ignore the current consent state — used by the UI to
   *  drive the consent modal flow. */
  skipConsentCheck?: boolean;
}

/**
 * Enable a feature. Throws if consent is missing and `skipConsentCheck`
 * isn't set — the UI is responsible for surfacing the consent modal,
 * recording the user's acceptance via `recordConsent()`, and re-calling.
 */
export async function enableFeature(id: FeatureId, opts: EnableOpts = {}): Promise<void> {
  const feature = FEATURES.find((f) => f.id === id);
  if (!feature) throw new Error(`Unknown feature: ${id}`);
  const caps = state.capabilities;
  if (caps) {
    const support = isFeatureSupported(feature, caps);
    if (!support.supported) {
      throw new Error(support.reason ?? 'Feature unsupported on this device');
    }
  }
  if (!state.consented && !opts.skipConsentCheck) {
    setState({ phase: 'confirming' });
    return;
  }
  // Recover from the error phase — a previous worker crash leaves the
  // controller stuck; user-initiated retry clears it before we try to
  // re-spawn the worker.
  if (state.phase === 'error') {
    setState({ phase: 'idle', errorCode: null, errorMessage: null });
  }
  const next = unique([...state.enabledFeatures, id]);
  setState({ enabledFeatures: next });
  saveEnabledFeatures(next);
  await loadModelsFor(next);
}

export async function disableFeature(id: FeatureId): Promise<void> {
  const next = state.enabledFeatures.filter((f) => f !== id);
  setState({ enabledFeatures: next });
  saveEnabledFeatures(next);
  await syncResidentModels(next);
}

export function recordConsent(): void {
  saveConsentVersion(CURRENT_CONSENT_VERSION);
  setState({ consented: true, phase: 'idle' });
}

export function dismissConsent(): void {
  // Revert any pending feature toggle — phase goes back to idle but
  // the enabledFeatures set was never written; nothing to undo.
  setState({ phase: 'idle' });
}

export function setAutoLoad(v: boolean): void {
  saveAutoLoad(v);
  setState({ autoLoad: v });
}

export function setAdvancedOpen(v: boolean): void {
  saveAdvancedOpen(v);
  setState({ advancedOpen: v });
}

/**
 * Run a task on the currently-loaded model. Resolves to the model's
 * output string. Rejects with `Error` on worker error / abort.
 */
export async function runTask(
  task: WriterTask,
  input: string,
  signal?: AbortSignal
): Promise<string> {
  const modelId = state.loadedModelId;
  if (!modelId) throw new Error('No model is loaded — enable a feature first.');
  setState({ phase: 'busy' });
  const id = newRequestId();
  try {
    return await new Promise<string>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      if (signal) {
        signal.addEventListener(
          'abort',
          () => {
            postWorker({ id: newRequestId(), kind: 'abort', targetId: id });
            const p = pending.get(id);
            if (p) {
              pending.delete(id);
              p.reject(new DOMException('Aborted', 'AbortError'));
            }
          },
          { once: true }
        );
      }
      postWorker({ id, kind: 'run', modelId, task, input });
    });
  } finally {
    if (state.phase === 'busy') setState({ phase: 'ready' });
  }
}

/**
 * Stream a chat completion against the resident LLM. Resolves with
 * the full reply once the stream ends; calls `opts.onDelta` for each
 * incoming chunk so the UI can paint as the model generates.
 *
 * Chat only flows through the WebLLM tier (Llama-3.2-1B) — the
 * flan-t5-small tier isn't a conversational model. The worker
 * rejects with a clean error if the user only has the basic tier
 * loaded.
 */
export async function runChat(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  opts: {
    onDelta?: (text: string) => void;
    signal?: AbortSignal;
    maxTokens?: number;
    temperature?: number;
    /** When set, WebLLM constrains output to this format (JSON-mode). */
    responseFormat?: JsonResponseFormat;
  } = {}
): Promise<string> {
  const modelId = state.loadedModelId;
  if (!modelId) throw new Error('No model is loaded — enable the Advanced LLM tier first.');
  setState({ phase: 'busy' });
  const id = newRequestId();
  try {
    return await new Promise<string>((resolve, reject) => {
      pending.set(id, {
        resolve,
        reject,
        onDelta: opts.onDelta,
        accumulated: '',
      });
      if (opts.signal) {
        opts.signal.addEventListener(
          'abort',
          () => {
            postWorker({ id: newRequestId(), kind: 'abort', targetId: id });
            const p = pending.get(id);
            if (p) {
              pending.delete(id);
              p.reject(new DOMException('Aborted', 'AbortError'));
            }
          },
          { once: true }
        );
      }
      postWorker({
        id,
        kind: 'chat',
        modelId,
        messages,
        maxTokens: opts.maxTokens,
        temperature: opts.temperature,
        responseFormat: opts.responseFormat,
      });
    });
  } finally {
    if (state.phase === 'busy') setState({ phase: 'ready' });
  }
}

/**
 * Test/debug — terminate the worker and reset all in-memory state.
 */
export function resetWriterControllerForTests(): void {
  worker?.terminate();
  worker = null;
  pending.clear();
  booted = false;
  state = {
    phase: 'idle',
    enabledFeatures: [],
    loadedModelId: null,
    progress: 0,
    lastInferenceMs: null,
    errorCode: null,
    errorMessage: null,
    capabilities: null,
    advancedOpen: false,
    autoLoad: true,
    consented: false,
  };
  for (const l of listeners) l();
}

// ---------------------------------------------------------------------------
// Model lifecycle
// ---------------------------------------------------------------------------

/**
 * Decide which models should be resident given the current feature
 * set. If the advanced LLM is enabled, it WINS — the smaller flan-t5
 * model gets evicted and the LLM handles rewrite / tone /
 * summarize. Otherwise we resolve the union of every enabled
 * feature's `modelIds` (currently just flan-t5-small).
 */
function residentModelsFor(features: FeatureId[]): string[] {
  if (features.includes('advanced-llm')) {
    const advanced = FEATURES.find((f) => f.id === 'advanced-llm');
    return advanced ? [...advanced.modelIds] : [];
  }
  const ids = new Set<string>();
  for (const fid of features) {
    const f = FEATURES.find((x) => x.id === fid);
    if (!f) continue;
    for (const m of f.modelIds) ids.add(m);
  }
  return Array.from(ids);
}

async function loadModelsFor(features: FeatureId[]): Promise<void> {
  const want = residentModelsFor(features);
  // For P1 we only need to load the first required model (flan-t5-small).
  // P3 wires multi-model co-residence.
  if (want.length === 0) return;
  const targetKey = want[0];
  if (!targetKey) return;
  const target = MODELS[targetKey];
  if (!target) return;
  const caps = state.capabilities;
  const backend = caps?.recommendedBackend ?? 'wasm';

  if (state.loadedModelId === target.id) {
    // Already loaded — nothing to do.
    setState({ phase: 'ready' });
    return;
  }

  setState({ phase: 'downloading', progress: 0, errorCode: null, errorMessage: null });
  const id = newRequestId();
  await new Promise<void>((resolve, reject) => {
    pending.set(id, {
      resolve: () => resolve(),
      reject: (err) => reject(err),
      onProgress: (loaded, total) => {
        if (total > 0) setState({ progress: loaded / total });
      },
    });
    postWorker({ id, kind: 'load', modelId: target.id, backend });
  });
}

async function syncResidentModels(features: FeatureId[]): Promise<void> {
  const want = residentModelsFor(features);
  if (want.length === 0 && state.loadedModelId) {
    setState({ phase: 'evicting' });
    const id = newRequestId();
    await new Promise<void>((resolve) => {
      pending.set(id, { resolve: () => resolve(), reject: () => resolve() });
      postWorker({ id, kind: 'unload', modelId: state.loadedModelId! });
    });
    return;
  }
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

/**
 * Subscribe a React component to controller state. Re-renders on every
 * patch. Pair with the action helpers (`enableFeature`, etc.).
 */
export function useWriterState(): WriterState {
  return useSyncExternalStore(subscribe, getStateSnapshot, getStateSnapshot);
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/**
 * Resolve a feature's support given the current snapshot — keeps the
 * UI from re-importing `isFeatureSupported` everywhere.
 */
export function featureSupport(feature: FeatureSpec): { supported: boolean; reason?: string } {
  if (!state.capabilities) return { supported: false, reason: 'Detecting your device…' };
  return isFeatureSupported(feature, state.capabilities);
}

/**
 * True when an LLM-capable model is resident in the worker. Used by
 * surfaces outside the writer pipeline (translate dialog, quick-
 * replace) to decide whether to route work through the on-device LLM
 * (no rate limit) or fall back to the network API.
 */
export function isLlmReady(): boolean {
  if (state.phase !== 'ready' || !state.loadedModelId) return false;
  // LLM model ids end in `-MLC` or start with the Llama / Qwen / SmolLM /
  // Phi family prefixes (matches `isLlmModel` in the worker).
  return /-MLC$/i.test(state.loadedModelId) || /^(Llama|Qwen|SmolLM|Phi)/i.test(state.loadedModelId);
}
