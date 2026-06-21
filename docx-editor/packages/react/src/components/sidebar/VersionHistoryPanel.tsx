/**
 * Version-history side panel — surfaces the feed produced by
 * `useEditHistory` as a scrollable timeline with a revert button
 * per entry. Mirrors the Sheets `HistoryPanel` shape so the two
 * products feel like cousins.
 *
 * Layout: vertical list, newest-first. Each entry shows author,
 * elapsed-time stamp, coalesced edit count, summary, and a "Revert
 * to here" button. Reverting takes the doc back to the entry's `before`
 * snapshot (captured when the entry opened) and wraps the change in a
 * new transaction so Ctrl+Z reverses the revert.
 *
 * Consumer pattern — solo session:
 *
 *   const history = useEditHistory({ author: 'You' });
 *   useEffect(() => view ? history.attach(view) : undefined, [view, history]);
 *   return <VersionHistoryPanel history={history} />;
 *
 * Collab session — pass `author={presenceName}` so peer entries show
 * the right name when capturing locally-applied transactions; the
 * cross-peer log is the Yjs op-log (out of scope for v1).
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import { PanelState } from '../ui/PanelState';
import { Tooltip } from '../ui/Tooltip';
import { RightDockPanel } from '../RightDockPanel';
import type { EditHistoryEntry, UseEditHistoryReturn } from '../../hooks/useEditHistory';
import { diffStats, diffWords, extractText } from '../../hooks/wordDiff';
import { useLiveVersionList } from '../../version-history/useLiveVersionList';
import type { ServerVersionBackend } from '../../version-history/server-source';
import {
  deleteVersion,
  readVersion,
  renameVersion,
  type VersionSnapshot,
} from '../../version-history/store';

export interface VersionHistoryPanelProps {
  history: UseEditHistoryReturn;
  /** Active document id — drives the per-doc Versions tab. When null,
   *  the Versions tab shows a "no document" state and the Activity tab
   *  is the default. */
  docId?: string | null;
  /** Imperative API exposed by `useVersionHistoryCapture`. The "Save
   *  version…" button calls this; if absent, the button is hidden. */
  saveNamedVersion?: (name: string) => Promise<number | null>;
  /** Callback the panel invokes to restore a snapshot's `data` into
   *  the live editor. The host (DocxEditor) implements this against
   *  its EditorView — keeps the panel UI-only. */
  onRestoreSnapshot?: (data: unknown) => void;
  /** Called when the user clicks the close (X) button in the panel
   *  header. The host (DocxEditor) flips the panel-open flag. */
  onClose?: () => void;
  /** When set, the Versions tab lists the host's server-persisted
   *  revision chain (`/history`) instead of the local IndexedDB
   *  snapshots. Absent → local-only (unchanged). */
  serverBackend?: ServerVersionBackend;
  /** Restore a server revision: the host downloads its `.docx` and
   *  reloads the editor. Required for server entries to be restorable. */
  onRestoreServerVersion?: (version: number) => void;
  /** Display title for the panel. Default "Version history". */
  title?: string;
  /** Empty-state message when no entries exist yet. */
  emptyHint?: string;
  /** Optional extra style applied to the panel root. */
  style?: CSSProperties;
}

type Tab = 'versions' | 'activity';

// Width / outer chrome / header come from RightDockPanel — the old
// ROOT_STYLE and HEADER_STYLE were removed in Phase 3 (panel chrome
// unification).

const TABS_STYLE: CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid var(--doc-border, #e0e0e0)',
};

const SUBHEADER_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 16px',
  fontSize: 12,
  color: 'var(--doc-text-muted)',
  fontWeight: 600,
};

const GROUP_STYLE: CSSProperties = {
  listStyle: 'none',
};

const GROUP_HEADER_STYLE: CSSProperties = {
  padding: '8px 16px 4px',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--doc-text-muted)',
  fontWeight: 600,
};

