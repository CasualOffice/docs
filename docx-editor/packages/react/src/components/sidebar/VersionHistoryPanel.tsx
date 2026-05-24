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
import { useMemo, type CSSProperties } from 'react';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import type { EditHistoryEntry, UseEditHistoryReturn } from '../../hooks/useEditHistory';

export interface VersionHistoryPanelProps {
  history: UseEditHistoryReturn;
  /** Display title for the panel. Default "Version history". */
  title?: string;
  /** Empty-state message when no entries exist yet. */
  emptyHint?: string;
  /** Optional extra style applied to the panel root. */
  style?: CSSProperties;
}

const ROOT_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  width: 300,
  height: '100%',
  background: 'var(--doc-surface, #ffffff)',
  borderLeft: '1px solid var(--doc-border, #e0e0e0)',
  fontSize: 13,
  color: 'var(--doc-text-on-surface, #1f2937)',
};

const HEADER_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '14px 16px',
  borderBottom: '1px solid var(--doc-border, #e0e0e0)',
  fontWeight: 600,
  fontSize: 14,
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

const EMPTY_STYLE: CSSProperties = {
  padding: '24px 18px',
  color: 'var(--doc-text-muted)',
  fontSize: 13,
  lineHeight: 1.5,
};

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
  title = 'Version history',
  emptyHint = 'No edits yet. Type into the document to start recording.',
  style,
}: VersionHistoryPanelProps) {
  // Newest-first display so the latest edit is at the top — humans
  // scan downward. The hook returns oldest-first so the ring trim
  // semantics stay obvious.
  const sorted = useMemo(
    () => [...history.entries].sort((a, b) => b.time - a.time),
    [history.entries]
  );
  const now = Date.now();

  return (
    <aside
      data-testid="version-history-panel"
      aria-label={title}
      style={{ ...ROOT_STYLE, ...style }}
    >
      <header style={HEADER_STYLE}>
        <MaterialSymbol name="history" size={18} />
        <span>{title}</span>
        <span style={COUNT_STYLE} data-testid="version-history-count">
          {history.entries.length}
        </span>
      </header>
      {sorted.length === 0 ? (
        <div style={EMPTY_STYLE}>{emptyHint}</div>
      ) : (
        <ol style={LIST_STYLE} role="list">
          {sorted.map((entry) => (
            <EditHistoryEntryRow
              key={entry.id}
              entry={entry}
              now={now}
              onRevert={() => history.revert(entry.id)}
            />
          ))}
        </ol>
      )}
    </aside>
  );
}

function EditHistoryEntryRow({
  entry,
  now,
  onRevert,
}: {
  entry: EditHistoryEntry;
  now: number;
  onRevert: () => void;
}) {
  const canRevert = entry.before != null;
  return (
    <li style={ENTRY_STYLE}>
      <div style={ENTRY_HEAD_STYLE}>
        <span style={AUTHOR_STYLE}>{entry.author}</span>
        <span>·</span>
        <span title={new Date(entry.time).toLocaleString()}>{relativeTime(entry.time, now)}</span>
        {entry.txCount > 1 && <span style={{ marginLeft: 'auto' }}>{entry.txCount} edits</span>}
      </div>
      <div style={SUMMARY_STYLE}>{entry.summary}</div>
      <button
        type="button"
        onClick={onRevert}
        disabled={!canRevert}
        title={canRevert ? 'Revert document to this point' : 'Snapshot unavailable'}
        aria-label={`Revert to ${entry.summary}`}
        style={REVERT_BUTTON_STYLE}
      >
        Revert to here
      </button>
    </li>
  );
}
