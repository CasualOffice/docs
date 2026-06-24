/**
 * Persistence + cache-usage helpers for the Writing Assistant. See
 * `docs/internal/10-writing-assistant-design.md` § 8.
 *
 * localStorage holds the user's enable list + consent state; the
 * model-weight cache is owned by transformers.js (Cache API), which we
 * never touch directly — we just surface usage via
 * `navigator.storage.estimate()` and offer an explicit "clear" hook.
 */

import type { FeatureId } from './registry';

const KEY_ENABLED = 'writer:enabled-features';
const KEY_CONSENT = 'writer:consent-version';
const KEY_AUTOLOAD = 'writer:auto-load';
const KEY_ADVANCED_OPEN = 'writer:advanced-open';

export const CURRENT_CONSENT_VERSION = 1;

export function loadEnabledFeatures(): FeatureId[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY_ENABLED);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is FeatureId => typeof v === 'string') as FeatureId[];
  } catch {
    return [];
  }
}

export function saveEnabledFeatures(ids: FeatureId[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY_ENABLED, JSON.stringify(ids));
  } catch {
    // Storage denied — toggle still takes effect for the session.
  }
}

export function loadConsentVersion(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.localStorage.getItem(KEY_CONSENT);
    if (!raw) return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function saveConsentVersion(v: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY_CONSENT, String(v));
  } catch {
    // ignored
  }
}

export function hasCurrentConsent(): boolean {
  return loadConsentVersion() >= CURRENT_CONSENT_VERSION;
}

export function loadAutoLoad(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(KEY_AUTOLOAD);
    if (raw === null) return true;
    return raw === '1';
  } catch {
    return true;
  }
}

export function saveAutoLoad(v: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY_AUTOLOAD, v ? '1' : '0');
  } catch {
    // ignored
  }
}

export function loadAdvancedOpen(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(KEY_ADVANCED_OPEN) === '1';
  } catch {
    return false;
  }
}

export function saveAdvancedOpen(v: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY_ADVANCED_OPEN, v ? '1' : '0');
  } catch {
    // ignored
  }
}

/**
 * Drop everything the assistant put in storage. The model-weight cache
 * is wiped separately because it lives in the Cache API under
 * transformers.js's namespace, not in localStorage.
 */
export async function clearCachedModels(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const names = await caches.keys();
    await Promise.all(
      names.filter((n) => /transformers|huggingface/i.test(n)).map((n) => caches.delete(n))
    );
  } catch {
    // Some browsers gate Cache API on a secure context.
  }
}

/**
 * For tests: clear localStorage keys so the next boot re-runs the
 * first-time flow.
 */
export function resetWriterPrefsForTests(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY_ENABLED);
    window.localStorage.removeItem(KEY_CONSENT);
    window.localStorage.removeItem(KEY_AUTOLOAD);
    window.localStorage.removeItem(KEY_ADVANCED_OPEN);
  } catch {
    // ignored
  }
}