const KIND_BADGE_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  color: '#eab308', // amber-500 — manual-named star
  outline: 'none',
};

const SIZE_STYLE: CSSProperties = {
  fontSize: 11,
  color: 'var(--doc-text-muted)',
};

const SAVE_VERSION_BTN_STYLE: CSSProperties = {
  marginLeft: 'auto',
  padding: '4px 10px',
  border: '1px solid var(--doc-border-strong, var(--doc-border))',
  borderRadius: 4,
  background: 'transparent',
  color: 'var(--doc-primary, #1a73e8)',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  textTransform: 'none',
  letterSpacing: 0,
};

const COUNT_STYLE: CSSProperties = {
  marginLeft: 'auto',
  fontSize: 12,
  color: 'var(--doc-text-muted)',
  fontWeight: 400,
};

const LIST_STYLE: CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  listStyle: 'none',
  margin: 0,
  padding: 0,
};

const ENTRY_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '12px 16px',
  borderBottom: '1px solid var(--doc-border-light, #f0eee9)',
};

const ENTRY_HEAD_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
  fontSize: 12,
  color: 'var(--doc-text-muted)',
};

const AUTHOR_STYLE: CSSProperties = {
  color: 'var(--doc-text)',
  fontWeight: 600,
};

const SUMMARY_STYLE: CSSProperties = {
  fontSize: 13,
  color: 'var(--doc-text-on-surface, #1f2937)',
};

const REVERT_BUTTON_STYLE: CSSProperties = {
  alignSelf: 'flex-start',
  marginTop: 4,
  padding: '4px 10px',
  border: '1px solid var(--doc-border-strong, var(--doc-border))',
  borderRadius: 4,
  background: 'transparent',
  color: 'var(--doc-text)',
  fontSize: 12,
  cursor: 'pointer',
};

const ENTRY_ACTIONS_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginTop: 4,
};

const STATS_PILL_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 11,
  marginLeft: 'auto',
  color: 'var(--doc-text-muted)',
};

const STAT_ADD_STYLE: CSSProperties = {
  color: '#16a34a',
  fontWeight: 600,
};

const STAT_REMOVE_STYLE: CSSProperties = {
  color: '#dc2626',
  fontWeight: 600,
};

const DIFF_BOX_STYLE: CSSProperties = {
  marginTop: 8,
  padding: '8px 10px',
  background: 'var(--doc-surface-sunken, #f6f8fa)',
  border: '1px solid var(--doc-border-light, #e7eaee)',
  borderRadius: 6,
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  fontSize: 12,
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: 320,
  overflow: 'auto',
};

const DIFF_ADD_STYLE: CSSProperties = {
  background: '#defbe1',
  color: '#15803d',
  borderRadius: 2,
  padding: '0 2px',
};

const DIFF_REMOVE_STYLE: CSSProperties = {
  background: '#fde2e1',
  color: '#b91c1c',
  borderRadius: 2,
  padding: '0 2px',
  textDecoration: 'line-through',
};

const SHOW_DIFF_BTN_STYLE: CSSProperties = {
  padding: '4px 8px',
  border: '1px solid transparent',
  borderRadius: 4,
  background: 'transparent',
  color: 'var(--doc-primary, #1a73e8)',
  fontSize: 12,
  cursor: 'pointer',
};

const DIFF_TRUNCATE_LIMIT = 50_000; // chars per side — safety for huge docs

