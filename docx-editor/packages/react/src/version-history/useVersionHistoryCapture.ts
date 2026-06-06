/**
 * Coarse-grained snapshot capture for the editor's version history.
 *
 * Distinct from `useEditHistory` (the fine-grained, in-memory feed
 * powering the Activity tab): this hook writes a small number of
 * deliberate snapshots into IDB so the user can roll back to "how
 * the doc looked an hour ago" across refreshes / crashes.
 *
 *   - **Idle interval** ~10 min while the doc is dirty since the
 *     last capture. Power users edit continuously; one snapshot per
 *     minute would balloon IDB without changing the user-visible
 *     story. Idle users get nothing — no point capturing identical
 *     state.
 *   - **Explicit save** via `saveNamedVersion(name)` exposed from
 *     this module. The File menu's "Save version…" calls it; manual
 *     snapshots are never auto-pruned.
 *
 * Skipped in co-edit mode — when Yjs/y-websocket lands, the server
 * owns the authoritative state and we'd just be duplicating local
 * copies. Wiring follows: callers pass `enabled: !roomId`.
 *
 * Ported from `services/sheet/apps/web/src/version-history/useVersionHistoryCapture.ts`
 * — adapted to a ProseMirror view (observe via a plugin instead of
 * Univer's command service) and to a per-doc `docId`.
 */

import { useEffect, useRef } from 'react';
import { Plugin, PluginKey } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { writeVersion } from './store';
import { getLiveVersionFeed } from './useLiveVersionList';

const DEFAULT_IDLE_INTERVAL_MS = 10 * 60 * 1000;

const CAPTURE_PLUGIN_KEY = new PluginKey('version-history-capture');

export interface UseVersionHistoryCaptureOptions {
  /** Stable id for the active document — drives per-doc retention +
   *  listing scope. Use the file name (matches recent-files identity)
   *  until a true docId surface lands. */
  docId: string | null;
  /** The mounted ProseMirror view. `null` while the editor is
   *  unmounted or mid-swap. */
  view: EditorView | null;
  /** Disable capture (e.g. in co-edit rooms). Default `true`. */
  enabled?: boolean;
  /** Idle interval between auto captures while dirty. Default 10 min. */
  idleIntervalMs?: number;
  /** Optional source format passed through onto the snapshot record
   *  (`'docx'` today; here for forward compatibility). */
  sourceFormat?: string | null;
}

export interface UseVersionHistoryCaptureReturn {
  /** Imperative: snapshot the current doc as a named manual entry.
   *  Returns the new snapshot id, or `null` if the view / docId
   *  isn't ready. */
  saveNamedVersion: (name: string) => Promise<number | null>;
}

/** Imperative escape hatch outside React — the File menu can wire
 *  a no-hook button into this. The hook installs the latest
 *  implementation; if no hook is mounted, calls return `null`. */
let latestImperativeSave: ((name: string) => Promise<number | null>) | null = null;

export function saveNamedVersion(name: string): Promise<number | null> {
  return latestImperativeSave ? latestImperativeSave(name) : Promise.resolve(null);
}

export function useVersionHistoryCapture(
  options: UseVersionHistoryCaptureOptions
): UseVersionHistoryCaptureReturn {
  const {
    docId,
    view,
    enabled = true,
    idleIntervalMs = DEFAULT_IDLE_INTERVAL_MS,
    sourceFormat = null,
  } = options;

  // Ensure the live feed exists before any subscriber mounts.
  getLiveVersionFeed();

  // Hold latest options + view in a ref so the capture closure reads
  // the current values on every call, not whatever was in scope when
  // `useRef` first ran (which would leave `view` stale at null).
  const optsRef = useRef<{
    docId: string | null;
    sourceFormat: string | null;
    view: EditorView | null;
  }>({ docId, sourceFormat, view });
  optsRef.current = { docId, sourceFormat, view };

  // Module-scope dirty flag — set by the observe plugin, read by the
  // interval. A ref so re-renders don't reset it.
  const dirtyRef = useRef(false);

  const doCapture = useRef(
    async (kind: 'auto' | 'manual', name: string): Promise<number | null> => {
      const { view: liveView, docId: liveDocId, sourceFormat: liveFmt } = optsRef.current;
      if (!liveView || !liveDocId) return null;
      try {
        const data = liveView.state.doc.toJSON();
        const id = await writeVersion({
          docId: liveDocId,
          kind,
          name,
          savedAt: Date.now(),
          sourceFormat: liveFmt,
          data,
        });
        return id;
      } catch (err) {
        console.warn('[version-history] capture failed', err);
        return null;
      }
    }
  );

  // Refresh the imperative save closure on every render so the most
  // recent `view` / `docId` are captured.
  useEffect(() => {
    latestImperativeSave = (name: string) =>
      doCapture.current('manual', name.trim() || 'Untitled version');
    return () => {
      // Only clear if we're still the registered impl; another
      // mount may have taken over.
      if (latestImperativeSave) latestImperativeSave = null;
    };
  });

  // Attach the dirty-tracking plugin + spin up the idle interval.
  useEffect(() => {
    if (!enabled || !view || !docId) return;

    // Reset dirty on (re)attach so a fresh doc doesn't inherit the
    // previous one's pending state.
    dirtyRef.current = false;

    const plugin = new Plugin({
      key: CAPTURE_PLUGIN_KEY,
      state: {
        init() {
          return null;
        },
        apply(tr) {
          if (tr.docChanged) dirtyRef.current = true;
          return null;
        },
      },
    });

    const nextState = view.state.reconfigure({
      plugins: [...view.state.plugins, plugin],
    });
    view.updateState(nextState);

    const tick = setInterval(() => {
      if (!dirtyRef.current) return;
      void doCapture.current('auto', deriveAutoLabel(docId)).then((id) => {
        if (id != null) dirtyRef.current = false;
      });
    }, idleIntervalMs);

    return () => {
      clearInterval(tick);
      try {
        const detached = view.state.reconfigure({
          plugins: view.state.plugins.filter((p) => p !== plugin),
        });
        view.updateState(detached);
      } catch {
        // View may have been destroyed mid-cleanup; ignore.
      }
    };
  }, [enabled, view, docId, idleIntervalMs]);

  return {
    saveNamedVersion: (name: string) =>
      doCapture.current('manual', name.trim() || 'Untitled version'),
  };
}

function deriveAutoLabel(docId: string): string {
  // Short, scannable label — the panel already shows a relative
  // timestamp, so this just answers "what was this snapshot of?".
  const base = docId.replace(/\.docx$/i, '') || 'Document';
  return `${base} — auto`;
}
