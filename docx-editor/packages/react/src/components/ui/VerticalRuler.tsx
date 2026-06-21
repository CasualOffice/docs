/**
 * VerticalRuler Component
 *
 * A vertical ruler that displays alongside the document with:
 * - Page height scale with tick marks
 * - Top and bottom margin indicators
 * - Optional dragging to adjust margins
 * - Support for zoom levels
 *
 * Similar to Google Docs' vertical ruler.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { CSSProperties } from 'react';
import type { SectionProperties } from '@eigenpal/docx-core/types/document';
import { twipsToPixels, pixelsToTwips, formatPx } from '@eigenpal/docx-core/utils';
import { useTranslation } from '../../i18n';

// ============================================================================
// TYPES
// ============================================================================

export interface VerticalRulerProps {
  /** Section properties for page layout */
  sectionProps?: SectionProperties | null;
  /** Zoom level (1.0 = 100%) */
  zoom?: number;
  /** Whether margins can be dragged to adjust */
  editable?: boolean;
  /** Callback when top margin changes (in twips) */
  onTopMarginChange?: (marginTwips: number) => void;
  /** Callback when bottom margin changes (in twips) */
  onBottomMarginChange?: (marginTwips: number) => void;
  /** Unit to display (inches or cm) */
  unit?: 'inch' | 'cm';
  /** Fired with `true` when a margin marker drag starts and `false` when it
   *  ends, so the host can freeze the editor scroll position during the drag. */
  onDragStateChange?: (dragging: boolean) => void;
  /** Additional CSS class name */
  className?: string;
  /** Additional inline styles */
  style?: CSSProperties;
}

type MarkerType = 'topMargin' | 'bottomMargin';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_PAGE_HEIGHT_TWIPS = 15840; // 11 inches
const DEFAULT_MARGIN_TWIPS = 1440; // 1 inch
const TWIPS_PER_INCH = 1440;
const TWIPS_PER_CM = 567;

