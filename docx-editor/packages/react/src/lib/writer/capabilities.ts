/**
 * DeviceCapabilities — one-shot snapshot of the runtime environment we
 * rely on for the on-device Writing Assistant. Detected once at editor
 * mount and cached at module scope; UI components re-read on next
 * render but the snapshot never re-runs (capability flips don't
 * happen mid-session in practice).
 *
 * See `docs/internal/10-writing-assistant-design.md` § 3.
 */

export type WriterBackend = 'webgpu' | 'wasm-simd' | 'wasm';
export type EffectiveNet = '4g' | '3g' | 'slow' | 'unknown';

export interface DeviceCapabilities {
  /** WebGPU adapter present + initialised. */
  webgpu: boolean;
  /** WebAssembly SIMD support — almost universal on modern browsers. */
  wasmSimd: boolean;
  /** SharedArrayBuffer = WASM threads. Requires COOP/COEP isolation. */
  sharedArrayBuffer: boolean;
  /** `navigator.deviceMemory` (GB hint). Null on Firefox / Safari. */
  deviceMemoryGb: number | null;
  /** Reported storage quota in MB; null if `navigator.storage` is missing. */
  storageQuotaMb: number | null;
  /** Bytes already used by this origin's caches + IDB, in MB. */
  storageUsedMb: number | null;
  /** Network class hint via `navigator.connection`. */
  effectiveNet: EffectiveNet;
  /** Resolved best-available backend ranked by speed. */
  recommendedBackend: WriterBackend;
  /** Human-readable reasons surfaced in the UI when something's off. */
  unsupportedReasons: string[];
}

let cached: DeviceCapabilities | null = null;
let inflight: Promise<DeviceCapabilities> | null = null;

/**
 * Resolve once per session. Subsequent calls return the same snapshot.
 */
export function getDeviceCapabilities(): Promise<DeviceCapabilities> {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;
  inflight = detect().then((caps) => {
    cached = caps;
    return caps;
  });
  return inflight;
}

/**
 * Test-only — drop the snapshot so the next call re-detects.
 */
export function resetDeviceCapabilitiesForTests(): void {
  cached = null;
  inflight = null;
}

async function detect(): Promise<DeviceCapabilities> {
  const unsupportedReasons: string[] = [];

  const wasmSimd = detectWasmSimd();
  if (!wasmSimd) unsupportedReasons.push('no-wasm-simd');

  const sab = typeof SharedArrayBuffer !== 'undefined';

  const webgpu = await detectWebGpu();

  const deviceMemoryGb =
    typeof navigator !== 'undefined' && 'deviceMemory' in navigator
      ? ((navigator as unknown as { deviceMemory?: number }).deviceMemory ?? null)
      : null;

  let storageQuotaMb: number | null = null;
  let storageUsedMb: number | null = null;
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      if (est.quota != null) storageQuotaMb = Math.round(est.quota / (1024 * 1024));
      if (est.usage != null) storageUsedMb = Math.round(est.usage / (1024 * 1024));
    }
  } catch {
    // Some browsers gate `storage.estimate()` on a secure context; just
    // leave the values null and the UI hides the storage line.
  }

  const effectiveNet = readEffectiveNet();

  const recommendedBackend: WriterBackend = webgpu ? 'webgpu' : wasmSimd ? 'wasm-simd' : 'wasm';

  return {
    webgpu,
    wasmSimd,
    sharedArrayBuffer: sab,
    deviceMemoryGb,
    storageQuotaMb,
    storageUsedMb,
    effectiveNet,
    recommendedBackend,
    unsupportedReasons,
  };
}

/**
 * WebAssembly SIMD probe — compiles a tiny module that uses the
 * `v128.const` opcode; throws on engines without SIMD support.
 * Source: https://github.com/GoogleChromeLabs/wasm-feature-detect
 */
function detectWasmSimd(): boolean {
  if (typeof WebAssembly === 'undefined') return false;
  try {
    return WebAssembly.validate(
      new Uint8Array([
        0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0,
        253, 15, 253, 98, 11,
      ])
    );
  } catch {
    return false;
  }
}

async function detectWebGpu(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    const adapter = await gpu.requestAdapter();
    return adapter !== null && adapter !== undefined;
  } catch {
    return false;
  }
}

function readEffectiveNet(): EffectiveNet {
  if (typeof navigator === 'undefined') return 'unknown';
  type ConnLike = { effectiveType?: string; saveData?: boolean };
  const conn = (navigator as unknown as { connection?: ConnLike }).connection;
  if (!conn) return 'unknown';
  const et = conn.effectiveType ?? '';
  if (et === '4g') return '4g';
  if (et === '3g') return '3g';
  if (et === 'slow-2g' || et === '2g') return 'slow';
  return 'unknown';
}
