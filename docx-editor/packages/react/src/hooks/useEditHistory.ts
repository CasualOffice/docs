/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Document-edit history hook — captures every committed ProseMirror
 * transaction into a coalesced, human-readable feed. Pairs with
 * `<VersionHistoryPanel>` to surface a side-panel timeline with a
 * revert-to button. Mirrors the shape of Casual Sheets' `useLocalHistory`
 * + `HistoryPanel` so the two products feel cousin.
 *
 * Key behaviour:
 *   - Subscribes via a ProseMirror plugin that watches every applied
 *     transaction (`appendTransaction` is unnecessary — we only need to
 *     observe, not mutate).
 *   - Coalesces rapid typing into a single entry within a configurable
 *     idle window (default 2000 ms). Once the window elapses, the next
 *     change seals the current entry and starts a new one.
 *   - Holds a ring buffer of up to `cap` entries (default 500). Older
 *     entries drop off silently — matches Sheets.
 *   - Revert reconstructs the doc by replacing it with the entry's
 *     captured `before` JSON, wrapped in a new transaction so the
 *     revert itself lands in the undo stack (Ctrl+Z reverses a revert).
 *
 * Not in scope for v1:
 *   - IndexedDB persistence (entries die on refresh).
 *   - Per-paragraph diff highlighting (entries record summary only).
 *   - Cross-peer entry merging in collab mode — for collab use, the
 *     Y.Doc-update path is preferred; this hook is the solo / single-peer
 *     feed.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { Plugin, PluginKey } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Transaction } from 'prosemirror-state';
import { findTextRange } from './findTextRange';

export interface EditHistoryEntry {
  /** Stable id within this session — used as React key + ARIA. */
  id: string;
  /** Time the entry FIRST opened (ms epoch). Coalesced extensions
   *  don't update this — sortable + human-readable timestamp. */
  time: number;
  /** Last time a transaction landed on this entry. */
  lastTouched: number;
  /** Display name of the author. "You" for solo; presence name in collab. */
  author: string;
  /** Short summary derived from transaction metadata + step count. */
  summary: string;
  /** Number of transactions coalesced into this entry. */
  txCount: number;
  /**
   * Doc JSON BEFORE the first transaction in this entry — what revert
   * restores. Captured once when the entry opens; not updated on
   * coalesce. May be large for big docs — we trade memory for revert
   * fidelity.
   */
  before: unknown;
}

export interface UseEditHistoryOptions {
  /** Display name shown for entries this client originates. */
  author?: string;
  /** Max entries to hold; older drop off. Default 500. */
  cap?: number;
  /** Coalesce window in ms — successive transactions within this
   *  window merge into the latest entry. Default 2000. */
  coalesceMs?: number;
}

export interface UseEditHistoryReturn {
  /** Newest-last entry list. Sort in the panel if you prefer
   *  newest-first display. */
  entries: EditHistoryEntry[];
  /** Replace the active document with the captured `before` state of
   *  the entry at `entry.id`. Wraps the change in a single transaction
   *  so it can itself be undone with Ctrl+Z. */
  revert: (entryId: string) => void;
  /** Drop all entries. Useful after explicit save / room rejoin. */
  clear: () => void;
  /**
   * Attach the capture plugin to an EditorView's state. Returns a
   * cleanup function the caller invokes on unmount. Most callers pass
   * an EditorView ref to `useEffect`:
   *
   *   useEffect(() => attach(view), [view]);
   */
  attach: (view: EditorView) => () => void;
  /**
   * Snapshot the live document as plain text — used by the diff view
   * to compute "after" for the latest entry (next-newer entry's
   * `before` provides "after" for older entries). Returns an empty
   * string when no view is attached.
   */
  getCurrentText: () => string;
  /**
   * Revert a SINGLE diff segment on the live document. Used by the
   * per-change accept/reject UI in the version-history panel.
   *
   * - `op: 'add'` — the segment's `text` was inserted in this entry;
   *   reverting deletes it from the live doc.
   * - `op: 'remove'` — the segment's `text` was removed in this
   *   entry; reverting puts it back at the matching context.
   *
   * `context` is the immediately-preceding kept text (last ~30 chars
   * of the kept run just before this segment). It disambiguates
   * identical substrings; without it, "hello" appearing in two
   * paragraphs would always revert the first occurrence.
   *
   * Returns `true` on success. Failures (text no longer found in the
   * live doc, view detached) return `false` — the panel surfaces a
   * toast in that case.
   */
  revertHunk: (op: 'add' | 'remove', text: string, context: string) => boolean;
}

