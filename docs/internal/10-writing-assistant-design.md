# 10 — Writing Assistant Design

Status: **Approved for build, P1 in progress.** Last updated 2026-06-01.

Browser-only, on-device writing aid (grammar / tone / summarize) bolted
onto Casual Editor without compromising existing UX. All inference runs
in a Web Worker against transformers.js. Models load on user opt-in and
are cached in the browser. No backend, no API keys, no telemetry.

---

## 1 — Goals & non-goals

### Goals
- **Opt-in, per-feature.** User picks a feature; only then does anything download.
- **Device-aware.** Detect WebGPU / WASM-SIMD / RAM / storage at boot; surface unsupported features as disabled with a reason.
- **Wise model use.** Single core model (`flan-t5-small`) covers grammar + tone + basic summarize. Optional advanced upgrades co-load only when the user asks for them.
- **Worker-isolated.** Inference + load happen off the main thread. Cancellation via AbortController.
- **Zero impact on existing features** until the user enables the assistant. After enable, no impact on editor responsiveness — model lives in a worker, integration touches only `DecorationLayer` (squiggles) and `TextContextMenu` (selection actions).
- **Privacy-first.** One-time consent. No text ever leaves the device.

### Non-goals
- **Cloud fallback.** Never.
- **Multi-language v1.** English only. (Models exist for other langs, defer.)
- **Document-wide rewrites.** v1 operates per selection / per paragraph. "Rewrite my whole doc" is a v2 idea.
- **Persona / style transfer beyond preset tones.** Just `formal / casual / concise / shorter / longer`.

---

## 2 — Architecture

Three layers; UI never imports anything from the worker layer directly.

```
┌────────────────────────────────────────────────────────────────┐
│  UI (React, main thread)                                       │
│   - WritingAssistantSheet (settings + status)                  │
│   - WriterStatusPill (toolbar chip)                            │
│   - Grammar decoration painter (extends DecorationLayer)       │
│   - Tone / summarize menu entries (extends TextContextMenu)    │
└──────────────┬─────────────────────────────────────────────────┘
               │ via the controller's public hook
┌──────────────▼─────────────────────────────────────────────────┐
│  Service layer (module-level singleton in main thread)         │
│   - capabilities.ts   one-shot DeviceCapabilities snapshot     │
│   - registry.ts       FeatureSpec[] + ModelSpec[]              │
│   - controller.ts     State machine + worker bridge            │
│   - storage.ts        localStorage prefs + cache usage probe   │
│   - messages.ts       Typed wire protocol                      │
└──────────────┬─────────────────────────────────────────────────┘
               │ Worker postMessage
┌──────────────▼─────────────────────────────────────────────────┐
│  Worker layer (writer.worker.ts)                               │
│   - @huggingface/transformers (Xenova lineage)                 │
│   - Backend pick: webgpu > wasm-simd > wasm                    │
│   - load / run / abort / unload                                │
│   - Streams { progress, output, error } events                 │
└────────────────────────────────────────────────────────────────┘
```

---

## 3 — Capability detection

Performed once at editor mount; cached as a module-level `DeviceCapabilities` snapshot. UI re-reads on next render — no live recomputation.

```ts
interface DeviceCapabilities {
  webgpu: boolean;
  wasmSimd: boolean;
  sharedArrayBuffer: boolean;            // for WASM threads (needs COOP/COEP)
  deviceMemoryGb: number | null;         // navigator.deviceMemory hint
  storageQuotaMb: number | null;         // navigator.storage.estimate().quota
  storageUsedMb: number | null;
  effectiveNet: '4g' | '3g' | 'slow' | 'unknown';
  recommendedBackend: 'webgpu' | 'wasm-simd' | 'wasm';
  unsupportedReasons: string[];          // ['no-webassembly'] when off
}
```

Decision per feature:

```ts
function isFeatureSupported(feature: FeatureSpec, caps: DeviceCapabilities): {
  supported: boolean;
  reason?: string;
} {
  if (caps.deviceMemoryGb !== null && caps.deviceMemoryGb < feature.minMemoryGb) {
    return { supported: false, reason: `Needs ~${feature.minMemoryGb} GB RAM; device reports ${caps.deviceMemoryGb}` };
  }
  if (caps.storageQuotaMb !== null && caps.storageUsedMb !== null) {
    const free = caps.storageQuotaMb - caps.storageUsedMb;
    if (free < feature.sizeMb * 1.2) {
      return { supported: false, reason: `Needs ~${feature.sizeMb} MB free; ${Math.round(free)} MB available` };
    }
  }
  const backend = caps.recommendedBackend;
  const accepted = [feature.preferredBackend, ...feature.fallbackBackends];
  if (!accepted.includes(backend)) {
    return { supported: false, reason: `Requires ${feature.preferredBackend}; this browser only has ${backend}` };
  }
  return { supported: true };
}
```

