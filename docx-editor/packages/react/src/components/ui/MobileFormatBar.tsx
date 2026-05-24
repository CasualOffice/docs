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

import React, { useEffect, useState, useMemo, type CSSProperties } from 'react';
import type { SelectionRect } from '@eigenpal/docx-core/layout-bridge';
import type { SelectionFormatting, FormattingAction } from '../Toolbar';

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
  /** Hide on desktop / non-touch contexts. Default: true. */
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

const BAR_HEIGHT = 44; // matches the chrome tap-target floor we set globally.
const BAR_GAP = 8; // vertical gap between chip and the selection rect.

const containerStyle: CSSProperties = {
  position: 'fixed',
  zIndex: 5000,
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  padding: '4px 6px',
  height: BAR_HEIGHT,
  background: 'var(--doc-surface, #ffffff)',
  borderRadius: 999,
  border: '1px solid var(--doc-border, #dadce0)',
  boxShadow: '0 4px 14px rgba(15, 23, 42, 0.16), 0 1px 2px rgba(15, 23, 42, 0.08)',
  pointerEvents: 'auto',
};

const btnBase: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 36,
  height: 36,
  border: 'none',
  background: 'transparent',
  borderRadius: 8,
  color: 'var(--doc-text, #1f2937)',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: 16,
  fontWeight: 600,
  padding: 0,
};

const btnActive: CSSProperties = {
  background: 'var(--doc-bg-hover, #eff6ff)',
  color: 'var(--doc-accent-strong, #1d4ed8)',
};

interface FormatButton {
  cmd: FormattingAction;
  label: string;
  glyph: string;
  active: (f: SelectionFormatting) => boolean;
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
];

export function MobileFormatBar({
  rects,
  formatting,
  onFormat,
  visible,
  zoom,
  mobileOnly = true,
}: MobileFormatBarProps): React.JSX.Element | null {
  const isPhone = useIsTouchPhone();
  if (mobileOnly && !isPhone) return null;
  if (!visible || rects.length === 0) return null;

  return (
    <MobileFormatBarInner
      rects={rects}
      formatting={formatting}
      onFormat={onFormat}
      zoom={zoom}
    />
  );
}

// Inner component so the rect math + position style are recomputed
// only when actually mounted (skip the work entirely on desktop).
function MobileFormatBarInner({
  rects,
  formatting,
  onFormat,
  zoom,
}: {
  rects: SelectionRect[];
  formatting: SelectionFormatting;
  onFormat: (cmd: FormattingAction) => void;
  zoom: number;
}): React.JSX.Element {
  const position = useMemo(() => computePosition(rects, zoom), [rects, zoom]);

  // Underline glyph: rendered via text-decoration so it reads as the
  // formatting it applies. Strikethrough handled the same way. Bold +
  // Italic just use bold/italic glyph weights.
  return (
    <div
      style={{ ...containerStyle, ...position }}
      role="toolbar"
      aria-label="Format selection"
      data-testid="mobile-format-bar"
      onMouseDown={(e) => e.preventDefault()} // don't steal the editor's focus.
      onTouchStart={(e) => e.stopPropagation()}
    >
      {BUTTONS.map((b) => {
        const on = b.active(formatting);
        // We know cmd is one of the four string literals in this
        // file's BUTTONS table; the FormattingAction union also
        // carries object variants we never construct here.
        const cmd = b.cmd as 'bold' | 'italic' | 'underline' | 'strikethrough';
        const glyphStyle: CSSProperties = {
          fontWeight: cmd === 'bold' ? 700 : 600,
          fontStyle: cmd === 'italic' ? 'italic' : 'normal',
          textDecoration:
            cmd === 'underline'
              ? 'underline'
              : cmd === 'strikethrough'
                ? 'line-through'
                : 'none',
        };
        return (
          <button
            key={b.label}
            type="button"
            style={{ ...btnBase, ...(on ? btnActive : null) }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onFormat(b.cmd)}
            aria-pressed={on}
            aria-label={b.label}
            title={b.label}
            data-testid={`mobile-format-${cmd}`}
          >
            <span style={glyphStyle}>{b.glyph}</span>
          </button>
        );
      })}
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
  zoom: number
): Pick<CSSProperties, 'left' | 'top'> {
  const APPROX_WIDTH = 6 + BUTTONS.length * 36 + 6;
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

  let topPos = Math.round(screenTopY - BAR_HEIGHT - BAR_GAP);
  if (topPos < 8) topPos = Math.round(screenBottomY + BAR_GAP);
  topPos = Math.max(8, Math.min(topPos, vh - BAR_HEIGHT - 8));

  return { left, top: topPos };
}
