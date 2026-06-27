/**
 * Version-history side panel — a single Google-Docs-style timeline of
 * persisted snapshots (`useVersionHistoryCapture` → IndexedDB store).
 * Versions are captured automatically (on save + on an idle interval);
 * "Save version…" only NAMES the current one. There is no separate
 * "recent edits" feed — the timeline is the one history view.
 *
 * Layout: newest-first, grouped by day, with a pinned "Current version"
 * row. Each row shows a label ("Auto-saved", or the user's name for a
 * named version), the author who captured it, size, relative time, and a
 * kebab (preview / rename / restore / delete). Selecting a row opens the
 * in-canvas preview with an optional changes-vs-previous diff.
 */
import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import { confirmModal, promptModal } from '../../utils/modals';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import { PanelState } from '../ui/PanelState';
import { Tooltip } from '../ui/Tooltip';
import { RightDockPanel } from '../RightDockPanel';
import { useFixedDropdown } from '../ui/useFixedDropdown';
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
  /** Active document id — drives the per-doc version timeline. When null,
   *  the panel shows an "open a document" state. */
  docId?: string | null;
  /** Imperative API exposed by `useVersionHistoryCapture`. The "Save
   *  version…" button calls this; if absent, the button is hidden. */
  saveNamedVersion?: (name: string) => Promise<number | null>;
  /** Callback the panel invokes to restore a snapshot's `data` into
   *  the live editor. The host (DocxEditor) implements this against
   *  its EditorView — keeps the panel UI-only. */
  onRestoreSnapshot?: (data: unknown) => void;
  /** Open the in-canvas preview for a version. The host renders a
   *  read-only view of `data` with the changes-vs-`previousData` diff
   *  overlaid (Google-Docs model). Local snapshots carry their `data`
   *  in the list, so the panel passes it straight through. */
  onPreviewVersion?: (req: {
    name: string;
    savedAt: number;
    author?: string;
    data: unknown;
    previousData: unknown | null;
  }) => void;
  /** Return from a version preview to the live document (the pinned
   *  "Current version" row). No-op when nothing is being previewed. */
  onShowCurrent?: () => void;
  /** True while a past version is being previewed — drives the active
   *  highlight on the "Current version" row. */
  isPreviewing?: boolean;
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
  /** Optional extra style applied to the panel root. */
  style?: CSSProperties;
}

// Width / outer chrome / header come from RightDockPanel — the old
// ROOT_STYLE and HEADER_STYLE were removed in Phase 3 (panel chrome
// unification).

const TAB_CAPTION_STYLE: CSSProperties = {
  padding: '8px 16px 0',
  fontSize: 11.5,
  lineHeight: 1.4,
  color: 'var(--doc-text-muted)',
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

const NAMED_FILTER_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '0 16px 8px',
  fontSize: 12,
  color: 'var(--doc-text-muted)',
  cursor: 'pointer',
};

const KEBAB_BTN_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  border: 'none',
  borderRadius: 4,
  background: 'transparent',
  color: 'var(--doc-text-muted)',
  cursor: 'pointer',
};

const KEBAB_MENU_STYLE: CSSProperties = {
  minWidth: 168,
  padding: '4px 0',
  background: 'var(--doc-surface, #fff)',
  border: '1px solid var(--doc-border, #e0e0e0)',
  borderRadius: 8,
  boxShadow: 'var(--doc-shadow-lg, 0 4px 16px rgba(0,0,0,0.16))',
};

const KEBAB_ITEM_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  padding: '8px 14px',
  border: 'none',
  background: 'transparent',
  color: 'var(--doc-text)',
  fontSize: 13,
  textAlign: 'left',
  cursor: 'pointer',
};

