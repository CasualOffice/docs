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
  /** Whether the Format/Properties panel is open. */
  propertiesVisible?: boolean;
  /** Toggle the Format/Properties panel. */
  onToggleProperties?: () => void;
  /** Whether the Writing Assistant sheet is open. */
  writerVisible?: boolean;
  /** Toggle the Writing Assistant sheet. */
  onToggleWriter?: () => void;
  /** Whether the chat panel is open. */
  chatVisible?: boolean;
  /** Toggle the chat panel. */
  onToggleChat?: () => void;
}

// Floating rounded card pinned to the top-right of the canvas area (not
// edge-docked). Positioned absolutely within the editor's below-toolbar row
// (which is position:relative), so it overlays the grey desk margin without
// taking flex space or scrolling with the document.
const railStyle: CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  zIndex: 30,
  width: 40,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: 4,
  padding: 4,
  background: 'var(--doc-surface)',
  border: '1px solid var(--doc-border-light)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-2)',
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
  transition: 'background var(--doc-anim-fast), color var(--doc-anim-fast)',
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
  propertiesVisible,
  onToggleProperties,
  writerVisible,
  onToggleWriter,
  chatVisible,
  onToggleChat,
}: PanelRailProps) {
  const { t } = useTranslation();
  // No-op if nothing to toggle (host wired no panels) — render nothing
  // rather than an empty bar.
  if (
    !onToggleOutline &&
    !onToggleComments &&
    !onToggleHistory &&
    !onToggleProperties &&
    !onToggleWriter &&
    !onToggleChat
  )
    return null;

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
      {onToggleProperties && (
        <RailButton
          testId="rail-properties"
          label={propertiesVisible ? 'Hide format panel' : 'Format'}
          icon="tune"
          active={!!propertiesVisible}
          onClick={onToggleProperties}
        />
      )}
      {onToggleWriter && (
        <RailButton
          testId="rail-writer"
          label={writerVisible ? 'Hide Writing Assistant' : 'Writing Assistant'}
          icon="auto_awesome"
          active={!!writerVisible}
          onClick={onToggleWriter}
        />
      )}
      {onToggleChat && (
        <RailButton
          testId="rail-chat"
          label={chatVisible ? 'Hide chat' : 'Ask AI'}
          icon="chat_bubble_outline"
          active={!!chatVisible}
          onClick={onToggleChat}
        />
      )}
    </aside>
  );
}

export default PanelRail;