Unsupported features render as disabled with the `reason` in a tooltip.

---

## 4 — Feature & model registry

### Models

| Model ID | Quant size | Backends | Used for |
| --- | --- | --- | --- |
| `Xenova/flan-t5-small` | ~95 MB | webgpu, wasm-simd, wasm | grammar, tone, summarize-basic |
| `Xenova/distilbart-cnn-6-6` | ~155 MB | webgpu, wasm-simd | summarize-pro (advanced) |
| `Xenova/all-MiniLM-L6-v2` | ~23 MB | webgpu, wasm-simd, wasm | doc-wide tone signal (advanced) |

All Apache-2.0 / MIT, all in transformers.js's onnx repo, all runnable in WASM-only as a floor.

### Features

| Feature ID | Label | Model | Min RAM | Default |
| --- | --- | --- | --- | --- |
| `grammar` | Grammar polish | flan-t5-small | 1.5 GB | off |
| `tone` | Tone & style rewrite | flan-t5-small | 1.5 GB | off |
| `summarize-basic` | Summarize selection | flan-t5-small | 1.5 GB | off (free when grammar/tone is on) |
| `summarize-pro` | High-quality summarize | flan-t5-small + distilbart | 2 GB | off (advanced) |
| `doc-context` | Doc-wide tone signal | flan-t5-small + MiniLM | 1.6 GB | off (advanced) |

`grammar`, `tone`, `summarize-basic` share `flan-t5-small` — picking any one
of them loads it; turning all three on adds nothing to memory.

`summarize-pro` and `doc-context` are advanced upgrades that co-load with the
core. Both off → 95 MB. Both on → 273 MB. Still under our 300 MB ceiling.

---

## 5 — Concurrency rules

```
Always exactly one task model resident.
   = flan-t5-small.
   = loaded when any of grammar / tone / summarize-* is enabled.
   = stays loaded until the last consumer is disabled.

Optional co-residents:
   - distilbart-cnn-6-6 (summarize-pro toggle on)
   - MiniLM-L6-v2 (doc-context toggle on)

When a co-resident is toggled off, it is evicted from RAM (worker
disposes the pipeline). Cached weights stay in the Cache API; the
next re-enable is a cache hit, no network.
```

This is the wise-use rule: small things (MiniLM) co-reside cheaply,
the big one (distilbart) only resides when the user explicitly wants
better summarization.

---

## 6 — Worker protocol

```ts
// main → worker
type WriterReq =
  | { id: string; kind: 'load'; modelId: string; backend: 'webgpu' | 'wasm-simd' | 'wasm' }
  | { id: string; kind: 'run'; modelId: string; task: 'gec' | 'rewrite' | 'summarize'; input: string; opts?: Record<string, unknown> }
  | { id: string; kind: 'abort'; targetId: string }
  | { id: string; kind: 'unload'; modelId: string };

// worker → main
type WriterRes =
  | { id: string; kind: 'progress'; loaded: number; total: number }
  | { id: string; kind: 'loaded'; modelId: string; backend: string; warmupMs: number }
  | { id: string; kind: 'output'; output: string; inferenceMs: number }
  | { id: string; kind: 'error'; code: ErrorCode; message: string }
  | { id: string; kind: 'unloaded'; modelId: string };

type ErrorCode = 'oom' | 'network' | 'backend-failed' | 'unsupported' | 'aborted' | 'unknown';
```

`id` is a UUID per request, used to route responses back to the awaiting
promise (request/response correlation pattern). `abort` carries the
targetId of the running request to cancel.

---

## 7 — Controller state machine

