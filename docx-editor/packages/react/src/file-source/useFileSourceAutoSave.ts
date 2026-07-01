/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * useFileSourceAutoSave — periodic auto-save from a DocxEditor into
 * a FileSource.
 *
 * Bridges the existing editor surface (`DocxEditorRef.save()` →
 * `.docx` ArrayBuffer) with the existing storage surface
 * (`FileSource.save(id, bytes)`) so a Mode 3 / Mode 2 user's edits
 * land in the gateway's host backend without anyone wiring it by
 * hand.
 *
 * Why this lives at the host-app layer and not inside DocxEditor:
 *
 *   - DocxEditor is the eigenpal-upstream surface; FileSource is
 *     casual-editor's storage abstraction. Mixing them inside the
 *     editor would force every embedder to take a FileSource shape
 *     they may not want.
 *   - Auto-save policy (interval, dirty-detection, beforeunload
 *     behaviour) is application-level. Keeping it as a hook leaves
 *     it composable.
 *
 * Scope notes
 *
 *   - "Snapshot on room drain" (the design intent in CLAUDE.md) is
 *     genuinely the WS gateway's responsibility — but the gateway
 *     can't decode Y.Doc state without a Bun worker pool. Auto-save
 *     on the CLIENT covers most of the same need: as long as the
 *     editor pushes its serialized .docx every N seconds, a sudden
 *     disconnect loses at most one tick's worth of edits. The
 *     remaining gap (room-drain snapshot) is left as a follow-up.
 *
 *   - Etag conflict handling is not implemented. Last-write-wins is
 *     fine for single-user Mode 3; multi-user co-edit through a
 *     single FileSource is a separate design problem.
 *
 *   - One save in flight at a time, but never lossy: a request that
 *     lands while a save is resolving is queued, and the in-flight
 *     drain loop re-runs once more for it. This matters on tab close —
 *     a hide flush racing an interval tick must not be silently
 *     dropped. A hung save is bounded by SAVE_TIMEOUT_MS so it can't
 *     pin the in-flight guard and halt all future autosaves.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { FileSource } from './types';

/**
 * Upper bound on a single save round-trip. If FileSource.save() hangs
 * past this, the tick resolves as an error so the in-flight guard is
 * released and later autosaves keep working instead of deadlocking.
 */
const SAVE_TIMEOUT_MS = 30000;

// ---------------------------------------------------------------
// Pure controller — extracted so it's bun-unit-testable without a
// React renderer. The hook below is a thin wrapper that exposes the
// controller's state to React.
// ---------------------------------------------------------------

/**
 * Result of one auto-save tick. `skip` means "nothing changed worth
 * saving" (no ref attached, editor returned null bytes, or a prior
 * save is still in flight); `ok` carries the etag the FileSource
 * returned; `err` carries the throw.
 */
export type AutoSaveTickResult =
  | { kind: 'skip'; reason: 'no-ref' | 'no-bytes' | 'in-flight' }
  | { kind: 'ok'; etag: string; savedAt: Date }
  | { kind: 'err'; err: unknown };

export interface PerformAutoSaveDeps {
  /** Returns the live editor ref (or null when the editor isn't mounted). */
  getRef: () => AutoSaveEditorRef | null;
  fileSource: FileSource;
  docId: string;
  name?: string;
}

/**
 * One-shot save round-trip. Pure with respect to React — takes its
 * dependencies as plain args + getRef, returns a discriminated
 * result. The React hook wraps this with in-flight bookkeeping and
 * state.
 */
export async function performAutoSave(deps: PerformAutoSaveDeps): Promise<AutoSaveTickResult> {
  const ref = deps.getRef();
  if (!ref) return { kind: 'skip', reason: 'no-ref' };
  try {
    const bytes = await ref.save({ selective: true });
    // When the editor ref is mounted, a null return means serialization
    // failed silently (the editor caught the error internally). Surface it
    // as an error so the status indicator shows "Save failed" rather than
    // silently treating it as "no changes" (audit: autosave-skip-hides-failures).
    if (!bytes) {
      return { kind: 'err', err: new Error('Document serialization returned no bytes') };
    }
    const result = await deps.fileSource.save(deps.docId, bytes, { name: deps.name });
    return { kind: 'ok', etag: result.etag, savedAt: new Date() };
  } catch (err) {
    return { kind: 'err', err };
  }
}

// ---------------------------------------------------------------
// React hook
// ---------------------------------------------------------------

