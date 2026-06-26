/**
 * StatusBar — bottom strip with page indicator, word count, and zoom
 * controls. Inspired by the bottom bar in Google Docs / Word and the
 * sibling Casual Sheets project's status row.
 *
 * Renders inside the editor container, below the paginated pages, so
 * it stays visible while the document scrolls.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { MaterialSymbol } from './ui/Icons';
import { Tooltip } from './ui/Tooltip';
import { STAT_LABELS, useStatPrefs, type StatKey } from './statbar-prefs';
import { computeReadability, formatReadingTime, gradeLabel } from '../lib/quality/readability';
import { useTranslation } from '../i18n';

const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export interface StatusBarProps {
  /** 1-based current page index. */
  currentPage?: number;
  /** Total number of pages currently laid out. */
  totalPages?: number;
  /** Word count for the document. */
  wordCount?: number;
  /** Character count for the document (no spaces). */
  charCount?: number;
  /** Live plain-text snapshot of the doc — feeds the readability
   *  cell. Optional: when omitted, the status bar falls back to the
   *  word-count derived approximations. */
  docText?: string;
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
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  padding: '4px 12px',
  borderTop: '1px solid var(--doc-border, #e0e0e0)',
  background: 'var(--doc-chrome, #eef1f5)',
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

const checklistStyle: CSSProperties = {
  position: 'absolute',
  bottom: '100%',
  left: 12,
  marginBottom: 4,
  padding: '4px 0',
  background: 'var(--doc-surface, white)',
  border: '1px solid var(--doc-border, #ddd)',
  borderRadius: 6,
  boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
  minWidth: 180,
  zIndex: 50,
  display: 'flex',
  flexDirection: 'column',
};
const checklistItemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 14px',
  fontSize: 13,
  color: 'var(--doc-text-on-surface, #1f2937)',
  cursor: 'pointer',
};

const zoomMenuStyle: CSSProperties = {
  position: 'absolute',
  bottom: '100%',
  right: 0,
  marginBottom: 4,
  padding: '4px 0',
  background: 'var(--doc-surface, white)',
  border: '1px solid var(--doc-border, #ddd)',
  borderRadius: 6,
  boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
  minWidth: 96,
  zIndex: 50,
  display: 'flex',
  flexDirection: 'column',
};

const zoomMenuItemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  padding: '5px 12px',
  fontSize: 12,
  border: 'none',
  background: 'transparent',
  color: 'var(--doc-text-on-surface, #1f2937)',
  cursor: 'pointer',
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
};