// Ruler styling - Google Docs style
const RULER_WIDTH = 20;
const RULER_TEXT_COLOR = 'var(--doc-text-muted)';
const RULER_TICK_COLOR = 'var(--doc-text-subtle)';
const MARKER_COLOR = 'var(--doc-primary)';
const MARKER_HOVER_COLOR = 'var(--doc-primary)';
const MARKER_ACTIVE_COLOR = 'var(--doc-primary-hover)';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function VerticalRuler({
  sectionProps,
  zoom = 1,
  editable = false,
  onTopMarginChange,
  onBottomMarginChange,
  unit = 'inch',
  onDragStateChange,
  className = '',
  style,
}: VerticalRulerProps): React.ReactElement {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState<MarkerType | null>(null);
  const [hoveredMarker, setHoveredMarker] = useState<MarkerType | null>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  // Anchor captured at drag-start. The new margin is computed as
  // `startMargin + (pointer delta in twips)` against this fixed anchor, so
  // re-laying the page mid-drag can't shift the reference and make the marker
  // oscillate. `marker` is stored here (not read from React state) so the
  // mousemove handler can stay referentially stable — see handleDrag.
  const dragAnchorRef = useRef<{
    marker: MarkerType;
    startClientY: number;
    startTopMarginTwips: number;
    startBottomMarginTwips: number;
  } | null>(null);

  // Get page dimensions
  const pageHeightTwips = sectionProps?.pageHeight ?? DEFAULT_PAGE_HEIGHT_TWIPS;
  const topMarginTwips = sectionProps?.marginTop ?? DEFAULT_MARGIN_TWIPS;
  const bottomMarginTwips = sectionProps?.marginBottom ?? DEFAULT_MARGIN_TWIPS;

  // Convert to pixels with zoom
  const pageHeightPx = twipsToPixels(pageHeightTwips) * zoom;
  const topMarginPx = twipsToPixels(topMarginTwips) * zoom;
  const bottomMarginPx = twipsToPixels(bottomMarginTwips) * zoom;

  // Live values the mousemove handler needs, mirrored into a ref so handleDrag
  // can be referentially STABLE (empty deps). If handleDrag depended on the
  // live margins, it would be recreated on every drag step and the useEffect
  // would remove+re-add the mousemove listener every frame — dropping events
  // and making the marker jitter/"shake".
  const liveRef = useRef({
    zoom,
    pageHeightTwips,
    topMarginTwips,
    bottomMarginTwips,
    onTopMarginChange,
    onBottomMarginChange,
  });
  liveRef.current = {
    zoom,
    pageHeightTwips,
    topMarginTwips,
    bottomMarginTwips,
    onTopMarginChange,
    onBottomMarginChange,
  };

  // Handle drag start
  const handleDragStart = useCallback(
    (e: React.MouseEvent, marker: MarkerType) => {
      if (!editable) return;
      e.preventDefault();
      dragAnchorRef.current = {
        marker,
        startClientY: e.clientY,
        startTopMarginTwips: topMarginTwips,
        startBottomMarginTwips: bottomMarginTwips,
      };
      setDragging(marker);
      onDragStateChange?.(true);
    },
    [editable, topMarginTwips, bottomMarginTwips, onDragStateChange]
  );

  // Handle drag. Referentially stable (reads everything from refs) so the
  // mousemove listener is attached exactly once per drag.
  const handleDrag = useCallback((e: MouseEvent) => {
    const anchor = dragAnchorRef.current;
    if (!anchor) return;
    const {
      zoom,
      pageHeightTwips,
      topMarginTwips,
      bottomMarginTwips,
      onTopMarginChange,
      onBottomMarginChange,
    } = liveRef.current;

    // Pointer delta only. We deliberately do NOT fold in the scroller's
    // scrollTop change: dragging the margin reflows the page and auto-scrolls
    // to keep the caret in view, and reading that auto-scroll as additional
    // drag created a feedback loop — the margin ran straight to its clamp and
    // the marker got stuck (one direction wouldn't move).
    const dyPx = e.clientY - anchor.startClientY;
    const dyTwips = pixelsToTwips(dyPx / zoom);

    if (anchor.marker === 'topMargin') {
      // Dragging down (positive dy) → larger top margin.
      const maxMargin = pageHeightTwips - bottomMarginTwips - 720;
      const newMargin = Math.max(0, Math.min(anchor.startTopMarginTwips + dyTwips, maxMargin));
      onTopMarginChange?.(Math.round(newMargin));
    } else {
      // Dragging down (positive dy) → smaller bottom margin (the content
      // area's bottom edge follows the pin down).
      const maxMargin = pageHeightTwips - topMarginTwips - 720;
      const newMargin = Math.max(0, Math.min(anchor.startBottomMarginTwips - dyTwips, maxMargin));
      onBottomMarginChange?.(Math.round(newMargin));
    }
  }, []);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setDragging(null);
    dragAnchorRef.current = null;
    onDragStateChange?.(false);
  }, [onDragStateChange]);

  // Add/remove document event listeners
  useEffect(() => {
    if (dragging) {
      document.addEventListener('mousemove', handleDrag);
      document.addEventListener('mouseup', handleDragEnd);
      return () => {
        document.removeEventListener('mousemove', handleDrag);
        document.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, [dragging, handleDrag, handleDragEnd]);

  // Generate tick marks
  const ticks = generateVerticalTicks(pageHeightTwips, zoom, unit);

  const rulerStyle: CSSProperties = {
    position: 'relative',
    width: RULER_WIDTH,
    height: formatPx(pageHeightPx),
    backgroundColor: 'transparent',
    overflow: 'visible',
    userSelect: 'none',
    cursor: dragging ? 'ns-resize' : 'default',
    ...style,
  };

  return (
    <div
      ref={rulerRef}
      className={`docx-vertical-ruler ${className}`}
      style={rulerStyle}
      // A GROUP of margin sliders, not a slider itself — role="slider" here
      // lacked aria-valuenow and nested the focusable markers inside an
      // interactive control (nested-interactive).
      role="group"
      aria-label={t('ruler.vertical')}
    >
      {/* Tick marks */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: 'none',
        }}
      >
        {ticks.map((tick, index) => (
          <VerticalTick key={index} tick={tick} />
        ))}
      </div>

      {/* Top margin marker */}
      <VerticalMarginMarker
        type="topMargin"
        position={topMarginPx}
        editable={editable}
        isDragging={dragging === 'topMargin'}
        isHovered={hoveredMarker === 'topMargin'}
        onMouseEnter={() => setHoveredMarker('topMargin')}
        onMouseLeave={() => setHoveredMarker(null)}
        onMouseDown={(e) => handleDragStart(e, 'topMargin')}
        maxPx={pageHeightPx}
      />

      {/* Bottom margin marker */}
      <VerticalMarginMarker
        type="bottomMargin"
        position={pageHeightPx - bottomMarginPx}
        editable={editable}
        isDragging={dragging === 'bottomMargin'}
        isHovered={hoveredMarker === 'bottomMargin'}
        onMouseEnter={() => setHoveredMarker('bottomMargin')}
        onMouseLeave={() => setHoveredMarker(null)}
        onMouseDown={(e) => handleDragStart(e, 'bottomMargin')}
        maxPx={pageHeightPx}
      />
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface VerticalTickData {
  position: number;
  width: number;
  label?: string;
}

function VerticalTick({ tick }: { tick: VerticalTickData }): React.ReactElement {
  const tickStyle: CSSProperties = {
    position: 'absolute',
    top: formatPx(tick.position),
    right: 0,
    height: 1,
    width: tick.width,
    backgroundColor: RULER_TICK_COLOR,
  };

  const labelStyle: CSSProperties = {
    position: 'absolute',
    top: formatPx(tick.position),
    left: 2,
    transform: 'translateY(-50%)',
    fontSize: '9px',
    color: RULER_TEXT_COLOR,
    fontFamily: 'sans-serif',
    whiteSpace: 'nowrap',
  };

  return (
    <>
      <div style={tickStyle} />
      {tick.label && <div style={labelStyle}>{tick.label}</div>}
    </>
  );
}

interface VerticalMarginMarkerProps {
  type: 'topMargin' | 'bottomMargin';
  position: number;
  editable: boolean;
  isDragging: boolean;
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
  /** Ruler height in px — the slider's aria-valuemax (aria-valuenow = position). */
  maxPx: number;
}

function VerticalMarginMarker({
  type,
  position,
  editable,
  isDragging,
  isHovered,
  onMouseEnter,
  onMouseLeave,
  onMouseDown,
  maxPx,
}: VerticalMarginMarkerProps): React.ReactElement {
  const { t } = useTranslation();
  const color = isDragging ? MARKER_ACTIVE_COLOR : isHovered ? MARKER_HOVER_COLOR : MARKER_COLOR;

  const markerStyle: CSSProperties = {
    position: 'absolute',
    top: formatPx(position - 5),
    right: 0,
    width: RULER_WIDTH,
    height: 10,
    cursor: editable ? 'ns-resize' : 'default',
    zIndex: isDragging ? 10 : 1,
  };

  // Triangle pointing left (for top) or right (for bottom)
  const triangleStyle: CSSProperties = {
    position: 'absolute',
    top: 0,
    right: 2,
    width: 0,
    height: 0,
    borderTop: '5px solid transparent',
    borderBottom: '5px solid transparent',
    borderRight: `8px solid ${color}`,
    transition: 'border-right-color 0.1s',
  };

  return (
    <div
      className={`docx-ruler-marker docx-ruler-marker-${type}`}
      style={markerStyle}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseDown={onMouseDown}
      role="slider"
      aria-label={type === 'topMargin' ? t('ruler.topMargin') : t('ruler.bottomMargin')}
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={Math.round(maxPx)}
      aria-valuenow={Math.round(Math.min(Math.max(position, 0), maxPx))}
      tabIndex={editable ? 0 : -1}
    >
      <div style={triangleStyle} />
    </div>
  );
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function generateVerticalTicks(
  pageHeightTwips: number,
  zoom: number,
  unit: 'inch' | 'cm'
): VerticalTickData[] {
  const ticks: VerticalTickData[] = [];

  if (unit === 'inch') {
    const eighthInchTwips = TWIPS_PER_INCH / 8;
    const totalEighths = Math.ceil(pageHeightTwips / eighthInchTwips);

    for (let i = 0; i <= totalEighths; i++) {
      const twipsPos = i * eighthInchTwips;
      if (twipsPos > pageHeightTwips) break;

      const pxPos = twipsToPixels(twipsPos) * zoom;

      if (i % 8 === 0) {
        const inches = i / 8;
        ticks.push({
          position: pxPos,
          width: 10,
          label: inches > 0 ? String(inches) : undefined,
        });
      } else if (i % 4 === 0) {
        ticks.push({ position: pxPos, width: 6 });
      } else if (i % 2 === 0) {
        ticks.push({ position: pxPos, width: 4 });
      } else {
        ticks.push({ position: pxPos, width: 2 });
      }
    }
  } else {
    const mmTwips = TWIPS_PER_CM / 10;
    const totalMm = Math.ceil(pageHeightTwips / mmTwips);

    for (let i = 0; i <= totalMm; i++) {
      const twipsPos = i * mmTwips;
      if (twipsPos > pageHeightTwips) break;

      const pxPos = twipsToPixels(twipsPos) * zoom;

      if (i % 10 === 0) {
        const cm = i / 10;
        ticks.push({
          position: pxPos,
          width: 10,
          label: cm > 0 ? String(cm) : undefined,
        });
      } else if (i % 5 === 0) {
        ticks.push({ position: pxPos, width: 6 });
      } else {
        ticks.push({ position: pxPos, width: 3 });
      }
    }
  }

  return ticks;
}

export default VerticalRuler;
