import type { CSSProperties } from 'react';
import { Icon } from '@schnsrw/design-system';

export interface RulerProps {
  zoom?: number;
  pageWidthPx?: number;
  marginPaddingPx?: number;
  style?: CSSProperties;
}

const DEFAULT_PAGE_W = 816;
const DEFAULT_PAD = 84;

export function Ruler({
  zoom = 1,
  pageWidthPx = DEFAULT_PAGE_W,
  marginPaddingPx = DEFAULT_PAD,
  style,
}: RulerProps) {
  const inches = Math.round(pageWidthPx / 96);
  return (
    <div
      style={{
        height: 26,
        flex: '0 0 26px',
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-divider)',
        overflow: 'hidden',
        display: 'flex',
        justifyContent: 'center',
        ...style,
      }}
    >
      <div
        style={{
          position: 'relative',
          width: pageWidthPx * zoom,
          height: '100%',
          transform: `scale(${zoom})`,
          transformOrigin: 'top center',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 8,
            width: marginPaddingPx,
            height: 10,
            background: 'var(--color-surface-strip)',
            borderRadius: 2,
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 8,
            width: marginPaddingPx,
            height: 10,
            background: 'var(--color-surface-strip)',
            borderRadius: 2,
          }}
        />
        {Array.from({ length: inches + 1 }).map((_, i) => (
          <div key={i}>
            <span
              style={{
                position: 'absolute',
                left: i * 96,
                top: 6,
                width: 1,
                height: 14,
                background: 'var(--color-border-strong)',
              }}
            />
            {i > 0 && i < inches && (
              <span
                style={{
                  position: 'absolute',
                  left: i * 96 - 4,
                  top: 7,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  color: 'var(--color-text-muted)',
                }}
              >
                {i}
              </span>
            )}
          </div>
        ))}
        <span
          style={{
            position: 'absolute',
            left: marginPaddingPx - 4,
            top: 1,
            width: 0,
            height: 0,
            borderLeft: '4px solid transparent',
            borderRight: '4px solid transparent',
            borderTop: '6px solid var(--color-accent)',
          }}
        />
        <span
          style={{
            position: 'absolute',
            left: pageWidthPx - marginPaddingPx - 4,
            top: 1,
            width: 0,
            height: 0,
            borderLeft: '4px solid transparent',
            borderRight: '4px solid transparent',
            borderTop: '6px solid var(--color-accent)',
          }}
        />
      </div>
    </div>
  );
}

export interface EditorStatusBarProps {
  mode?: string;
  page?: number;
  pages?: number;
  /** Words in document or selection. */
  words?: number;
  /** Characters in document or selection. */
  chars?: number;
  language?: string;
  zoom?: number;
  onZoom?: (delta: number) => void;
  compact?: boolean;
  style?: CSSProperties;
}

export function EditorStatusBar({
  mode = 'Solo',
  page = 1,
  pages = 1,
  words = 0,
  chars = 0,
  language = 'English (US)',
  zoom = 1,
  onZoom,
  compact = false,
  style,
}: EditorStatusBarProps) {
  const z = Math.round(zoom * 100);
  return (
    <div
      style={{
        height: 'var(--statusbar-h)',
        flex: '0 0 var(--statusbar-h)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        background: 'var(--color-surface)',
        borderTop: '1px solid var(--color-divider)',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-xs)',
        color: 'var(--color-text-muted)',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            color: 'var(--color-success)',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--color-success)',
            }}
          />
          {mode}
        </span>
        {!compact && (
          <span>
            Page {page} of {pages}
          </span>
        )}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span>
          <strong style={{ color: 'var(--color-text)', fontWeight: 'var(--weight-semibold)' }}>
            {words.toLocaleString('en-US')}
          </strong>{' '}
          words
        </span>
        {!compact && (
          <span>
            <strong style={{ color: 'var(--color-text)', fontWeight: 'var(--weight-semibold)' }}>
              {chars.toLocaleString('en-US')}
            </strong>{' '}
            chars
          </span>
        )}
        {!compact && <span>{language}</span>}
        {onZoom && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            <ZoomBtn icon="remove" label="Zoom out" onClick={() => onZoom(-0.1)} />
            <span
              style={{
                minWidth: 34,
                textAlign: 'center',
                color: 'var(--color-text)',
                fontWeight: 'var(--weight-semibold)',
              }}
            >
              {z}%
            </span>
            <ZoomBtn icon="add" label="Zoom in" onClick={() => onZoom(0.1)} />
          </span>
        )}
      </div>
    </div>
  );
}

function ZoomBtn({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      style={{
        width: 20,
        height: 18,
        border: 0,
        borderRadius: 'var(--radius-sm)',
        background: 'transparent',
        cursor: 'pointer',
        color: 'var(--color-text-secondary)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={icon} size={15} />
    </button>
  );
}