const PLUGIN_KEY = new PluginKey('eigenpal-doc-history');

let entryIdCounter = 0;
const nextEntryId = (): string => `h${Date.now().toString(36)}-${(entryIdCounter++).toString(36)}`;

/**
 * Heuristic summary for a transaction: examine the steps to produce a
 * human-readable label. Doesn't have to be perfect — it's a glance, not
 * a diff.
 */
function summarize(tr: Transaction): string {
  const steps = tr.steps;
  if (steps.length === 0) return 'No-op edit';
  // Step.toJSON.stepType tells us "replace" / "addMark" / "removeMark" /
  // "replaceAround" etc. We coarse-bucket.
  const buckets = new Set<string>();
  let charsAdded = 0;
  for (const step of steps) {
    const json = step.toJSON() as { stepType?: string; slice?: { content?: unknown[] } };
    const type = json.stepType ?? 'edit';
    buckets.add(type);
    if (type === 'replace' || type === 'replaceAround') {
      const sliceSize = (json.slice?.content?.length as number | undefined) ?? 0;
      charsAdded += sliceSize;
    }
  }
  if (buckets.has('addMark') || buckets.has('removeMark')) {
    return buckets.has('addMark') ? 'Formatting applied' : 'Formatting removed';
  }
  // Step JSON exposes `slice.content` (insertions) but not deletions in a
  // friendly form — so we only differentiate insert / no-op for now.
  // Replace-style steps that net-zero (e.g. exact-length replacement)
  // fall through to the generic label.
  if (charsAdded > 0) return 'Text inserted';
  return 'Edit applied';
}

