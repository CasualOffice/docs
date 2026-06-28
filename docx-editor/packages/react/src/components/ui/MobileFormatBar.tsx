/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * MobileFormatBar — Google-Docs-style floating format chip that
 * appears near a non-collapsed selection on phone viewports.
 *
 * The editor's normal toolbar lives in the title bar's File / Format
 * menus, which are reachable but slow on a phone (open menu → scroll
 * → tap). When the user has highlighted text, the most common next
 * action is one of bold / italic / underline / strikethrough — a
 * floating chip pinned to the selection is the established mobile
 * pattern.
 *
 * Positioning math:
 *   - We anchor above the topmost selection rect, centred over the
 *     rect's horizontal midpoint.
 *   - If anchoring above would render past the top of the viewport,
 *     we flip to below the bottommost rect instead.
 *   - We clamp horizontally so the chip stays within an 8 px gutter.
 *
 * The chip uses position: fixed so it rides above the editor's
 * scroll container; coordinates come from the SelectionOverlay
 * rects, which are already in viewport coordinates (after the
 * parent's scale transform).
 */

import React, { Fragment, useEffect, useState, useMemo, type CSSProperties } from 'react';
import type { SelectionRect } from '@eigenpal/docx-core/layout-bridge';
import type { SelectionFormatting, FormattingAction } from '../Toolbar';
import { MaterialSymbol } from './MaterialSymbol';
import { ColorPicker } from './ColorPicker';

const dividerStyle: CSSProperties = {
  width: 1,
  height: 16,
  margin: '0 2px',
  background: 'var(--doc-border, #e0e0e0)',
  flexShrink: 0,
};

export interface MobileFormatBarProps {
  /** Selection rectangles in *overlay-local* coordinates (unscaled).
   *  The component converts them to viewport-fixed by reading the
   *  overlay element's screen rect and folding in the zoom. */
  rects: SelectionRect[];
  /** Currently active marks — used to highlight pressed buttons. */
  formatting: SelectionFormatting;
  /** Issue a format command — same shape as Toolbar's onFormat. */
  onFormat: (cmd: FormattingAction) => void;
  /** Only render when true (editor focused + selection in body). */
  visible: boolean;
  /** Editor zoom factor (1 = no scale). */
  zoom: number;
  /**
   * Which viewport this instance is for:
   *  - `mobile` (default): renders only on phone-width viewports.
   *  - `desktop`: renders only on non-phone viewports, with a smaller
   *    button size that fits next to the typing line without
   *    occluding it.
   * The parent renders one instance per variant; the gating below
   * picks the right one for the current viewport.
   */
  variant?: 'mobile' | 'desktop';
  /**
   * @deprecated Use `variant: 'desktop'` to render the desktop
   * bar. Kept for backwards compatibility with callers that
   * passed `mobileOnly={false}` to opt into desktop rendering.
   */
  mobileOnly?: boolean;
}

/** Track touch-screen viewport. */
function useIsTouchPhone(): boolean {
  const [match, setMatch] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 720px)').matches;
  });
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 720px)');
    const handler = (e: MediaQueryListEvent) => setMatch(e.matches);
    setMatch(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  return match;
}

const BAR_HEIGHT_MOBILE = 44; // matches the chrome tap-target floor.
const BAR_HEIGHT_DESKTOP = 34; // tighter chip; matches FormattingBar height.
const BAR_GAP = 8; // vertical gap between chip and the selection rect.

function buildContainerStyle(variant: 'mobile' | 'desktop'): CSSProperties {
  return {
    position: 'fixed',
    zIndex: 5000,
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    padding: variant === 'mobile' ? '4px 6px' : '3px 4px',
    height: variant === 'mobile' ? BAR_HEIGHT_MOBILE : BAR_HEIGHT_DESKTOP,
    background: 'var(--doc-surface, #ffffff)',
    borderRadius: variant === 'mobile' ? 999 : 6,
    border: '1px solid var(--doc-border, #dadce0)',
    boxShadow: '0 4px 14px rgba(15, 23, 42, 0.16), 0 1px 2px rgba(15, 23, 42, 0.08)',
    pointerEvents: 'auto',
  };
}