const CURRENT_ROW_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  padding: '12px 16px',
  border: 'none',
  borderBottom: '1px solid var(--doc-border-light, #f0eee9)',
  background: 'transparent',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--doc-text)',
  cursor: 'pointer',
  textAlign: 'left',
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
  docId = null,
  saveNamedVersion,
  onRestoreSnapshot,
  onPreviewVersion,
  onShowCurrent,
  isPreviewing = false,
  onClose,
  title = 'Version history',
  serverBackend,
  onRestoreServerVersion,
}: VersionHistoryPanelProps) {
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
      {/* Single Google-Docs-style timeline. Versions are captured
          automatically — there's no manual "create version" step; the
          optional "Save version…" action only NAMES the current one. */}
      <div style={TAB_CAPTION_STYLE} data-testid="version-history-caption">
        Versions save automatically as you edit — on save and about every 10 minutes. Open one to
        preview or restore it.
      </div>
      <VersionsTab
        docId={docId}
        saveNamedVersion={saveNamedVersion}
        onRestoreSnapshot={onRestoreSnapshot}
        onPreviewVersion={onPreviewVersion}
        onShowCurrent={onShowCurrent}
        isPreviewing={isPreviewing}
        serverBackend={serverBackend}
        onRestoreServerVersion={onRestoreServerVersion}
      />
    </RightDockPanel>
  );
}

/* ============================================================
   Versions timeline — IDB-backed persisted snapshots (auto-saved +
   named). Mirrors sheets' `apps/web/src/shell/VersionHistoryPanel.tsx`.
   ============================================================ */

