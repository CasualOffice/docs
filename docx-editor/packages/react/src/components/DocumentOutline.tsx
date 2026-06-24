import React, { useEffect, useMemo, useState } from 'react';
import type { HeadingInfo } from '@eigenpal/docx-core/utils';
import { MaterialSymbol } from './ui/Icons';
import { PanelState } from './ui/PanelState';
import { Tooltip } from './ui/Tooltip';
import { useTranslation } from '../i18n';

/** @deprecated Use HeadingInfo from utils/headingCollector instead */
export type OutlineHeading = HeadingInfo;

// Outline panel geometry (px). Only the *_RESERVED_SPACE values leak out —
// the editor uses them to size the layout so the centered page never sits
// under the panel or the toggle button.
const OUTLINE_LEFT_OFFSET = 30;
const OUTLINE_WIDTH = 240;
const OUTLINE_PAGE_GAP = 16;
// Matches PagedEditor's VIEWPORT_PADDING_TOP so the panel header lines up
// with the page's top edge.
const OUTLINE_TOP_PADDING = 24;
export const OUTLINE_RESERVED_SPACE = OUTLINE_LEFT_OFFSET + OUTLINE_WIDTH + OUTLINE_PAGE_GAP;

// Toggle-button geometry (when the panel is collapsed): button anchor + icon
// box (~32px including padding) + gap before the page.
export const OUTLINE_BUTTON_LEFT_OFFSET = 48;
const OUTLINE_BUTTON_BOX = 32;
export const OUTLINE_BUTTON_RESERVED_SPACE =
  OUTLINE_BUTTON_LEFT_OFFSET + OUTLINE_BUTTON_BOX + OUTLINE_PAGE_GAP;

interface DocumentOutlineProps {
  headings: HeadingInfo[];
  onHeadingClick: (pmPos: number) => void;
  onClose: () => void;
  topOffset?: number;
  /** Horizontal scroll offset of the editor — outline slides left with the doc. */
  scrollLeft?: number;
  /** Index of the heading whose section the cursor is currently in.
   *  Renders a blue-tinted highlight + bold weight on that row. -1 / null
   *  when the cursor is above the first heading or no doc state yet. */
  activeIndex?: number | null;
}

/**
 * Build a parent → children map from the flat heading list. A heading's
 * descendants are the consecutive following headings with strictly greater
 * level than the parent's, stopping at the first heading with level ≤
 * parent's. Used to drive the collapse/expand chevron — collapsing a
 * parent hides its entire descendant subtree.
 */
function buildOutlineTree(headings: HeadingInfo[]): {
  /** For each index, the indices of its descendant headings. */
  descendantsByIndex: number[][];
  /** Indices that are parents (have at least one descendant). */
  parentIndices: Set<number>;
} {
  const descendantsByIndex: number[][] = headings.map(() => []);
  const parentIndices = new Set<number>();
  for (let i = 0; i < headings.length; i++) {
    const parentLevel = headings[i].level;
    for (let j = i + 1; j < headings.length; j++) {
      if (headings[j].level <= parentLevel) break;
      descendantsByIndex[i].push(j);
      parentIndices.add(i);
    }
  }
  return { descendantsByIndex, parentIndices };
}

