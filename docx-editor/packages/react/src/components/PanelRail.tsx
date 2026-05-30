/**
 * Right-edge vertical rail of panel-toggle buttons. Mirrors the
 * sibling Casual Sheets PanelRail and the activity-bar conventions
 * VSCode / Office / Google Docs share — keeping panel toggles in one
 * always-visible spot makes them easier to find and removes the
 * duplication doc had between the toolbar's panel buttons and the
 * View menu items.
 *
 * v0 ships three toggles — Outline, Comments, History — that map to
 * the three persistent side panels already in the editor. Each button
 * shows its panel's pressed state with a left-edge accent marker.
 * The rail itself never collapses; even with every panel closed the
 * icons stay accessible.
 *
 * Sheet parity reference:
 *   services/sheet/apps/web/src/shell/PanelRail.tsx
 *   services/sheet/apps/web/src/styles.css  (.panel-rail*)
 */

import type { CSSProperties } from 'react';
import { MaterialSymbol } from './ui/Icons';
import { Tooltip } from './ui/Tooltip';
import { formatShortcut } from '../lib/platform';
import { useTranslation } from '../i18n';

export interface PanelRailProps {
  /** Whether the outline panel is open. Drives the active state. */
  outlineVisible?: boolean;
  /** Whether the comments sidebar is open. */
  commentsVisible?: boolean;
  /** Whether the version-history panel is open. */
  historyVisible?: boolean;
  /** Toggle the outline panel. */
  onToggleOutline?: () => void;
  /** Toggle the comments sidebar. */
  onToggleComments?: () => void;
  /** Toggle the version-history panel. */
  onToggleHistory?: () => void;
}

const railStyle: CSSProperties = {
  flex: '0 0 36px',
  width: 36,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: 2,
  padding: '6px 2px',
  background: 'var(--doc-surface-alt, var(--doc-surface, #fafafa))',
  borderTop: '1px solid var(--doc-border, #e0e0e0)',
  borderLeft: '1px solid var(--doc-border, #e0e0e0)',
};

const btnStyle = (active: boolean): CSSProperties => ({
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 32,
  width: 32,
  margin: '0 auto',
  border: 0,
  borderRadius: 4,
  background: active ? 'var(--doc-primary-light, #e8f0fe)' : 'transparent',
  color: active ? 'var(--doc-primary, #1a73e8)' : 'var(--doc-text-on-surface-muted, #5f6368)',
  cursor: 'pointer',
  transition: 'background var(--doc-anim-fast, 100ms) ease, color var(--doc-anim-fast, 100ms) ease',
});

const markerStyle: CSSProperties = {
  content: '""',
  position: 'absolute',
  left: -2,
  top: 6,
  bottom: 6,
  width: 2,
  background: 'var(--doc-primary, #1a73e8)',
  borderRadius: '0 2px 2px 0',
};

function RailButton({
  testId,
  label,
  icon,
  active,
  onClick,
}: {
  testId: string;
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip content={label} side="left">
      <button
        type="button"
        className="ep-focus-ring"
        style={btnStyle(active)}
        onClick={onClick}
        onMouseDown={(e) => e.preventDefault()}
        aria-pressed={active}
        aria-label={label}
        data-testid={testId}
      >
        {active && <span aria-hidden="true" style={markerStyle} />}
        <MaterialSymbol name={icon} size={18} />
      </button>
    </Tooltip>
  );
}

export function PanelRail({
  outlineVisible,
  commentsVisible,
  historyVisible,
  onToggleOutline,
  onToggleComments,
  onToggleHistory,
}: PanelRailProps) {
  const { t } = useTranslation();
  // No-op if nothing to toggle (host wired no panels) — render nothing
  // rather than an empty bar.
  if (!onToggleOutline && !onToggleComments && !onToggleHistory) return null;

  const outlineShortcut = formatShortcut('Ctrl+Shift+H');

  return (
    <aside style={railStyle} aria-label="Panels" data-testid="panel-rail">
      {onToggleOutline && (
        <RailButton
          testId="rail-outline"
          label={`${t('editor.showDocumentOutline')} (${outlineShortcut})`}
          icon="format_list_bulleted"
          active={!!outlineVisible}
          onClick={onToggleOutline}
        />
      )}
      {onToggleComments && (
        <RailButton
          testId="rail-comments"
          label={commentsVisible ? 'Hide comments' : 'Comments'}
          icon="comment"
          active={!!commentsVisible}
          onClick={onToggleComments}
        />
      )}
      {onToggleHistory && (
        <RailButton
          testId="rail-history"
          label={historyVisible ? 'Hide version history' : 'Version history'}
          icon="history"
          active={!!historyVisible}
          onClick={onToggleHistory}
        />
      )}
    </aside>
  );
}

export default PanelRail;