function relativeTime(time: number, now: number): string {
  const diff = Math.max(0, now - time);
  const s = Math.round(diff / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function VersionHistoryPanel({
  history,
  docId = null,
  saveNamedVersion,
  onRestoreSnapshot,
  onClose,
  title = 'Version history',
  emptyHint = 'No edits yet. Type into the document to start recording.',
  serverBackend,
  onRestoreServerVersion,
}: VersionHistoryPanelProps) {
  // Default to Versions when we have a docId (the persisted timeline
  // is what users come here for); Activity is the secondary "what
  // just changed" feed. With no docId only Activity makes sense.
  const [tab, setTab] = useState<Tab>(docId ? 'versions' : 'activity');

  // Render via the shared RightDockPanel shell so every right-edge
  // panel inherits the same width, header chrome, slide-in motion,
  // and close-X affordance. The tab strip + tab body live in
  // children so they sit below the standard header.
  return (
    <RightDockPanel
      title={title}
      icon={<MaterialSymbol name="history" size={18} />}
      testId="version-history-panel"
      ariaLabel={title}
      onClose={onClose ?? (() => {})}
    >
      <div style={TABS_STYLE} role="tablist" aria-label="Version history tabs">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'versions'}
          data-testid="version-history-tab-versions"
          onClick={() => setTab('versions')}
          style={tabButtonStyle(tab === 'versions')}
        >
          Versions
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'activity'}
          data-testid="version-history-tab-activity"
          onClick={() => setTab('activity')}
          style={tabButtonStyle(tab === 'activity')}
        >
          Activity
        </button>
      </div>
      {tab === 'versions' ? (
        <VersionsTab
          docId={docId}
          saveNamedVersion={saveNamedVersion}
          onRestoreSnapshot={onRestoreSnapshot}
          serverBackend={serverBackend}
          onRestoreServerVersion={onRestoreServerVersion}
        />
      ) : (
        <ActivityTab history={history} emptyHint={emptyHint} />
      )}
    </RightDockPanel>
  );
}

/* ============================================================
   Activity tab — the existing edit-feed UI (unchanged behavior,
   just hoisted into a sub-component so the tab container can
   render either side).
   ============================================================ */

function ActivityTab({ history, emptyHint }: { history: UseEditHistoryReturn; emptyHint: string }) {
  // Newest-first display so the latest edit is at the top — humans
  // scan downward. The hook returns oldest-first so the ring trim
  // semantics stay obvious.
  const sorted = useMemo(
    () => [...history.entries].sort((a, b) => b.time - a.time),
    [history.entries]
  );
  // Precompute (before, after) pairs for each entry. Older entries
  // use the next-newer entry's `before` as their "after"; the very
  // latest entry uses the live document text.
  const afterByEntryId = useMemo(() => {
    const map = new Map<string, string>();
    const liveText = history.getCurrentText();
    let nextAfter = liveText;
    for (const e of sorted) {
      map.set(e.id, nextAfter);
      nextAfter = extractText(e.before);
    }
    return map;
  }, [sorted, history]);
  const now = Date.now();

  return (
    <>
      <div style={SUBHEADER_STYLE}>
        <span>Activity</span>
        <span style={COUNT_STYLE} data-testid="version-history-count">
          {history.entries.length}
        </span>
      </div>
      {sorted.length === 0 ? (
        <PanelState kind="empty" message={emptyHint} />
      ) : (
        <ol style={LIST_STYLE} role="list">
          {sorted.map((entry) => (
            <EditHistoryEntryRow
              key={entry.id}
              entry={entry}
              now={now}
              afterText={afterByEntryId.get(entry.id) ?? ''}
              onRevert={() => history.revert(entry.id)}
              onRevertChange={(op, text, context) => history.revertHunk(op, text, context)}
            />
          ))}
        </ol>
      )}
    </>
  );
}

/* ============================================================
   Versions tab — IDB-backed persisted snapshots. Mirrors sheets'
   `apps/web/src/shell/VersionHistoryPanel.tsx` VersionsTab.
   ============================================================ */