const zoomMenuItemActiveStyle: CSSProperties = {
  ...zoomMenuItemStyle,
  background: 'var(--doc-bg-hover, #f1f3f4)',
  fontWeight: 500,
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
  docText,
  zoom,
  onZoomChange,
  minZoom = 0.25,
  maxZoom = 4,
  visible = true,
}: StatusBarProps) {
  // Preset popover state lives next to the trigger so the parent
  // doesn't need to know it exists. Closes on outside-click / Escape.
  const [presetsOpen, setPresetsOpen] = useState(false);
  const presetWrapRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!presetsOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!presetWrapRef.current?.contains(e.target as Node)) setPresetsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPresetsOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [presetsOpen]);

  // Status-bar customisation checklist (Excel-style right-click).
  // Both popover state and the dirty-flag prefs use hooks — they must
  // run BEFORE the `!visible` early return below, or React will see a
  // different hook order between visible and hidden renders.
  const { prefs, toggle } = useStatPrefs();
  const { t } = useTranslation();
  const [checklistOpen, setChecklistOpen] = useState(false);
  const checklistWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!checklistOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!checklistWrapRef.current?.contains(e.target as Node)) setChecklistOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setChecklistOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [checklistOpen]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setChecklistOpen(true);
  };

  // Early-return AFTER all hooks have run so React sees a stable hook
  // order. The derived zoom values are non-hook helpers so they sit
  // below the early-return guard.
  if (!visible) return null;
  const zoomPct = zoom !== undefined ? Math.round(zoom * 100) : 100;
  const zoomIn = () => onZoomChange?.(Math.min((zoom ?? 1) * ZOOM_STEP, maxZoom));
  const zoomOut = () => onZoomChange?.(Math.max((zoom ?? 1) / ZOOM_STEP, minZoom));
  const hasPages = totalPages !== undefined && totalPages > 0;

  return (
    <div
      role="status"
      aria-label="Document status"
      style={barStyle}
      data-testid="status-bar"
      onContextMenu={handleContextMenu}
    >
      {hasPages && prefs.page && (
        <>
          <span style={cellStyle} aria-label={`Page ${currentPage ?? 1} of ${totalPages}`}>
            Page {currentPage ?? 1} of {totalPages}
          </span>
          {((wordCount !== undefined && prefs.words) ||
            (charCount !== undefined && prefs.chars)) && <span style={dividerStyle} />}
        </>
      )}
      {wordCount !== undefined && prefs.words && (
        <span style={cellStyle} aria-label={`${wordCount} words`}>
          {formatCount(wordCount, 'word')}
        </span>
      )}
      {charCount !== undefined && prefs.chars && (
        <span style={cellStyle} aria-label={`${charCount} characters`}>
          {formatCount(charCount, 'character')}
        </span>
      )}
      {wordCount !== undefined &&
        wordCount > 0 &&
        prefs.readingTime &&
        (() => {
          const minutes = Math.max(1, Math.ceil(wordCount / 200));
          return (
            <span
              style={cellStyle}
              aria-label={t('statusBar.readingTimeAria', { minutes })}
              data-testid="status-reading-time"
            >
              {t('statusBar.readingTime', { minutes })}
            </span>
          );
        })()}
      {prefs.readability && docText && docText.length > 0 && <ReadabilityCell docText={docText} />}

      {/* Right-click customisation popover — Excel-style checklist for
          which counter cells to show. Mirrors the sibling Casual Sheets
          `use-statbar-prefs.ts`. */}
      {checklistOpen && (
        <div
          ref={checklistWrapRef}
          role="menu"
          aria-label="Status bar customisation"
          data-testid="statbar-checklist"
          style={checklistStyle}
        >
          {(Object.keys(STAT_LABELS) as StatKey[]).map((k) => (
            <label key={k} style={checklistItemStyle}>
              <input
                type="checkbox"
                checked={prefs[k]}
                onChange={() => toggle(k)}
                data-testid={`statbar-toggle-${k}`}
              />
              <span>{STAT_LABELS[k]}</span>
            </label>
          ))}
        </div>
      )}

      {/* Spacer pushes zoom to the right. */}
      <span style={{ flex: 1 }} />

      {onZoomChange && (
        <span style={cellStyle}>
          <Tooltip content="Zoom out (⌘−)">
            <button
              type="button"
              className="docx-status-zoom-btn"
              style={zoomButtonStyle}
              onClick={zoomOut}
              onMouseDown={(e) => e.preventDefault()}
              aria-label="Zoom out"
              disabled={(zoom ?? 1) <= minZoom + 1e-3}
            >
              <MaterialSymbol name="remove" size={14} />
            </button>
          </Tooltip>
          <span ref={presetWrapRef} style={{ position: 'relative' }}>
            <Tooltip content="Zoom presets (⌘0 to reset)">
              <button
                type="button"
                style={zoomReadoutStyle}
                onClick={() => setPresetsOpen((o) => !o)}
                onMouseDown={(e) => e.preventDefault()}
                aria-label={`Zoom: ${zoomPct} percent. Click to choose a preset.`}
                aria-haspopup="menu"
                aria-expanded={presetsOpen}
                data-testid="zoom-readout"
              >
                {zoomPct}%
              </button>
            </Tooltip>
            {presetsOpen && (
              <div
                role="menu"
                aria-label="Zoom presets"
                data-testid="zoom-presets-menu"
                style={zoomMenuStyle}
              >
                {ZOOM_PRESETS.map((preset) => {
                  const pct = Math.round(preset * 100);
                  const isActive = Math.abs(zoomPct - pct) < 1;
                  return (
                    <button
                      key={preset}
                      type="button"
                      role="menuitem"
                      style={isActive ? zoomMenuItemActiveStyle : zoomMenuItemStyle}
                      onClick={() => {
                        onZoomChange?.(preset);
                        setPresetsOpen(false);
                      }}
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      {pct}%{isActive && <span style={{ marginLeft: 8 }}>✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </span>
          <Tooltip content="Zoom in (⌘=)">
            <button
              type="button"
              className="docx-status-zoom-btn"
              style={zoomButtonStyle}
              onClick={zoomIn}
              onMouseDown={(e) => e.preventDefault()}
              aria-label="Zoom in"
              disabled={(zoom ?? 1) >= maxZoom - 1e-3}
            >
              <MaterialSymbol name="add" size={14} />
            </button>
          </Tooltip>
        </span>
      )}
    </div>
  );
}

/**
 * Compact readability cell — short label in the status bar plus a
 * tooltip with the full breakdown. Stats are memoised on the doc text
 * so large docs don't re-compute on every keystroke (the parent only
 * passes a fresh snapshot when the doc actually changes).
 */
function ReadabilityCell({ docText }: { docText: string }) {
  const { t } = useTranslation();
  const stats = useMemo(() => computeReadability(docText), [docText]);
  const compact = (() => {
    if (stats.gradeLevel == null) return t('statusBar.readabilityUnknown');
    return `${gradeLabel(stats.gradeLevel)}`;
  })();
  const detailLines: string[] = [
    `${stats.sentences} sentence${stats.sentences === 1 ? '' : 's'}`,
    `${stats.avgSentenceLength} words/sentence`,
  ];
  if (stats.longSentences > 0) {
    detailLines.push(
      `${stats.longSentences} long sentence${stats.longSentences === 1 ? '' : 's'} (> 25 words)`
    );
  }
  detailLines.push(`Reading time: ${formatReadingTime(stats.readingTimeMs)}`);
  if (stats.gradeLevel != null) {
    detailLines.push(`Flesch-Kincaid: ${stats.gradeLevel}`);
  }
  const detail = detailLines.join('\n');

  return (
    <Tooltip content={detail}>
      <span
        style={cellStyle}
        data-testid="status-readability"
        aria-label={`Readability: ${compact}. ${detail.replace(/\n/g, ', ')}`}
        tabIndex={0}
      >
        {compact}
      </span>
    </Tooltip>
  );
}
