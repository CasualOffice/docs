/**
 * Feature + model registry. Declarative — no behaviour, just the
 * shape the UI and controller read from.
 *
 * See `docs/internal/10-writing-assistant-design.md` § 4.
 */

import type { DeviceCapabilities, WriterBackend } from './capabilities';

export type FeatureId = 'grammar' | 'tone' | 'summarize-basic' | 'summarize-pro' | 'doc-context';

export interface ModelSpec {
  id: string;
  /** Display label shown in the sheet. */
  label: string;
  /** Quantized size in MB (Cache-API footprint after first download). */
  sizeMb: number;
  /** Preferred backend ranked highest first; controller falls back. */
  preferredBackend: WriterBackend;
  fallbackBackends: WriterBackend[];
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
  },
  'distilbart-cnn-6-6': {
    id: 'Xenova/distilbart-cnn-6-6',
    label: 'distilbart-cnn-6-6',
    sizeMb: 155,
    preferredBackend: 'webgpu',
    fallbackBackends: ['wasm-simd'],
  },
  'minilm-l6-v2': {
    id: 'Xenova/all-MiniLM-L6-v2',
    label: 'all-MiniLM-L6-v2',
    sizeMb: 23,
    preferredBackend: 'webgpu',
    fallbackBackends: ['wasm-simd', 'wasm'],
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
    id: 'summarize-pro',
    label: 'High-quality summarize',
    description: 'Better summaries for long selections (loads an extra ~155 MB model).',
    modelIds: ['flan-t5-small', 'distilbart-cnn-6-6'],
    minMemoryGb: 2,
    sizeMb: 250,
    advanced: true,
    comingSoon: true,
  },
  {
    id: 'doc-context',
    label: 'Doc-wide tone signal',
    description:
      'Keep rewrites consistent with the rest of the document by feeding tone signals from every paragraph.',
    modelIds: ['flan-t5-small', 'minilm-l6-v2'],
    minMemoryGb: 1.6,
    sizeMb: 118,
    advanced: true,
    comingSoon: true,
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