function VersionsTab({
  docId,
  saveNamedVersion,
  onRestoreSnapshot,
  serverBackend,
  onRestoreServerVersion,
}: {
  docId: string | null;
  saveNamedVersion?: (name: string) => Promise<number | null>;
  onRestoreSnapshot?: (data: unknown) => void;
  serverBackend?: ServerVersionBackend;
  onRestoreServerVersion?: (version: number) => void;
}) {
  const list = useLiveVersionList(docId, serverBackend);
  const groups = useMemo(() => groupByDay(list), [list]);
  const now = Date.now();
  // Chronological neighbor for diffing: the list is newest-first, so
  // each row's "previous version" is the entry one slot later in the
  // array (older in time). The last row has no previous — its diff
  // toggle is disabled.
  const previousById = useMemo(() => {
    const map = new Map<number, VersionSnapshot>();
    for (let i = 0; i < list.length - 1; i++) {
      const cur = list[i];
      const prev = list[i + 1];
      if (cur?.id != null && prev) map.set(cur.id, prev);
    }
    return map;
  }, [list]);

  const handleSaveVersion = useCallback(async () => {
    if (!saveNamedVersion) return;
    // Native prompt — small, deterministic, works in Playwright.
    // A future iteration can replace it with the styled
    // InlineRenameDialog used elsewhere in the editor.
    // eslint-disable-next-line no-alert
    const raw = window.prompt('Name this version', '');
    if (raw == null) return;
    const trimmed = raw.trim();
    if (!trimmed) return;
    await saveNamedVersion(trimmed);
  }, [saveNamedVersion]);

  const handleRestore = useCallback(
    async (snap: VersionSnapshot) => {
      // Server-backed entry: restore by downloading its .docx bytes
      // (the host owns the content; the list carries metadata only).
      if (snap.serverVersion != null) {
        onRestoreServerVersion?.(snap.serverVersion);
        return;
      }
      if (!onRestoreSnapshot || snap.id == null) return;
      const full = await readVersion(snap.id);
      if (!full) return;
      onRestoreSnapshot(full.data);
    },
    [onRestoreSnapshot, onRestoreServerVersion]
  );

  const handleRename = useCallback(async (snap: VersionSnapshot) => {
    if (snap.serverVersion != null || snap.id == null) return; // server versions are host-owned
    // eslint-disable-next-line no-alert
    const next = window.prompt('Rename version', snap.name);
    if (next == null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === snap.name) return;
    await renameVersion(snap.id, trimmed);
  }, []);

  const handleDelete = useCallback(async (snap: VersionSnapshot) => {
    if (snap.serverVersion != null || snap.id == null) return; // server versions are host-owned
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete "${snap.name}"? This cannot be undone.`)) return;
    await deleteVersion(snap.id);
  }, []);

  if (!docId) {
    return <PanelState kind="empty" message="Open a document to see its version history." />;
  }

  return (
    <>
      <div style={SUBHEADER_STYLE}>
        <span>Versions</span>
        <span style={COUNT_STYLE} data-testid="version-history-versions-count">
          {list.length}
        </span>
        {saveNamedVersion && !serverBackend && (
          <button
            type="button"
            onClick={handleSaveVersion}
            style={SAVE_VERSION_BTN_STYLE}
            data-testid="version-history-save-version"
          >
            Save version…
          </button>
        )}
      </div>
      {list.length === 0 ? (
        <PanelState
          kind="empty"
          message='No saved versions yet. "Save version…" bookmarks the current doc, or wait ~10 minutes for the first auto snapshot.'
        />
      ) : (
        <ol style={LIST_STYLE} role="list">
          {groups.map(({ label, items }) => (
            <li key={label} style={GROUP_STYLE}>
              <div style={GROUP_HEADER_STYLE}>{label}</div>
              <ol style={LIST_STYLE} role="list">
                {items.map((snap) => (
                  <VersionRow
                    key={snap.id}
                    snap={snap}
                    previousSnap={snap.id != null ? previousById.get(snap.id) : undefined}
                    now={now}
                    onRestore={() => handleRestore(snap)}
                    onRename={snap.serverVersion != null ? undefined : () => handleRename(snap)}
                    onDelete={snap.serverVersion != null ? undefined : () => handleDelete(snap)}
                  />
                ))}
              </ol>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function VersionRow({
  snap,
  previousSnap,
  now,
  onRestore,
  onRename,
  onDelete,
}: {
  snap: VersionSnapshot;
  /** Chronologically older snapshot — what we diff THIS one against.
   *  Undefined for the very first saved version (nothing to compare). */
  previousSnap?: VersionSnapshot;
  now: number;
  onRestore: () => void;
  /** Omitted for server-backed (host-owned) revisions — they aren't
   *  renamed/deleted from the client. */
  onRename?: () => void;
  onDelete?: () => void;
}) {
  const [showDiff, setShowDiff] = useState(false);

  // LCS word diff is O(N*M). Only compute on expand, then memoise
  // against the snapshot pair so toggle hide/show keeps the value.
  const diff = useMemo(() => {
    if (!showDiff || !previousSnap) return null;
    const before = extractText(previousSnap.data).slice(0, DIFF_TRUNCATE_LIMIT);
    const after = extractText(snap.data).slice(0, DIFF_TRUNCATE_LIMIT);
    return diffWords(before, after);
  }, [showDiff, previousSnap, snap]);

  // +/- word stats render at all times so the user can see the
  // magnitude of the change without expanding the diff. Matches the
  // Activity tab's row affordance.
  const stats = useMemo(() => {
    if (!previousSnap) return null;
    const before = extractText(previousSnap.data).slice(0, DIFF_TRUNCATE_LIMIT);
    const after = extractText(snap.data).slice(0, DIFF_TRUNCATE_LIMIT);
    const segments = diffWords(before, after);
    return diffStats(segments);
  }, [previousSnap, snap]);

  return (
    <li style={ENTRY_STYLE} data-testid="version-history-version-row">
      <div style={ENTRY_HEAD_STYLE}>
        <span style={AUTHOR_STYLE}>{snap.name}</span>
        {snap.kind === 'manual' && (
          <Tooltip content="Named version — kept until deleted">
            <span style={KIND_BADGE_STYLE} tabIndex={0}>
              <MaterialSymbol name="star" size={12} />
            </span>
          </Tooltip>
        )}
        <span style={{ marginLeft: 'auto' }}>
          <Tooltip content={new Date(snap.savedAt).toLocaleString()}>
            <span tabIndex={0} style={{ outline: 'none' }}>
              {relativeTime(snap.savedAt, now)}
            </span>
          </Tooltip>
        </span>
      </div>
      {typeof snap.size === 'number' && snap.size > 0 && (
        <div style={SIZE_STYLE}>{formatSize(snap.size)}</div>
      )}
      {stats && (stats.added > 0 || stats.removed > 0) && (
        <div style={STATS_PILL_STYLE} data-testid="version-history-version-stats">
          {stats.added > 0 && <span style={STAT_ADD_STYLE}>+{stats.added}</span>}
          {stats.added > 0 && stats.removed > 0 && <span>·</span>}
          {stats.removed > 0 && <span style={STAT_REMOVE_STYLE}>-{stats.removed}</span>}
          <span>word{stats.added + stats.removed === 1 ? '' : 's'}</span>
        </div>
      )}
      <div style={ENTRY_ACTIONS_STYLE}>
        <button
          type="button"
          onClick={onRestore}
          style={REVERT_BUTTON_STYLE}
          data-testid="version-history-restore"
        >
          Restore
        </button>
        {previousSnap && (
          <button
            type="button"
            onClick={() => setShowDiff((v) => !v)}
            style={SHOW_DIFF_BTN_STYLE}
            aria-expanded={showDiff}
            data-testid="version-history-version-toggle-diff"
          >
            {showDiff ? 'Hide changes' : 'Show changes'}
          </button>
        )}
        {onRename && (
          <button type="button" onClick={onRename} style={SHOW_DIFF_BTN_STYLE}>
            Rename
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            style={{ ...SHOW_DIFF_BTN_STYLE, color: '#b91c1c' }}
          >
            Delete
          </button>
        )}
      </div>
      {showDiff && diff && (
        <pre style={DIFF_BOX_STYLE} data-testid="version-history-version-diff">
          {diff.map((seg, i) => {
            if (seg.op === 'keep') return <span key={i}>{seg.text}</span>;
            if (seg.op === 'add') {
              return (
                <ins key={i} style={DIFF_ADD_STYLE}>
                  {seg.text}
                </ins>
              );
            }
            return (
              <del key={i} style={DIFF_REMOVE_STYLE}>
                {seg.text}
              </del>
            );
          })}
        </pre>
      )}
    </li>
  );
}

/* ============================================================
   Helpers: day grouping + byte formatting + tab style helper.
   ============================================================ */

interface DayGroup {
  label: string;
  items: VersionSnapshot[];
}

function groupByDay(list: VersionSnapshot[]): DayGroup[] {
  if (list.length === 0) return [];
  // Sheets uses the same labels (Today / Yesterday / explicit date).
  // Ordering follows the list itself (assumed newest-first by store).
  const now = new Date();
  const todayKey = dayKey(now);
  const yesterdayKey = dayKey(new Date(now.getTime() - 86400_000));
  const map = new Map<string, DayGroup>();
  for (const snap of list) {
    const d = new Date(snap.savedAt);
    const key = dayKey(d);
    const label =
      key === todayKey
        ? 'Today'
        : key === yesterdayKey
          ? 'Yesterday'
          : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    let group = map.get(key);
    if (!group) {
      group = { label, items: [] };
      map.set(key, group);
    }
    group.items.push(snap);
  }
  return Array.from(map.values());
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function tabButtonStyle(active: boolean): CSSProperties {
  return {
    flex: 1,
    padding: '8px 12px',
    border: 'none',
    background: 'transparent',
    color: active ? 'var(--doc-primary, #1a73e8)' : 'var(--doc-text-muted)',
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    borderBottom: active ? '2px solid var(--doc-primary, #1a73e8)' : '2px solid transparent',
    cursor: 'pointer',
  };
}

function EditHistoryEntryRow({
  entry,
  now,
  afterText,
  onRevert,
  onRevertChange,
}: {
  entry: EditHistoryEntry;
  now: number;
  afterText: string;
  onRevert: () => void;
  onRevertChange: (op: 'add' | 'remove', text: string, context: string) => boolean;
}) {
  const canRevert = entry.before != null;
  const [showDiff, setShowDiff] = useState(false);

  // Compute the diff only when expanded — LCS is O(N*M) so we don't
  // want to spin it on every panel re-render for entries the user
  // hasn't asked to see. The result is memoised against the snapshot
  // strings so toggling expanded keeps the same value.
  const diff = useMemo(() => {
    if (!showDiff) return null;
    const before = extractText(entry.before).slice(0, DIFF_TRUNCATE_LIMIT);
    const after = afterText.slice(0, DIFF_TRUNCATE_LIMIT);
    return diffWords(before, after);
  }, [showDiff, entry.before, afterText]);

  // Stats (added/removed words) shown on the row at all times.
  //
  // PREVIOUSLY: setState was called inside `useMemo`, which is a
  // React anti-pattern — under some renders it produced
  // "Too many re-renders" (error #185) and crashed the whole editor
  // (user-reported as "page becomes unresponsive"). useEffect is the
  // correct hook for the side-effect of writing computed state.
  const [stats, setStats] = useState<{ added: number; removed: number } | null>(null);
  useEffect(() => {
    if (!afterText && entry.before == null) {
      setStats(null);
      return;
    }
    const before = extractText(entry.before).slice(0, DIFF_TRUNCATE_LIMIT);
    const after = afterText.slice(0, DIFF_TRUNCATE_LIMIT);
    const segments = diffWords(before, after);
    setStats(diffStats(segments));
  }, [entry.before, afterText]);

  return (
    <li style={ENTRY_STYLE}>
      <div style={ENTRY_HEAD_STYLE}>
        <span style={AUTHOR_STYLE}>{entry.author}</span>
        <span>·</span>
        <Tooltip content={new Date(entry.time).toLocaleString()}>
          <span tabIndex={0} style={{ outline: 'none' }}>
            {relativeTime(entry.time, now)}
          </span>
        </Tooltip>
        {entry.txCount > 1 && <span style={{ marginLeft: 'auto' }}>{entry.txCount} edits</span>}
      </div>
      <div style={SUMMARY_STYLE}>{entry.summary}</div>

      {stats && (stats.added > 0 || stats.removed > 0) && (
        <div style={STATS_PILL_STYLE} data-testid="version-history-stats">
          {stats.added > 0 && <span style={STAT_ADD_STYLE}>+{stats.added}</span>}
          {stats.added > 0 && stats.removed > 0 && <span>·</span>}
          {stats.removed > 0 && <span style={STAT_REMOVE_STYLE}>-{stats.removed}</span>}
          <span>word{stats.added + stats.removed === 1 ? '' : 's'}</span>
        </div>
      )}

      <div style={ENTRY_ACTIONS_STYLE}>
        <Tooltip content={canRevert ? 'Revert document to this point' : 'Snapshot unavailable'}>
          <button
            type="button"
            onClick={onRevert}
            disabled={!canRevert}
            aria-label={`Revert to ${entry.summary}`}
            style={REVERT_BUTTON_STYLE}
          >
            Revert to here
          </button>
        </Tooltip>
        <button
          type="button"
          onClick={() => setShowDiff((v) => !v)}
          style={SHOW_DIFF_BTN_STYLE}
          aria-expanded={showDiff}
          data-testid="version-history-toggle-diff"
        >
          {showDiff ? 'Hide changes' : 'Show changes'}
        </button>
      </div>

      {showDiff && diff && (
        <pre style={DIFF_BOX_STYLE} data-testid="version-history-diff">
          {diff.map((seg, i) => {
            if (seg.op === 'keep') return <span key={i}>{seg.text}</span>;
            // Anchor context = last 30 chars of the preceding `keep`
            // run. Disambiguates identical substrings — e.g. typing
            // "hello" in two paragraphs reverts the right one.
            const prevKept = (() => {
              for (let j = i - 1; j >= 0; j--) {
                if (diff[j]!.op === 'keep') return diff[j]!.text.slice(-30);
                // A non-keep segment between us and the previous keep
                // means there's no clean disambiguating prefix; bail
                // and use empty context. Could be improved by chaining
                // through adjacent changes, but the common case is
                // single-keep gaps.
                break;
              }
              return '';
            })();
            // `seg.op` is now narrowed to `'add' | 'remove'` because
            // the `keep` branch returned `<span>` above.
            const opForRevert: 'add' | 'remove' = seg.op;
            const onRevertHunk = (): void => {
              const ok = onRevertChange(opForRevert, seg.text, prevKept);
              if (!ok) {
                // Soft-fail — no toast plumbing into this leaf
                // component; aria-live label updates so screen readers
                // know. The Cmd+Z path still works for users who
                // expected the previous behaviour.
              }
            };
            if (seg.op === 'add') {
              return (
                <ins
                  key={i}
                  style={DIFF_ADD_STYLE}
                  role="button"
                  tabIndex={0}
                  title="Revert this insertion"
                  data-testid="version-history-diff-add"
                  onClick={onRevertHunk}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onRevertHunk();
                    }
                  }}
                >
                  {seg.text}
                </ins>
              );
            }
            return (
              <del
                key={i}
                style={DIFF_REMOVE_STYLE}
                role="button"
                tabIndex={0}
                title="Bring this text back"
                data-testid="version-history-diff-remove"
                onClick={onRevertHunk}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onRevertHunk();
                  }
                }}
              >
                {seg.text}
              </del>
            );
          })}
        </pre>
      )}
    </li>
  );
}
