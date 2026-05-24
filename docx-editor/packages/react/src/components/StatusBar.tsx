/**
 * StatusBar — bottom strip with page indicator, word count, and zoom
 * controls. Inspired by the bottom bar in Google Docs / Word and the
 * sibling Casual Sheets project's status row.
 *
 * Renders inside the editor container, below the paginated pages, so
 * it stays visible while the document scrolls.
 */

import type { CSSProperties } from 'react';
import { MaterialSymbol } from './ui/Icons';

export interface StatusBarProps {
  /** 1-based current page index. */
  currentPage?: number;
  /** Total number of pages currently laid out. */
  totalPages?: number;
  /** Word count for the document. */
  wordCount?: number;
  /** Character count for the document (no spaces). */
  charCount?: number;
  /** Current zoom level (1.0 = 100%). */
  zoom?: number;
  /** Called when the user changes zoom via the slider / buttons. */
  onZoomChange?: (zoom: number) => void;
  /** Minimum zoom. Defaults to 0.25 (25%). */
  minZoom?: number;
  /** Maximum zoom. Defaults to 4 (400%). */
  maxZoom?: number;
  /** Hide the status bar when set to false. Default true. */
  visible?: boolean;
}

const ZOOM_STEP = 1.1;

const barStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  padding: '4px 12px',
  borderTop: '1px solid var(--doc-border, #e0e0e0)',
  background: 'var(--doc-surface, #fafafa)',
  color: 'var(--doc-text-on-surface-muted, #5f6368)',
  fontSize: 12,
  height: 28,
  flexShrink: 0,
  userSelect: 'none',
};

const cellStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  whiteSpace: 'nowrap',
};

const dividerStyle: CSSProperties = {
  width: 1,
  height: 16,
  background: 'var(--doc-border, #e0e0e0)',
};

const zoomButtonStyle: CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  padding: '2px 4px',
  borderRadius: 3,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 22,
  width: 22,
};

const zoomReadoutStyle: CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  minWidth: 36,
  textAlign: 'center',
  cursor: 'pointer',
  padding: '2px 6px',
  borderRadius: 3,
  background: 'transparent',
  border: 'none',
  color: 'inherit',
  fontSize: 12,
};

function formatCount(n: number | undefined, singular: string, plural?: string): string {
  if (n === undefined) return '';
  const word = n === 1 ? singular : (plural ?? singular + 's');
  return `${n.toLocaleString()} ${word}`;
}

export function StatusBar({
  currentPage,
  totalPages,
  wordCount,
  charCount,
  zoom,
  onZoomChange,
  minZoom = 0.25,
  maxZoom = 4,
  visible = true,
}: StatusBarProps) {
  if (!visible) return null;
  const zoomPct = zoom !== undefined ? Math.round(zoom * 100) : 100;
  const zoomIn = () => onZoomChange?.(Math.min((zoom ?? 1) * ZOOM_STEP, maxZoom));
  const zoomOut = () => onZoomChange?.(Math.max((zoom ?? 1) / ZOOM_STEP, minZoom));
  const zoomReset = () => onZoomChange?.(1);

  const hasPages = totalPages !== undefined && totalPages > 0;

  return (
    <div role="status" aria-label="Document status" style={barStyle} data-testid="status-bar">
      {hasPages && (
        <>
          <span style={cellStyle} aria-label={`Page ${currentPage ?? 1} of ${totalPages}`}>
            Page {currentPage ?? 1} of {totalPages}
          </span>
          {(wordCount !== undefined || charCount !== undefined) && <span style={dividerStyle} />}
        </>
      )}
      {wordCount !== undefined && (
        <span style={cellStyle} aria-label={`${wordCount} words`}>
          {formatCount(wordCount, 'word')}
        </span>
      )}
      {charCount !== undefined && (
        <span style={cellStyle} aria-label={`${charCount} characters`}>
          {formatCount(charCount, 'character')}
        </span>
      )}

      {/* Spacer pushes zoom to the right. */}
      <span style={{ flex: 1 }} />

      {onZoomChange && (
        <span style={cellStyle}>
          <button
            type="button"
            className="docx-status-zoom-btn"
            style={zoomButtonStyle}
            onClick={zoomOut}
            onMouseDown={(e) => e.preventDefault()}
            title="Zoom out (⌘−)"
            aria-label="Zoom out"
            disabled={(zoom ?? 1) <= minZoom + 1e-3}
          >
            <MaterialSymbol name="remove" size={14} />
          </button>
          <button
            type="button"
            style={zoomReadoutStyle}
            onClick={zoomReset}
            onMouseDown={(e) => e.preventDefault()}
            title="Reset zoom to 100% (⌘0)"
            aria-label={`Zoom: ${zoomPct} percent. Click to reset.`}
          >
            {zoomPct}%
          </button>
          <button
            type="button"
            className="docx-status-zoom-btn"
            style={zoomButtonStyle}
            onClick={zoomIn}
            onMouseDown={(e) => e.preventDefault()}
            title="Zoom in (⌘=)"
            aria-label="Zoom in"
            disabled={(zoom ?? 1) >= maxZoom - 1e-3}
          >
            <MaterialSymbol name="add" size={14} />
          </button>
        </span>
      )}
    </div>
  );
}