```
                  ┌─────────────────────────────┐
                  ▼                             │
┌───────────┐  pick feature   ┌─────────────────┐
│ idle      │ ──────────────► │ checking-caps   │
└───────────┘                 └────────┬────────┘
                                       │ supported
                                       ▼
                              ┌────────────────┐
                              │ confirming     │   (skip if cached + consented)
                              │  (consent +    │
                              │   switch-warn) │
                              └────────┬───────┘
                                       │ approved
                                       ▼
                              ┌────────────────┐
                              │ downloading    │ ── progress events
                              └────────┬───────┘
                                       │ complete
                                       ▼
                              ┌────────────────┐
                              │ loading        │   (warm-up inference)
                              └────────┬───────┘
                                       │
                                       ▼
                          ┌──────────────────┐
                          │      ready       │ ◄──┐
                          └────┬─────────────┘    │
                               │ run req          │ output / error
                               ▼                  │
                          ┌──────────────────┐    │
                          │      busy        │ ───┘
                          └──────────────────┘
                                       │
                                       │ pick different feature with a different model
                                       ▼
                              ┌────────────────┐
                              │ evicting       │
                              └────────┬───────┘
                                       │ unloaded
                                       ▼
                              (back to checking-caps)
```

`error` is a terminal sibling of every state above `ready`; it carries
the typed `ErrorCode` so the UI can render the right recovery action.

---

## 8 — Storage strategy

Two stores:

- **Model weights** — handled by transformers.js via the browser's
  Cache API (`huggingface-transformers-cache` namespace). We never
  read/write it directly; we surface usage via
  `navigator.storage.estimate()` and offer a "Clear cached models"
  button that calls `caches.delete()` on the relevant namespace.
- **User preferences** — `localStorage` keys:
  - `writer:enabled-features` — `string[]` (subset of feature IDs)
  - `writer:consent-version` — bumps if consent copy changes
  - `writer:auto-load` — boolean; default true after first consent
  - `writer:advanced-open` — UI state (sheet section expanded)

Eviction policy:
- A model gets `pipeline.dispose()`'d when its last consumer feature is
  disabled.
- Cached weights are NOT deleted on eviction — only on explicit user
  action via "Clear cached models".

---

## 9 — UX flow

### Entry points
1. **Tools menu → "Writing Assistant…"** — opens the sheet.
2. **Status pill in the title bar** (rendered when a feature is on) —
   click → opens the sheet.
3. **First-run nudge** — small banner below the toolbar after the user
   completes 10 minutes of editing, offering to try the assistant.
   Dismissible. Stored in localStorage so it's only ever shown once.

### Writing Assistant sheet

Slide-in from the right (matches the panel rail dock), stays open
while the user types. Width: 360 px.

```
┌─ Writing Assistant ─────────────────── ✕ ─┐
│  Runs in your browser. No text leaves     │
│  your device.                              │
│                                            │
│  ── Features ──────────────────────────── │
│  [ ] Grammar polish      95 MB             │
│  [ ] Tone & style rewrite  (same model)    │
│  [ ] Summarize selection   (same model)    │
│                                            │
│  ── Advanced (off by default) ────────── ▾ │
│  [ ] High-quality summarize  +155 MB       │
│  [ ] Doc-wide tone signal     +23 MB       │
│                                            │
│  ── Your device ─────────────────────────  │
│  ✓ WebGPU accelerator detected             │
│  ✓ 3.2 GB free in browser storage          │
│  ⚡ ~12 s est. download on this network    │
│                                            │
│  ── Status ──────────────────────────────  │
│  ● Loaded: flan-t5-small (95 MB)           │
│  Last call: 12 ms                          │
│                                            │
│  [ Clear cached models ]                   │
└────────────────────────────────────────────┘
```

When the user enables their **first** feature ever, a one-time consent
modal appears in front of the sheet:

```
┌─ Download writing assistant ─────┐
│                                  │
│  This downloads a ~95 MB model   │
│  to your browser cache so the    │
│  assistant can run on your       │
│  device. Your document is never  │
│  sent to a server.               │
│                                  │
│  The model is open-source        │
│  (Apache-2.0).                   │
│                                  │
│  [ Cancel ]   [ Download ]       │
└──────────────────────────────────┘
```

### In-editor surfacing once active

| Feature | Surface |
| --- | --- |
| **Grammar** | Red-wavy underline (reuses `DecorationLayer`, different CSS class `grammar-error`). Right-click on the underline → suggestion popover. |
| **Tone** | Selection right-click adds an "AI" group: "Rewrite as: formal / casual / concise / shorter / longer". Replace in-place, preserve marks via `translateFragment`-style walk. |
| **Summarize** | Selection right-click adds "Summarize this". Opens a small popover with the summary + "Insert at cursor" / "Copy" buttons. |

### Status pill

Tiny chip in the title bar between the document name and the right-side
save indicator:

- `✨ Loading…` (during download / warm-up)
- `✨ Ready · 12ms` (after first inference, hover shows model)
- `✨ Busy` (during an in-flight inference)
- `⚠ Paused` (memory-pressure unload — click to resume)

Click the pill → opens the sheet.

---

## 10 — Failure modes

| Code | Trigger | UI |
| --- | --- | --- |
| `oom` | Inference / load OOMs | Toast + auto-unload. Sheet status: "Paused — your device ran out of memory." + Retry button. |
| `network` | Download interrupted | "Download paused — check your connection." + Resume button. |
| `backend-failed` | WebGPU init fails mid-load | Auto-retry on WASM-SIMD. Toast: "Using slower fallback (WASM)." |
| `unsupported` | Capability check missed something at runtime | Status: "This feature isn't available on your device." + reason link. |
| `aborted` | User cancel | Silent return to previous state. |
| `unknown` | Anything else | Generic "Something went wrong" + Retry. |

---

## 11 — Multi-tab coordination (v2 stretch)

Single-tab in v1. If a second tab tries to load while another tab has
the model resident, the second tab shows:

> "Writing Assistant is active in another tab. Close that tab or
> reload to use it here."

Detection: `BroadcastChannel('writer-coordinator')`. v1 ships only the
detection; v2 wires through the leader tab via `MessageChannel`.

---

## 12 — Integration touchpoints with the editor

| Editor surface | Hook |
| --- | --- |
| `Tools` menu | New entry "Writing Assistant…" between "Spell check" and "Translate". |
| `DecorationLayer` (visible-pages overlay) | Reused by grammar with class `grammar-error`. No new infra. |
| `TextContextMenu` | New action `aiRewrite` + `aiSummarize` (mirrors existing `translateSelection` pattern). |
| `PagedEditor.handlePagesContextMenu` | Same `elementsFromPoint` plumbing as spell-check, scans for `grammar-error` overlay → opens AI suggestions menu. |
| `TitleBar` | New `WriterStatusPill` component, rendered between document name and `SaveStatusIndicator`. |
| `examples/vite/src/main.tsx` | Calls `setWriterWorkerUrl(workerUrl)` so the demo can build the worker as a Vite asset. Library doesn't embed the worker path. |

---

## 13 — Persistence + auto-load

On editor mount, `controller.boot()`:

1. Read `localStorage.getItem('writer:enabled-features')`.
2. If any feature is enabled and `writer:auto-load` is true, schedule a
   background load (via `requestIdleCallback`). Status pill shows
   "Loading…" until ready.
3. If consent was never given, do not auto-load even if features look
   enabled (defense in depth).

---

## 14 — Build phases

**P1 (this commit / branch)**

- `lib/writer/capabilities.ts` (one-shot detection)
- `lib/writer/registry.ts` (feature + model specs)
- `lib/writer/messages.ts` (typed protocol)
- `lib/writer/controller.ts` (state machine + worker bridge)
- `lib/writer/storage.ts` (localStorage + cache estimate)
- `lib/writer/worker.ts` (stub worker — returns fake outputs)
- `components/dialogs/WritingAssistantSheet.tsx` (full UI)
- `components/WriterStatusPill.tsx` (toolbar pill)
- Tools-menu wiring + `Tools → Writing Assistant…`
- Playwright spec: sheet opens, capabilities render, enable flow runs against the stub worker

**P2**

- Replace stub worker with `@huggingface/transformers` and wire
  `flan-t5-small` for grammar + tone + basic summarize.
- Wire grammar decorations in `DecorationLayer` (extension follows the
  spell-check pattern).
- Add right-click `aiRewrite` + `aiSummarize` to `TextContextMenu`.

**P3**

- HQ summarize (distilbart) under Advanced.
- Doc-context (MiniLM) under Advanced.

**P4 (polish)**

- Multi-tab BroadcastChannel coordination.
- Telemetry of inference latency (last-call display, p50 / p95).
- "Active in another tab" handling.

Each phase ships behind a single commit + green CI.

---

## 15 — Decisions locked in (no further confirmation)

- **P1 model = flan-t5-small** (single).
- **Advanced upgrades visible-but-disabled in P1**, labelled "Coming in next release".
- **Auto-load on next boot** = on (defaults to true after consent).
- **Tools-menu placement** = between Spell check and Translate.
- **Sheet docks right**, 360 px wide, stays open while editing.
- **Consent copy version** = `1` (bump on material changes).
- **English-only v1.** Multi-language post-launch.

---

End of design.