export const DocumentOutline = React.memo(function DocumentOutline({
  headings,
  onHeadingClick,
  onClose,
  topOffset = 0,
  scrollLeft = 0,
  activeIndex = null,
}: DocumentOutlineProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // Set of heading indices the user has chevron-collapsed. Children of
  // a collapsed heading are filtered out of the rendered list. State
  // resets when the heading list shape changes meaningfully (e.g.
  // doc reload) — handled by the effect below.
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());

  const { descendantsByIndex, parentIndices } = useMemo(
    () => buildOutlineTree(headings),
    [headings]
  );

  // Compute which indices are hidden because an ancestor is collapsed.
  const hiddenByCollapse = useMemo(() => {
    const hidden = new Set<number>();
    for (const parent of collapsed) {
      if (parent >= headings.length) continue;
      for (const desc of descendantsByIndex[parent] ?? []) hidden.add(desc);
    }
    return hidden;
  }, [collapsed, descendantsByIndex, headings.length]);

  // When the user clicks a heading, also make sure it's visible — if
  // an ancestor was collapsed, expand it. Avoids the dead-click feel
  // where a heading is collapsed but the cursor jumps elsewhere and
  // the user can't see the new active row.
  const handleHeadingActivate = (index: number, pmPos: number): void => {
    if (hiddenByCollapse.has(index)) {
      const nextCollapsed = new Set(collapsed);
      // Expand every ancestor of this index.
      for (let i = index - 1; i >= 0; i--) {
        if (nextCollapsed.has(i) && (descendantsByIndex[i] ?? []).includes(index)) {
          nextCollapsed.delete(i);
        }
      }
      setCollapsed(nextCollapsed);
    }
    onHeadingClick(pmPos);
  };

  const toggleCollapse = (index: number): void => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  // Reset collapse state when the heading list shape changes drastically
  // (e.g. a new doc loaded). Heuristic: comparing the joined text of all
  // headings catches replace-load without firing on edits within an
  // existing heading.
  const headingsKey = useMemo(
    () => headings.map((h) => `${h.level}:${h.text}`).join('|'),
    [headings]
  );
  const lastResetKeyRef = React.useRef<string>(headingsKey);
  useEffect(() => {
    // Reset only if the structure changed *radically* — heading count
    // shifted by more than 50% or every text differs. Fine-grained
    // edits should preserve the user's expanded/collapsed state.
    const prevHeadingsCount = lastResetKeyRef.current.split('|').length;
    const currHeadingsCount = headings.length;
    const ratio =
      currHeadingsCount === 0
        ? 0
        : Math.min(prevHeadingsCount, currHeadingsCount) /
          Math.max(prevHeadingsCount, currHeadingsCount);
    if (ratio < 0.5) {
      setCollapsed(new Set());
      lastResetKeyRef.current = headingsKey;
    }
  }, [headingsKey, headings.length]);

  useEffect(() => {
    // Trigger slide-in on next frame
    requestAnimationFrame(() => setOpen(true));
  }, []);

  return (
    <nav
      className="docx-outline-nav"
      role="navigation"
      aria-label={t('documentOutline.ariaLabel')}
      style={{
        position: 'absolute',
        top: topOffset,
        // Anchor to OUTLINE_LEFT_OFFSET, then slide left by the editor's
        // horizontal scroll so the panel tracks the doc instead of staying
        // pinned to the viewport.
        left: OUTLINE_LEFT_OFFSET - scrollLeft,
        bottom: 0,
        width: OUTLINE_WIDTH,
        paddingTop: OUTLINE_TOP_PADDING,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: "'Google Sans', Roboto, Arial, sans-serif",
        zIndex: 40,
        // Slide-in animation — translate fully off-screen left of its anchor.
        // Only `transform` transitions; horizontal-scroll tracking via `left`
        // is intentionally untransitioned so the panel keeps up with the doc.
        transform: open ? 'translateX(0)' : `translateX(-${OUTLINE_LEFT_OFFSET + OUTLINE_WIDTH}px)`,
        transition: 'transform var(--doc-anim-base)',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header — matches the unified right-dock pattern: title left,
          close X right, hairline below. Outline is positioned on the
          LEFT side of the doc so it can't share RightDockPanel
          directly, but the visual rhythm is identical to keep every
          panel header in the editor recognizable as the same family. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '14px 16px',
          borderBottom: '1px solid var(--doc-border-light)',
          fontWeight: 600,
          fontSize: 14.5,
          letterSpacing: '-0.005em',
          flexShrink: 0,
        }}
      >
        <MaterialSymbol name="format_list_bulleted" size={18} />
        <span
          style={{
            flex: 1,
            minWidth: 0,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: 'var(--doc-text)',
          }}
        >
          {t('documentOutline.title')}
        </span>
        <Tooltip content={t('documentOutline.closeTitle')}>
          <button
            onClick={onClose}
            aria-label={t('documentOutline.closeAriaLabel')}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--doc-text-muted)',
              cursor: 'pointer',
              lineHeight: 1,
              padding: 6,
              marginRight: -6,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 6,
              flexShrink: 0,
              transition: 'background var(--doc-anim-fast), color var(--doc-anim-fast)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--doc-bg-hover)';
              e.currentTarget.style.color = 'var(--doc-text)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--doc-text-muted)';
            }}
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
        </Tooltip>
      </div>

      {/* Heading list */}
      <div style={{ overflowY: 'auto', flex: 1, paddingLeft: 8 }}>
        {headings.length === 0 ? (
          <PanelState kind="empty" message={t('documentOutline.noHeadings')} />
        ) : (
          headings.map((heading, index) => {
            if (hiddenByCollapse.has(index)) return null;
            const isActive = activeIndex === index;
            const isParent = parentIndices.has(index);
            const isCollapsed = collapsed.has(index);
            return (
              <div
                key={`${heading.pmPos}-${index}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  marginLeft: heading.level * 10,
                }}
              >
                {/* Chevron — only for parents. Reserves space (12px) on
                 *  non-parents so heading text stays aligned across rows. */}
                {isParent ? (
                  <button
                    type="button"
                    onClick={() => toggleCollapse(index)}
                    aria-label={
                      isCollapsed ? t('documentOutline.expand') : t('documentOutline.collapse')
                    }
                    aria-expanded={!isCollapsed}
                    style={{
                      width: 16,
                      height: 18,
                      padding: 0,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--doc-text-muted)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                      transition: 'transform var(--doc-anim-fast)',
                    }}
                  >
                    <MaterialSymbol name="arrow_drop_down" size={18} />
                  </button>
                ) : (
                  <span style={{ width: 16, flexShrink: 0 }} aria-hidden="true" />
                )}
                <button
                  className="docx-outline-heading-btn"
                  onClick={() => handleHeadingActivate(index, heading.pmPos)}
                  aria-current={isActive ? 'true' : undefined}
                  style={{
                    flex: 1,
                    textAlign: 'left',
                    background: isActive ? 'var(--doc-primary-light)' : 'none',
                    border: 'none',
                    borderLeft: isActive ? '3px solid var(--doc-primary)' : '3px solid transparent',
                    cursor: 'pointer',
                    padding: '5px 12px 5px 9px',
                    fontSize: 13,
                    fontWeight: isActive ? 500 : 400,
                    color: isActive ? 'var(--doc-primary)' : 'var(--doc-text)',
                    lineHeight: '18px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    borderRadius: 0,
                    letterSpacing: '0.01em',
                  }}
                >
                  {heading.text}
                </button>
              </div>
            );
          })
        )}
      </div>
    </nav>
  );
});