function buildBtnBase(variant: 'mobile' | 'desktop'): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: variant === 'mobile' ? 36 : 28,
    height: variant === 'mobile' ? 36 : 28,
    border: 'none',
    background: 'transparent',
    borderRadius: variant === 'mobile' ? 8 : 4,
    color: 'var(--doc-text-on-surface, #1f2937)',
    cursor: 'pointer',
    font: 'inherit',
    fontSize: variant === 'mobile' ? 16 : 14,
    fontWeight: 600,
    padding: 0,
  };
}

const btnActive: CSSProperties = {
  background: 'var(--doc-primary-light, #e8f0fe)',
  color: 'var(--doc-primary, #1a73e8)',
};

interface FormatButton {
  cmd: 'bold' | 'italic' | 'underline' | 'strikethrough' | 'insertLink';
  label: string;
  /** Text glyph (B/I/U/S). Mutually exclusive with `icon`. */
  glyph?: string;
  /** MaterialSymbol name — used for actions with no good text glyph (link). */
  icon?: string;
  active: (f: SelectionFormatting) => boolean;
  /** Render a thin separator before this button (groups marks vs actions). */
  divider?: boolean;
}

const BUTTONS: FormatButton[] = [
  { cmd: 'bold', label: 'Bold', glyph: 'B', active: (f) => !!f.bold },
  { cmd: 'italic', label: 'Italic', glyph: 'I', active: (f) => !!f.italic },
  { cmd: 'underline', label: 'Underline', glyph: 'U', active: (f) => !!f.underline },
  {
    cmd: 'strikethrough',
    label: 'Strikethrough',
    glyph: 'S',
    // SelectionFormatting calls it `strike` (matches PM mark name);
    // the FormattingAction uses `strikethrough` for the command.
    active: (f) => !!f.strike,
  },
  {
    cmd: 'insertLink',
    label: 'Insert link',
    icon: 'link',
    active: () => false,
    divider: true,
  },
];

export function MobileFormatBar({
  rects,
  formatting,
  onFormat,
  visible,
  zoom,
  variant,
  mobileOnly = true,
}: MobileFormatBarProps): React.JSX.Element | null {
  const isPhone = useIsTouchPhone();
  // Derive the effective variant: explicit `variant` prop wins; else
  // legacy `mobileOnly` controls mobile-only gating.
  const effectiveVariant: 'mobile' | 'desktop' =
    variant ?? (mobileOnly ? 'mobile' : isPhone ? 'mobile' : 'desktop');
  // Gating: mobile variant only on phones; desktop variant only off
  // phones. Both can be rendered simultaneously by the parent — only
  // one will pass this gate at a time.
  if (effectiveVariant === 'mobile' && !isPhone) return null;
  if (effectiveVariant === 'desktop' && isPhone) return null;
  if (!visible || rects.length === 0) return null;

  return (
    <MobileFormatBarInner
      rects={rects}
      formatting={formatting}
      onFormat={onFormat}
      zoom={zoom}
      variant={effectiveVariant}
    />
  );
}