export function useEditHistory(options: UseEditHistoryOptions = {}): UseEditHistoryReturn {
  const { author = 'You', cap = 500, coalesceMs = 2000 } = options;

  const [entries, setEntries] = useState<EditHistoryEntry[]>([]);
  // The EditorView whose plugin is currently attached. Held so revert
  // knows where to dispatch its replacing transaction.
  const viewRef = useRef<EditorView | null>(null);
  // Hold latest options in a ref so the plugin's apply closure doesn't
  // get re-created on every option change (which would tear and rebuild
  // the plugin and lose state).
  const optionsRef = useRef({ author, cap, coalesceMs });
  optionsRef.current = { author, cap, coalesceMs };

  const recordTx = useCallback((tr: Transaction) => {
    if (!tr.docChanged) return;
    // Skip transactions that originated from a revert — they carry our
    // meta marker so they don't recurse into history records.
    if (tr.getMeta(PLUGIN_KEY) === 'revert') return;

    const { author: a, cap: c, coalesceMs: cw } = optionsRef.current;
    const now = Date.now();
    const summary = summarize(tr);
    const before = (tr.before as { toJSON?: () => unknown } | undefined)?.toJSON?.();

    setEntries((prev) => {
      const last = prev[prev.length - 1];
      // Coalesce: same author + within window + ignore mark-only
      // entries collapsing into text entries (keeps the timeline readable).
      if (last && last.author === a && now - last.lastTouched < cw) {
        const merged: EditHistoryEntry = {
          ...last,
          lastTouched: now,
          summary: summary === last.summary ? last.summary : `${last.summary} · ${summary}`,
          txCount: last.txCount + 1,
        };
        return [...prev.slice(0, -1), merged];
      }
      const entry: EditHistoryEntry = {
        id: nextEntryId(),
        time: now,
        lastTouched: now,
        author: a,
        summary,
        txCount: 1,
        before,
      };
      // Cap-trim oldest first.
      const next = [...prev, entry];
      return next.length > c ? next.slice(next.length - c) : next;
    });
  }, []);

  // Hold `recordTx` in a ref so the plugin's apply closure (captured
  // at `attach` time) always calls the latest version. Without this,
  // a stale `recordTx` closure would silently keep firing against an
  // old `setEntries` after re-renders.
  const recordTxRef = useRef(recordTx);
  recordTxRef.current = recordTx;

  const attach = useCallback((view: EditorView) => {
    viewRef.current = view;

    // Observe every committed transaction by hooking the plugin's
    // `state.apply` — that's the canonical PM API for observation and
    // doesn't depend on `view.props.dispatchTransaction` being honored
    // post-construction (which was the previous bug: the wrap survived
    // but PM's internal `someProp` lookup didn't always pick it up,
    // so user typing produced no history entries).
    const plugin = new Plugin({
      key: PLUGIN_KEY,
      state: {
        init() {
          return null;
        },
        apply(tr) {
          if (tr.docChanged && tr.getMeta(PLUGIN_KEY) !== 'revert') {
            recordTxRef.current(tr);
          }
          return null;
        },
      },
    });

    // Reconfigure the live state to include our plugin. Existing
    // plugins are preserved.
    const state = view.state.reconfigure({
      plugins: [...view.state.plugins, plugin],
    });
    view.updateState(state);

    return () => {
      viewRef.current = null;
      // Detach by reconfiguring without the plugin — best-effort, the
      // view may already be on its way out.
      try {
        const next = view.state.reconfigure({
          plugins: view.state.plugins.filter((p) => p !== plugin),
        });
        view.updateState(next);
      } catch {
        // View may have been destroyed mid-cleanup; ignore.
      }
    };
  }, []);

  const revert = useCallback((entryId: string) => {
    const view = viewRef.current;
    if (!view) return;
    setEntries((prev) => {
      const entry = prev.find((e) => e.id === entryId);
      if (!entry || entry.before == null) return prev;
      try {
        const node = view.state.schema.nodeFromJSON(entry.before);
        const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, node.content);
        tr.setMeta(PLUGIN_KEY, 'revert');
        view.dispatch(tr);
      } catch (err) {
        // Schema may have shifted between capture and revert — log and
        // bail rather than corrupt the doc.
        console.warn('[history] revert failed for', entryId, err);
      }
      return prev;
    });
  }, []);

  const clear = useCallback(() => setEntries([]), []);

  const getCurrentText = useCallback((): string => {
    const view = viewRef.current;
    if (!view) return '';
    return view.state.doc.textBetween(0, view.state.doc.content.size, '\n', '\n');
  }, []);

  const revertHunk = useCallback((op: 'add' | 'remove', text: string, context: string): boolean => {
    const view = viewRef.current;
    if (!view || !text) return false;
    if (op === 'add') {
      // Find the inserted text in the live doc anchored by the
      // preceding kept context. Delete it.
      const range = findTextRange(view.state.doc, text, context);
      if (!range) return false;
      view.dispatch(view.state.tr.delete(range.from, range.to));
      return true;
    }
    // op === 'remove' — put the deleted text back at the position
    // where the context's tail currently sits. We search for the
    // context only (the deleted text is no longer in the doc), then
    // insert at the context's end.
    if (!context) return false;
    const ctxRange = findTextRange(view.state.doc, context);
    if (!ctxRange) return false;
    view.dispatch(view.state.tr.insertText(text, ctxRange.to));
    return true;
  }, []);

  return useMemo(
    () => ({ entries, revert, clear, attach, getCurrentText, revertHunk }),
    [entries, revert, clear, attach, getCurrentText, revertHunk]
  );
}