/**
 * Minimal subset of DocxEditorRef the hook needs. Typed structurally
 * so the hook doesn't depend on the full editor surface — the host
 * passes a ref the editor populates; the hook only ever calls
 * `save()`.
 */
export interface AutoSaveEditorRef {
  save: (options?: { selective?: boolean }) => Promise<ArrayBuffer | null>;
}

export interface UseFileSourceAutoSaveOptions {
  /** FileSource to push saved bytes into. */
  fileSource: FileSource;
  /** The doc id within `fileSource`. */
  docId: string;
  /**
   * React ref pointing at the editor instance. Must expose a
   * compatible `save()` shape — DocxEditorRef satisfies this.
   * Plain ref so the hook works with both `useRef<DocxEditorRef>()`
   * and any other ref shape.
   */
  editorRef: React.RefObject<AutoSaveEditorRef | null>;
  /**
   * Tick interval in ms. Default 30s — same cadence as the editor's
   * own localStorage auto-save.
   */
  interval?: number;
  /** Hard-off switch. Default true. */
  enabled?: boolean;
  /**
   * Optional file-name to attach on first-save (when docId is null
   * — see save() below). The hook doesn't watch this for changes;
   * the host should call FileSource.rename() for that.
   */
  name?: string;
  /**
   * Fires after every successful tick. Hosts can use this to update
   * a "Saved at HH:MM" indicator without subscribing to the hook's
   * status.
   */
  onSaved?: (when: Date, etag: string) => void;
  /**
   * Fires when a save tick throws. The hook keeps trying on
   * subsequent ticks; the host decides whether to surface a banner.
   */
  onError?: (err: unknown) => void;
}

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface UseFileSourceAutoSaveReturn {
  status: AutoSaveStatus;
  /** Last successful save time. null until the first save lands. */
  lastSavedAt: Date | null;
  /** Last error caught — kept for status='error' rendering. */
  lastError: unknown;
  /**
   * Force a save right now (bypassing the interval). Returns when
   * the save round-trip finishes. Useful for "Save & close" buttons
   * or beforeunload handlers the host owns.
   */
  flush: () => Promise<void>;
}

/**
 * Schedules periodic saves of the editor's current .docx bytes into
 * the configured FileSource. See module doc for scope notes.
 */
