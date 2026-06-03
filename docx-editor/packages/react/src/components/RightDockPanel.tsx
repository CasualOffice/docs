/**
 * RightDockPanel — shared shell for every right-edge dockable panel.
 *
 * Background: before this shell, every right panel rolled its own
 * geometry. Chat was `position: fixed; top: 0; bottom: 0` (covered the
 * toolbar AND the status bar AND the rail). AISuggestionPanel was the
 * same shape but 360px wide instead of 380px. Version history was
 * 300px and sat inside the editor flex row, properly bounded by
 * toolbar + status bar. Outline was on the LEFT at yet another width.
 * Result: visually incoherent, and clicking Chat would obscure the
 * rail it lives next to.
 *
 * This component renders an in-flow flex column at the canonical
 * `RIGHT_PANEL_WIDTH` (340) so the parent flex row (which already
 * holds version history + the rail) lays it out correctly between
 * toolbar bottom and status bar top. Header + body styling matches
 * VersionHistoryPanel so every right panel looks like a member of the
 * same family.
 *
 * Layout sketch:
 *
 *   ┌────────────────── below-toolbar flex row ───────────────────┐
 *   │ ┌──── scroll container (doc, flex:1) ────┐ ┌── panel ── rail│
 *   │ │                                        │ │  340px      36 │
 *   │ │  page                                  │ │             px │
 *   │ │                                        │ │                │
 *   │ └────────────────────────────────────────┘ └────────────────┘
 *   └─────────────────────────────────────────────────────────────┘
 */

import { type CSSProperties, type ReactNode } from 'react';
import { RIGHT_PANEL_WIDTH } from './sidebar/constants';

const ROOT_STYLE: CSSProperties = {
  width: RIGHT_PANEL_WIDTH,
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--doc-surface, #ffffff)',
  borderLeft: '1px solid var(--doc-border, #e0e0e0)',
  color: 'var(--doc-text-on-surface, #1f2937)',
  // Slide-in matches the same animation chat used previously.
  animation: 'docx-slide-in 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
  overflow: 'hidden',
  minHeight: 0,
};

const HEADER_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '14px 16px',
  borderBottom: '1px solid var(--doc-border, #e0e0e0)',
  fontWeight: 600,
  fontSize: 14,
  flexShrink: 0,
};

const TITLE_STYLE: CSSProperties = {
  flex: 1,
  minWidth: 0,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const HEADER_ICON_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  color: 'var(--doc-text-on-surface-muted, #5f6368)',
  flexShrink: 0,
};

const CLOSE_BTN_STYLE: CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: 'var(--doc-text-on-surface-muted, #5f6368)',
  cursor: 'pointer',
  fontSize: 18,
  lineHeight: 1,
  padding: 4,
  marginRight: -4,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 4,
  flexShrink: 0,
};

const BODY_STYLE: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column',
};

const FOOTER_STYLE: CSSProperties = {
  borderTop: '1px solid var(--doc-border, #e0e0e0)',
  background: 'var(--doc-surface, #ffffff)',
  flexShrink: 0,
};

export interface RightDockPanelProps {
  /** Title text shown in the header bar. */
  title: ReactNode;
  /** Optional leading icon (any ReactNode — emoji, MaterialSymbol). */
  icon?: ReactNode;
  /** Optional right-aligned slot in the header — used for the chat
   *  Clear button, AI panel tone count, etc. */
  headerActions?: ReactNode;
  /** Called when the user clicks the close ✕ (or presses Escape). */
  onClose: () => void;
  /** Scrollable body content. */
  children: ReactNode;
  /** Optional sticky footer (chat input, action bar, etc.). */
  footer?: ReactNode;
  /** Data-testid hook for E2E tests. */
  testId?: string;
  /** Accessible label for screen readers. Defaults to `title` (if it's
   *  a string). */
  ariaLabel?: string;
}

export function RightDockPanel({
  title,
  icon,
  headerActions,
  onClose,
  children,
  footer,
  testId,
  ariaLabel,
}: RightDockPanelProps) {
  return (
    <aside
      role="complementary"
      aria-label={ariaLabel ?? (typeof title === 'string' ? title : 'Side panel')}
      data-testid={testId}
      style={ROOT_STYLE}
    >
      <div style={HEADER_STYLE}>
        {icon && (
          <span style={HEADER_ICON_STYLE} aria-hidden="true">
            {icon}
          </span>
        )}
        <span style={TITLE_STYLE}>{title}</span>
        {headerActions}
        <button
          type="button"
          style={CLOSE_BTN_STYLE}
          onClick={onClose}
          aria-label="Close panel"
          data-testid={testId ? `${testId}-close` : undefined}
        >
          ✕
        </button>
      </div>
      <div style={BODY_STYLE}>{children}</div>
      {footer && <div style={FOOTER_STYLE}>{footer}</div>}
    </aside>
  );
}

export default RightDockPanel;