// Inner component so the rect math + position style are recomputed
// only when actually mounted (skip the work entirely when gated off).
function MobileFormatBarInner({
  rects,
  formatting,
  onFormat,
  zoom,
  variant,
}: {
  rects: SelectionRect[];
  formatting: SelectionFormatting;
  onFormat: (cmd: FormattingAction) => void;
  zoom: number;
  variant: 'mobile' | 'desktop';
}): React.JSX.Element {
  const position = useMemo(() => computePosition(rects, zoom, variant), [rects, zoom, variant]);
  const containerStyle = useMemo(() => buildContainerStyle(variant), [variant]);
  const btnBase = useMemo(() => buildBtnBase(variant), [variant]);

  // Underline glyph: rendered via text-decoration so it reads as the
  // formatting it applies. Strikethrough handled the same way. Bold +
  // Italic just use bold/italic glyph weights.
  return (
    <div
      style={{ ...containerStyle, ...position }}
      role="toolbar"
      aria-label="Format selection"
      data-testid={variant === 'mobile' ? 'mobile-format-bar' : 'desktop-format-bar'}
      data-variant={variant}
      onMouseDown={(e) => e.preventDefault()} // don't steal the editor's focus.
      onTouchStart={(e) => e.stopPropagation()}
    >
      {BUTTONS.map((b) => {
        const on = b.active(formatting);
        const cmd = b.cmd;
        const glyphStyle: CSSProperties = {
          fontWeight: cmd === 'bold' ? 700 : 600,
          fontStyle: cmd === 'italic' ? 'italic' : 'normal',
          textDecoration:
            cmd === 'underline' ? 'underline' : cmd === 'strikethrough' ? 'line-through' : 'none',
        };
        return (
          <Fragment key={b.label}>
            {b.divider && <span aria-hidden style={dividerStyle} />}
            <button
              type="button"
              style={{ ...btnBase, ...(on ? btnActive : null) }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onFormat(b.cmd)}
              aria-pressed={on}
              aria-label={b.label}
              title={b.label}
              data-testid={`${variant}-format-${cmd}`}
            >
              {b.icon ? (
                <MaterialSymbol name={b.icon} size={variant === 'mobile' ? 18 : 16} />
              ) : (
                <span style={glyphStyle}>{b.glyph}</span>
              )}
            </button>
          </Fragment>
        );
      })}
      <span aria-hidden style={dividerStyle} />
      {/* Text color + highlight — compact (non-split) pickers; the dropdown
          opens on click and applies via the same onFormat the main toolbar
          uses. onMouseDown preventDefault on the bar keeps the selection. */}
      <ColorPicker
        mode="text"
        splitButton={false}
        value={formatting.color?.replace(/^#/, '')}
        onChange={(color) => onFormat({ type: 'textColor', value: color })}
      />
      <ColorPicker
        mode="highlight"
        splitButton={false}
        value={formatting.highlight}
        onChange={(color) =>
          onFormat({ type: 'highlightColor', value: typeof color === 'string' ? color : '' })
        }
      />
    </div>
  );
}

/** Compute fixed-position style from the selection rects.
 *
 *  The rects come from PagedEditor in *overlay-local* coordinates
 *  (unscaled), so we read the overlay element's screen rect once to
 *  convert into viewport-fixed pixels: screen_x = overlay.left +
 *  rect.x * zoom. */
function computePosition(
  rects: SelectionRect[],
  zoom: number,
  variant: 'mobile' | 'desktop' = 'mobile'
): Pick<CSSProperties, 'left' | 'top'> {
  const btnSize = variant === 'mobile' ? 36 : 28;
  const padding = variant === 'mobile' ? 6 : 4;
  const APPROX_WIDTH = padding * 2 + BUTTONS.length * btnSize;
  const barHeight = variant === 'mobile' ? BAR_HEIGHT_MOBILE : BAR_HEIGHT_DESKTOP;
  const vw = typeof window === 'undefined' ? 360 : window.innerWidth;
  const vh = typeof window === 'undefined' ? 640 : window.innerHeight;

  // Topmost rect = single-line selection, or first line of a
  // multi-line selection.
  const top = rects.reduce((best, r) => (r.y < best.y ? r : best), rects[0]);
  const bottom = rects.reduce(
    (best, r) => (r.y + r.height > best.y + best.height ? r : best),
    rects[0]
  );

  let overlayLeft = 0;
  let overlayTop = 0;
  if (typeof document !== 'undefined') {
    const overlay = document.querySelector('[data-testid="selection-overlay"]');
    if (overlay) {
      const r = overlay.getBoundingClientRect();
      overlayLeft = r.left;
      overlayTop = r.top;
    }
  }

  const screenTopMidX = overlayLeft + (top.x + top.width / 2) * zoom;
  const screenTopY = overlayTop + top.y * zoom;
  const screenBottomY = overlayTop + (bottom.y + bottom.height) * zoom;

  let left = Math.round(screenTopMidX - APPROX_WIDTH / 2);
  left = Math.max(8, Math.min(left, vw - APPROX_WIDTH - 8));

  let topPos = Math.round(screenTopY - barHeight - BAR_GAP);
  if (topPos < 8) topPos = Math.round(screenBottomY + BAR_GAP);
  topPos = Math.max(8, Math.min(topPos, vh - barHeight - 8));

  return { left, top: topPos };
}
