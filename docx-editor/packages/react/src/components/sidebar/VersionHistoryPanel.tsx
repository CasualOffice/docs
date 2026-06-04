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
import { useMemo, useState, type CSSProperties } from 'react';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import { PanelState } from '../ui/PanelState';
import { Tooltip } from '../ui/Tooltip';
import type { EditHistoryEntry, UseEditHistoryReturn } from '../../hooks/useEditHistory';
import { diffStats, diffWords, extractText } from '../../hooks/wordDiff';

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
  fontFamily:
    'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
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
  // Precompute (before, after) pairs for each entry. Older entries
  // use the next-newer entry's `before` as their "after"; the very
  // latest entry uses the live document text.
  const afterByEntryId = useMemo(() => {
    const map = new Map<string, string>();
    const liveText = history.getCurrentText();
    // Iterate sorted (newest-first). The newest entry's "after" is
    // the live doc; every subsequent entry's "after" is the entry
    // immediately above it in chronological time (i.e. the PREVIOUS
    // item in `sorted`).
    let nextAfter = liveText;
    for (const e of sorted) {
      map.set(e.id, nextAfter);
      nextAfter = extractText(e.before);
    }
    return map;
  }, [sorted, history]);
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
  afterText,
  onRevert,
}: {
  entry: EditHistoryEntry;
  now: number;
  afterText: string;
  onRevert: () => void;
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

  // Stats (added/removed words) shown on the row at all times — they
  // come from the same diff, but we compute them lazily too because
  // the panel can hold up to 500 entries.
  const [stats, setStats] = useState<{ added: number; removed: number } | null>(null);
  useMemo(() => {
    if (stats != null || !afterText && entry.before == null) return;
    // Defer the stats computation to a microtask so the row paints
    // first and the stats appear after.
    const before = extractText(entry.before).slice(0, DIFF_TRUNCATE_LIMIT);
    const after = afterText.slice(0, DIFF_TRUNCATE_LIMIT);
    const segments = diffWords(before, after);
    setStats(diffStats(segments));
    return;
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            if (seg.op === 'add')
              return (
                <ins key={i} style={DIFF_ADD_STYLE}>
                  {seg.text}
                </ins>
              );
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