function VersionsTab({
  docId,
  saveNamedVersion,
  onRestoreSnapshot,
  onPreviewVersion,
  onShowCurrent,
  isPreviewing = false,
  serverBackend,
  onRestoreServerVersion,
}: {
  docId: string | null;
  saveNamedVersion?: (name: string) => Promise<number | null>;
  onRestoreSnapshot?: (data: unknown) => void;
  onPreviewVersion?: (req: {
    name: string;
    savedAt: number;
    author?: string;
    data: unknown;
    previousData: unknown | null;
  }) => void;
  onShowCurrent?: () => void;
  isPreviewing?: boolean;
  serverBackend?: ServerVersionBackend;
  onRestoreServerVersion?: (version: number) => void;
}) {
  const list = useLiveVersionList(docId, serverBackend);
  // "Only named versions" filter (Google-Docs pattern) — narrows the
  // list to manual milestones. Diffs still compare against the true
  // previous version from the FULL list, so a named version previews
  // against whatever immediately preceded it (auto or named).
  const [namedOnly, setNamedOnly] = useState(false);
  const visible = useMemo(
    () => (namedOnly ? list.filter((s) => s.kind === 'manual') : list),
    [list, namedOnly]
  );
  const groups = useMemo(() => groupByDay(visible), [visible]);
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
    const raw = await promptModal({ title: 'Name this version', confirmLabel: 'Save' });
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
    const next = await promptModal({
      title: 'Rename version',
      defaultValue: snap.name,
      confirmLabel: 'Rename',
    });
    if (next == null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === snap.name) return;
    await renameVersion(snap.id, trimmed);
  }, []);

  const handleDelete = useCallback(async (snap: VersionSnapshot) => {
    if (snap.serverVersion != null || snap.id == null) return; // server versions are host-owned
    // eslint-disable-next-line no-alert
    const ok = await confirmModal({
      title: 'Delete version',
      body: `Delete "${snap.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await deleteVersion(snap.id);
  }, []);

  // Open the in-canvas preview. Local snapshots carry their `data`; the
  // previous (older) snapshot is the diff baseline. Server-backed
  // revisions hold no inline data, so they have no preview (Restore
  // downloads them instead).
  const handlePreview = useCallback(
    (snap: VersionSnapshot, previousSnap?: VersionSnapshot) => {
      if (!onPreviewVersion || snap.serverVersion != null || snap.data == null) return;
      onPreviewVersion({
        name: snap.name,
        savedAt: snap.savedAt,
        data: snap.data,
        previousData: previousSnap?.data ?? null,
      });
    },
    [onPreviewVersion]
  );

  if (!docId) {
    return <PanelState kind="empty" message="Open a document to see its version history." />;
  }

  return (
    <>
      <div style={SUBHEADER_STYLE}>
        <span>Versions</span>
        <span style={COUNT_STYLE} data-testid="version-history-versions-count">
          {visible.length}
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
      {/* "Only named versions" filter — matches Google Docs. Hidden until
          there is at least one auto snapshot to filter out. */}
      {list.some((s) => s.kind !== 'manual') && (
        <label style={NAMED_FILTER_STYLE}>
          <input
            type="checkbox"
            checked={namedOnly}
            onChange={(e) => setNamedOnly(e.target.checked)}
            data-testid="version-history-named-only"
          />
          Only named versions
        </label>
      )}
      {list.length === 0 ? (
        <PanelState
          kind="empty"
          message='No saved versions yet. "Save version…" bookmarks the current doc, or wait ~10 minutes for the first auto snapshot.'
        />
      ) : (
        <ol style={LIST_STYLE} role="list">
          {/* Pinned "Current version" — the live document. Clicking it
              exits any preview. Active (highlighted) when not previewing. */}
          {onShowCurrent && (
            <li style={GROUP_STYLE}>
              <CurrentVersionRow active={!isPreviewing} onClick={onShowCurrent} />
            </li>
          )}
          {namedOnly && visible.length === 0 && (
            <li style={{ ...ENTRY_STYLE, color: 'var(--doc-text-muted)', fontSize: 12 }}>
              No named versions yet. Use “Save version…” to bookmark one.
            </li>
          )}
          {groups.map(({ label, items }) => (
            <li key={label} style={GROUP_STYLE}>
              <div style={GROUP_HEADER_STYLE}>{label}</div>
              <ol style={LIST_STYLE} role="list">
                {items.map((snap) => {
                  const previousSnap = snap.id != null ? previousById.get(snap.id) : undefined;
                  const canPreview =
                    !!onPreviewVersion && snap.serverVersion == null && snap.data != null;
                  return (
                    <VersionRow
                      key={snap.id}
                      snap={snap}
                      previousSnap={previousSnap}
                      now={now}
                      onRestore={() => handleRestore(snap)}
                      onPreview={canPreview ? () => handlePreview(snap, previousSnap) : undefined}
                      onRename={snap.serverVersion != null ? undefined : () => handleRename(snap)}
                      onDelete={snap.serverVersion != null ? undefined : () => handleDelete(snap)}
                    />
                  );
                })}
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
  onPreview,
  onRename,
  onDelete,
}: {
  snap: VersionSnapshot;
  /** Chronologically older snapshot — what we diff THIS one against.
   *  Undefined for the very first saved version (nothing to compare). */
  previousSnap?: VersionSnapshot;
  now: number;
  onRestore: () => void;
  /** Open the in-canvas preview (Google-Docs model). Undefined for
   *  server-backed revisions, which carry no inline data to render. */
  onPreview?: () => void;
  /** Omitted for server-backed (host-owned) revisions — they aren't
   *  renamed/deleted from the client. */
  onRename?: () => void;
  onDelete?: () => void;
}) {
  // +/- word stats render at all times so the user can see the
  // magnitude of the change at a glance. Cheap LCS over the two
  // snapshots' plain text — memoised against the snapshot pair.
  const stats = useMemo(() => {
    if (!previousSnap) return null;
    const before = extractText(previousSnap.data).slice(0, DIFF_TRUNCATE_LIMIT);
    const after = extractText(snap.data).slice(0, DIFF_TRUNCATE_LIMIT);
    return diffStats(diffWords(before, after));
  }, [previousSnap, snap]);

  // The whole row is a click target that opens the full-canvas preview
  // (with the changes-since-previous overlaid) — the Google-Docs
  // interaction. Falls back to a plain <li> for server revisions.
  const interactive = !!onPreview;
  const [hover, setHover] = useState(false);

  // Per-row actions are consolidated into a kebab (⋮) menu so the row
  // stays clean and scannable (Google-Docs pattern). Restore is always
  // present; Rename / Delete only for client-owned local snapshots.
  const menuItems: KebabItem[] = [
    { icon: 'history', label: 'Restore this version', onClick: onRestore },
    ...(onRename ? [{ icon: 'edit_note', label: 'Rename', onClick: onRename }] : []),
    ...(onDelete ? [{ icon: 'delete', label: 'Delete', onClick: onDelete, danger: true }] : []),
  ];

  return (
    <li
      style={{
        ...ENTRY_STYLE,
        cursor: interactive ? 'pointer' : 'default',
        background: hover && interactive ? 'var(--doc-surface-hover, #f5f7fa)' : 'transparent',
      }}
      data-testid="version-history-version-row"
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={interactive ? onPreview : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onPreview?.();
              }
            }
          : undefined
      }
    >
      <div style={ENTRY_HEAD_STYLE}>
        {/* Auto snapshots show a clean "Auto-saved" label (the time sits on
            the right); only named versions surface their user-given name. */}
        <span style={AUTHOR_STYLE}>{snap.kind === 'manual' ? snap.name : 'Auto-saved'}</span>
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
        {/* Kebab stops propagation so opening the menu doesn't also fire
            the row's preview click. */}
        <span
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          role="presentation"
        >
          <RowKebabMenu items={menuItems} />
        </span>
      </div>
      {(snap.author || (typeof snap.size === 'number' && snap.size > 0)) && (
        <div style={SIZE_STYLE}>
          {snap.author && <span data-testid="version-history-author">{snap.author}</span>}
          {snap.author && typeof snap.size === 'number' && snap.size > 0 && ' · '}
          {typeof snap.size === 'number' && snap.size > 0 && formatSize(snap.size)}
        </div>
      )}
      {stats && (stats.added > 0 || stats.removed > 0) && (
        <div style={STATS_PILL_STYLE} data-testid="version-history-version-stats">
          {stats.added > 0 && <span style={STAT_ADD_STYLE}>+{stats.added}</span>}
          {stats.added > 0 && stats.removed > 0 && <span>·</span>}
          {stats.removed > 0 && <span style={STAT_REMOVE_STYLE}>-{stats.removed}</span>}
          <span>word{stats.added + stats.removed === 1 ? '' : 's'}</span>
        </div>
      )}
    </li>
  );
}

/* ============================================================
   Current-version row + per-row kebab menu.
   ============================================================ */

function CurrentVersionRow({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="version-history-current-row"
      aria-current={active ? 'true' : 'false'}
      style={{
        ...CURRENT_ROW_STYLE,
        background: active ? 'var(--doc-primary-subtle, #e8f0fe)' : 'transparent',
        color: active ? 'var(--doc-primary, #1a73e8)' : 'var(--doc-text)',
      }}
    >
      <span>Current version</span>
      {active && <MaterialSymbol name="check" size={16} style={{ marginLeft: 'auto' }} />}
    </button>
  );
}

interface KebabItem {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
}

function RowKebabMenu({ items }: { items: KebabItem[] }) {
  const [open, setOpen] = useState(false);
  const { containerRef, dropdownRef, dropdownStyle, handleMouseDown } = useFixedDropdown({
    isOpen: open,
    onClose: () => setOpen(false),
    align: 'right',
  });

  return (
    <span ref={containerRef} style={{ display: 'inline-flex' }}>
      <Tooltip content="More actions">
        <button
          type="button"
          onMouseDown={handleMouseDown}
          onClick={() => setOpen((v) => !v)}
          style={KEBAB_BTN_STYLE}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Version actions"
          data-testid="version-history-row-menu"
        >
          <MaterialSymbol name="more_vert" size={18} />
        </button>
      </Tooltip>
      {open && (
        <div ref={dropdownRef} style={{ ...dropdownStyle, ...KEBAB_MENU_STYLE }} role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              style={{
                ...KEBAB_ITEM_STYLE,
                color: item.danger ? '#b91c1c' : 'var(--doc-text)',
              }}
            >
              <MaterialSymbol name={item.icon} size={16} />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </span>
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