export function useFileSourceAutoSave(
  opts: UseFileSourceAutoSaveOptions
): UseFileSourceAutoSaveReturn {
  const {
    fileSource,
    docId,
    editorRef,
    interval = 30000,
    enabled = true,
    name,
    onSaved,
    onError,
  } = opts;

  const [status, setStatus] = useState<AutoSaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [lastError, setLastError] = useState<unknown>(null);

  // Ref for "is a save currently in flight" — guarding setState
  // doesn't help because React batches updates; a plain mutable ref
  // gives us reliable in-flight detection.
  const inFlightRef = useRef(false);
  // "A save was requested while one was already running." The drain
  // loop in runSave re-runs once more when this is set, so a flush or
  // hide-triggered save is never silently dropped just because an
  // interval tick happened to be mid-flight (audit: autosave-flush-no-queue).
  const pendingRef = useRef(false);
  // Auto-clear "Save failed" after 60 s so a stale error badge doesn't
  // persist indefinitely when the next ticks simply have nothing to save
  // (audit: autosave-stale-error-status).
  const errorClearTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The promise for the currently-draining save loop. flush() callers
  // join this so an awaited flush() resolves only once their requested
  // save has actually run, even if another save was in flight when they
  // called (audit: autosave-pagehide-no-await coupling).
  const inFlightPromiseRef = useRef<Promise<void> | null>(null);

  // Callbacks captured via ref so the tick effect doesn't restart
  // when the host passes a fresh arrow on every render. Same trick
  // PersonalAuthGate uses for onAuthenticated.
  const onSavedRef = useRef(onSaved);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onSavedRef.current = onSaved;
    onErrorRef.current = onError;
  }, [onSaved, onError]);

  // Snapshot of the host-controlled deps inside a ref so the timing
  // effect can read fresh values without re-firing on every change.
  const cfgRef = useRef({ fileSource, docId, editorRef, name });
  useEffect(() => {
    cfgRef.current = { fileSource, docId, editorRef, name };
  }, [fileSource, docId, editorRef, name]);

  /**
   * Performs exactly one save round-trip and reflects the outcome in
   * status / lastSavedAt / lastError. Bounded by SAVE_TIMEOUT_MS: a
   * FileSource.save() that hangs (network stall, unresponsive host)
   * resolves as an error instead of pinning the in-flight flag forever
   * and silently halting all future autosaves (audit:
   * autosave-inflight-deadlock).
   */
  const executeOne = useCallback(async (): Promise<void> => {
    const cfg = cfgRef.current;
    setStatus('saving');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<AutoSaveTickResult>((resolve) => {
      timer = setTimeout(
        () => resolve({ kind: 'err', err: new Error('autosave timed out') }),
        SAVE_TIMEOUT_MS
      );
    });
    try {
      const result = await Promise.race([
        performAutoSave({
          getRef: () => cfg.editorRef.current,
          fileSource: cfg.fileSource,
          docId: cfg.docId,
          name: cfg.name,
        }),
        timeout,
      ]);
      switch (result.kind) {
        case 'ok':
          setLastSavedAt(result.savedAt);
          setStatus('saved');
          setLastError(null);
          clearTimeout(errorClearTimerRef.current);
          errorClearTimerRef.current = undefined;
          onSavedRef.current?.(result.savedAt, result.etag);
          break;
        case 'err':
          setStatus('error');
          setLastError(result.err);
          // Auto-clear the error badge after 60 s so a one-off failure
          // doesn't haunt the title bar forever (autosave-stale-error-status).
          clearTimeout(errorClearTimerRef.current);
          errorClearTimerRef.current = setTimeout(() => {
            setStatus((s) => (s === 'error' ? 'idle' : s));
            setLastError(null);
            errorClearTimerRef.current = undefined;
          }, 60_000);
          onErrorRef.current?.(result.err);
          break;
        case 'skip':
          // Idle if there was nothing to save; preserve any prior
          // 'saved' status when the skip was just "no edits since
          // last tick" so the host's "Saved at HH:MM" sticks.
          if (result.reason === 'no-ref') setStatus('idle');
          else setStatus((s) => (s === 'saving' ? 'idle' : s));
          break;
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
  }, []);

  /**
   * Public save entry point. Coalescing + guaranteed-flush: requests a
   * save and drains every pending request through a single loop so
   * concurrent callers (interval tick + hide flush + host "Save & close")
   * never drop each other's intent. Returns a promise that resolves once
   * the requested save has actually run, even when another save was in
   * flight at call time.
   */
  const runSave = useCallback((): Promise<void> => {
    // Register intent first, so a call that arrives mid-flight is picked
    // up by the running drain loop rather than skipped.
    pendingRef.current = true;
    if (inFlightRef.current && inFlightPromiseRef.current) {
      return inFlightPromiseRef.current;
    }
    inFlightRef.current = true;
    const drain = (async () => {
      try {
        while (pendingRef.current) {
          pendingRef.current = false;
          await executeOne();
        }
      } finally {
        inFlightRef.current = false;
        inFlightPromiseRef.current = null;
      }
    })();
    inFlightPromiseRef.current = drain;
    return drain;
  }, [executeOne]);

  // Interval ticker. Re-arms when `enabled` or `interval` change;
  // every other dep is read via ref so the timer survives parent
  // re-renders.
  useEffect(() => {
    if (!enabled || interval <= 0) return;
    const id = setInterval(() => {
      void runSave();
    }, interval);
    return () => clearInterval(id);
  }, [enabled, interval, runSave]);

  // Flush the final interval of edits when the page is being hidden or
  // unloaded, so closing the tab between ticks doesn't lose up to one
  // interval's worth of edits (Phase 2 / audit doc 17 — "Option A").
  //
  // `visibilitychange` → 'hidden' is the reliable primary signal: it
  // fires on tab switch, app switch, and close, while the page is usually
  // still alive enough to complete an async save. `pagehide` backs it up
  // for the real unload / bfcache path. We deliberately avoid
  // `beforeunload` — browsers don't honour its async work and registering
  // it disables the back/forward cache. Best-effort, not a safety net for
  // crash / network-drop (that's the deferred server-side snapshot,
  // "Option C" in doc 18); it closes the common tab-close case.
  useEffect(() => {
    if (!enabled) return;
    const flushOnHide = () => {
      // Don't await — the page may be going away.
      void runSave();
    };
    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        flushOnHide();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flushOnHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flushOnHide);
    };
  }, [enabled, runSave]);

  // Clear stale error timer on unmount.
  useEffect(() => {
    return () => clearTimeout(errorClearTimerRef.current);
  }, []);

  // Stable object identity so hosts can pass the return value into
  // dependency arrays without churn.
  return useMemo(
    () => ({
      status,
      lastSavedAt,
      lastError,
      flush: runSave,
    }),
    [status, lastSavedAt, lastError, runSave]
  );
}
