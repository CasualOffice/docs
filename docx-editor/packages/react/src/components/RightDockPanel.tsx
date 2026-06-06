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

import { useState, type CSSProperties, type ReactNode } from 'react';
import { RIGHT_PANEL_WIDTH } from './sidebar/constants';

/* ============================================================
   Premium right-dock shell aesthetics. The chrome is deliberately
   quiet — the panel content is the focus. Refinements over the
   prior shell:
     - Soft inner edge: the 1px left border picks up a subtle
       ambient shadow so the panel reads as a layered surface
       rather than a strip painted onto the doc.
     - Headers use a hairline (--doc-border-light) and a slightly
       larger title with -0.005em letterspacing.
     - Close button is a stroked SVG X (not a glyph) with a 6px
       radius soft hover background.
     - Slide-in: 220ms cubic-bezier(0.16, 1, 0.3, 1) settle, not a
       linear 180ms snap. Matches the palette's motion language.
   ============================================================ */

const ROOT_STYLE: CSSProperties = {
  width: RIGHT_PANEL_WIDTH,
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--doc-surface, #ffffff)',
  borderLeft: '1px solid var(--doc-border-light)',
  // Ambient shadow on the left edge gives depth so the panel reads
  // as layered over the doc, not a flat sidebar slice. Subtle —
  // 4px reach, 5% alpha.
  boxShadow: '-4px 0 12px rgba(15, 23, 42, 0.04)',
  color: 'var(--doc-text-on-surface)',
  animation: 'docPanelSlideIn 220ms cubic-bezier(0.16, 1, 0.3, 1) both',
  overflow: 'hidden',
  minHeight: 0,
};

const HEADER_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '14px 16px',
  borderBottom: '1px solid var(--doc-border-light)',
  fontWeight: 600,
  fontSize: 14.5,
  letterSpacing: '-0.005em',
  flexShrink: 0,
};

const TITLE_STYLE: CSSProperties = {
  flex: 1,
  minWidth: 0,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  color: 'var(--doc-text)',
};

const HEADER_ICON_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  color: 'var(--doc-text-muted)',
  flexShrink: 0,
};

const closeBtnStyle = (hover: boolean): CSSProperties => ({
  border: 'none',
  background: hover ? 'var(--doc-bg-hover)' : 'transparent',
  color: hover ? 'var(--doc-text)' : 'var(--doc-text-muted)',
  cursor: 'pointer',
  lineHeight: 1,
  padding: 6,
  marginRight: -6,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 6,
  flexShrink: 0,
  transition:
    'background 80ms cubic-bezier(0.4, 0, 0.2, 1), color 80ms cubic-bezier(0.4, 0, 0.2, 1)',
});

const BODY_STYLE: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column',
};

const FOOTER_STYLE: CSSProperties = {
  borderTop: '1px solid var(--doc-border-light)',
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
  const [closeHover, setCloseHover] = useState(false);
  return (
    <>
      <style>{`
        @keyframes docPanelSlideIn {
          from { opacity: 0; transform: translateX(12px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
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
            style={closeBtnStyle(closeHover)}
            onClick={onClose}
            onMouseEnter={() => setCloseHover(true)}
            onMouseLeave={() => setCloseHover(false)}
            onFocus={() => setCloseHover(true)}
            onBlur={() => setCloseHover(false)}
            aria-label="Close panel"
            data-testid={testId ? `${testId}-close` : undefined}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div style={BODY_STYLE}>{children}</div>
        {footer && <div style={FOOTER_STYLE}>{footer}</div>}
      </aside>
    </>
  );
}

export default RightDockPanel;
