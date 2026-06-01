/**
 * Feature + model registry. Declarative — no behaviour, just the
 * shape the UI and controller read from.
 *
 * See `docs/internal/10-writing-assistant-design.md` § 4.
 */

import type { DeviceCapabilities, WriterBackend } from './capabilities';

export type FeatureId = 'grammar' | 'tone' | 'summarize-basic' | 'advanced-llm';

/** Which inference engine a model needs. */
export type ModelEngine = 'transformers-js' | 'web-llm';

export interface ModelSpec {
  id: string;
  /** Display label shown in the sheet. */
  label: string;
  /** Quantized size in MB (Cache-API footprint after first download). */
  sizeMb: number;
  /** Preferred backend ranked highest first; controller falls back. */
  preferredBackend: WriterBackend;
  fallbackBackends: WriterBackend[];
  /** Which inference engine the worker dispatches to for this model. */
  engine: ModelEngine;
}

export interface FeatureSpec {
  id: FeatureId;
  label: string;
  description: string;
  modelIds: string[];
  /** Minimum reported device memory in GB for this to be safe. */
  minMemoryGb: number;
  /** Total cache footprint across all this feature's models. */
  sizeMb: number;
  /** Advanced features hide behind the disclosure. */
  advanced: boolean;
  /** P1 ships the UI for these but locks them off until P3. */
  comingSoon: boolean;
}

export const MODELS: Record<string, ModelSpec> = {
  'flan-t5-small': {
    id: 'Xenova/flan-t5-small',
    label: 'flan-t5-small',
    sizeMb: 95,
    preferredBackend: 'webgpu',
    fallbackBackends: ['wasm-simd', 'wasm'],
    engine: 'transformers-js',
  },
  // Advanced LLM tier — WebLLM + Llama-3.2-1B-Instruct, q4f16
  // quantization. Closest fit to the user's ~700 MB target with
  // genuinely instruction-following output quality. WebGPU-only.
  'llama-3.2-1b': {
    id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    label: 'Llama-3.2-1B-Instruct (q4f16)',
    sizeMb: 880,
    preferredBackend: 'webgpu',
    fallbackBackends: [],
    engine: 'web-llm',
  },
};

export const FEATURES: FeatureSpec[] = [
  {
    id: 'grammar',
    label: 'Grammar polish',
    description: 'Inline suggestions for grammar, agreement, and punctuation.',
    modelIds: ['flan-t5-small'],
    minMemoryGb: 1.5,
    sizeMb: 95,
    advanced: false,
    comingSoon: false,
  },
  {
    id: 'tone',
    label: 'Tone & style rewrite',
    description: 'Rewrite the selection as formal, casual, concise, or other tones.',
    modelIds: ['flan-t5-small'],
    minMemoryGb: 1.5,
    sizeMb: 95,
    advanced: false,
    comingSoon: false,
  },
  {
    id: 'summarize-basic',
    label: 'Summarize selection',
    description: 'Short summaries of a paragraph or selection.',
    modelIds: ['flan-t5-small'],
    minMemoryGb: 1.5,
    sizeMb: 95,
    advanced: false,
    comingSoon: false,
  },
  {
    id: 'advanced-llm',
    label: 'Advanced (Llama-3.2-1B)',
    description:
      'Higher-quality rewrites and summaries from an on-device LLM. Replaces the basic model when active. Needs WebGPU and ~4 GB device memory.',
    modelIds: ['llama-3.2-1b'],
    minMemoryGb: 4,
    sizeMb: 880,
    advanced: true,
    comingSoon: false,
  },
];

export interface FeatureSupport {
  supported: boolean;
  reason?: string;
}

/**
 * Returns `{supported: true}` when the device can run the feature, or
 * `{supported: false, reason}` with a human-readable string surfaced
 * in the UI tooltip.
 */
export function isFeatureSupported(feature: FeatureSpec, caps: DeviceCapabilities): FeatureSupport {
  if (feature.comingSoon) {
    return { supported: false, reason: 'Coming in the next release' };
  }
  if (caps.deviceMemoryGb !== null && caps.deviceMemoryGb < feature.minMemoryGb) {
    return {
      supported: false,
      reason: `Needs ~${feature.minMemoryGb} GB device memory; your browser reports ${caps.deviceMemoryGb} GB.`,
    };
  }
  if (caps.storageQuotaMb !== null && caps.storageUsedMb !== null) {
    const free = caps.storageQuotaMb - caps.storageUsedMb;
    if (free < feature.sizeMb * 1.2) {
      return {
        supported: false,
        reason: `Needs ~${feature.sizeMb} MB of browser storage; ${Math.round(free)} MB available.`,
      };
    }
  }
  // Every feature's primary model must accept the resolved backend.
  for (const modelKey of feature.modelIds) {
    const model = MODELS[modelKey];
    if (!model) continue;
    const accepted = [model.preferredBackend, ...model.fallbackBackends];
    if (!accepted.includes(caps.recommendedBackend)) {
      return {
        supported: false,
        reason: `Requires ${model.preferredBackend}; this browser only has ${caps.recommendedBackend}.`,
      };
    }
  }
  return { supported: true };
}

export function getFeature(id: FeatureId): FeatureSpec | undefined {
  return FEATURES.find((f) => f.id === id);
}
