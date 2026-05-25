/**
 * Command palette — fuzzy-searchable list of every menu action.
 * Triggered by Cmd/Ctrl+Shift+P.
 *
 * Mirrors the sibling Casual Sheets CommandSearchDialog: a single
 * search input + filtered results, each row showing label, menu path,
 * and shortcut. Arrow keys move, Enter runs, Esc closes.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { FocusTrap } from '../ui/FocusTrap';

export interface CommandPaletteItem {
  /** Stable key for React + tests. */
  id: string;
  /** What the user sees. */
  label: string;
  /** Menu breadcrumb shown next to the label (e.g. "File"). */
  path: string;
  /** Optional shortcut hint in the right-aligned slot. */
  shortcut?: string;
  /** Run the command. */
  run: () => void | Promise<void>;
}

export interface CommandPaletteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  items: CommandPaletteItem[];
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  paddingTop: '15vh',
  zIndex: 10001,
};

const dialogStyle: CSSProperties = {
  width: 560,
  maxWidth: '90vw',
  background: 'var(--doc-surface, white)',
  color: 'var(--doc-text-on-surface, #1f2937)',
  borderRadius: 10,
  boxShadow: 'var(--doc-shadow, 0 8px 24px rgba(0, 0, 0, 0.15))',
  border: '1px solid var(--doc-border, #e0e0e0)',
  display: 'flex',
  flexDirection: 'column',
  maxHeight: '70vh',
  overflow: 'hidden',
};

const inputWrapStyle: CSSProperties = {
  padding: 12,
  borderBottom: '1px solid var(--doc-border, #e0e0e0)',
};

const inputStyle: CSSProperties = {
  width: '100%',
  fontSize: 15,
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid var(--doc-border, #d1d5db)',
  background: 'var(--doc-bg-input, #f8f9fa)',
  color: 'var(--doc-text-on-surface, #1f2937)',
  outline: 'none',
  boxSizing: 'border-box',
};

const listStyle: CSSProperties = {
  overflowY: 'auto',
  padding: '4px 0',
  minHeight: 60,
};

const emptyStyle: CSSProperties = {
  padding: '24px 16px',
  textAlign: 'center',
  color: 'var(--doc-text-on-surface-muted, #6b7280)',
  fontSize: 13,
};

const itemStyle = (active: boolean): CSSProperties => ({
  width: '100%',
  textAlign: 'left',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '8px 14px',
  border: 'none',
  background: active ? 'var(--doc-bg-hover, #f1f3f4)' : 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  fontSize: 13,
});

const labelStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 2,
  minWidth: 0,
};

const pathStyle: CSSProperties = {
  fontSize: 11,
  color: 'var(--doc-text-on-surface-muted, #6b7280)',
};

const shortcutStyle: CSSProperties = {
  fontSize: 11,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  color: 'var(--doc-text-on-surface-muted, #6b7280)',
  border: '1px solid var(--doc-border, #d1d5db)',
  borderRadius: 4,
  padding: '1px 6px',
  background: 'var(--doc-bg-subtle, #f5f5f5)',
  whiteSpace: 'nowrap',
};

const hintStyle: CSSProperties = {
  padding: '8px 14px',
  fontSize: 11,
  color: 'var(--doc-text-on-surface-muted, #9ca3af)',
  borderTop: '1px solid var(--doc-border, #e0e0e0)',
  display: 'flex',
  justifyContent: 'space-between',
};

export function CommandPaletteDialog({ isOpen, onClose, items }: CommandPaletteDialogProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setActiveIndex(0);
    // Focus the input on next tick to defeat any focus competition.
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, [isOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const hay = [item.label, item.path, item.shortcut ?? '', item.id].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [items, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Scroll the active row into view when the keyboard changes selection.
  useEffect(() => {
    if (!isOpen) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-cp-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, isOpen]);

  if (!isOpen) return null;

  const currentIndex = filtered.length === 0 ? -1 : Math.min(activeIndex, filtered.length - 1);
  const current = currentIndex >= 0 ? filtered[currentIndex] : null;

  const run = async (item: CommandPaletteItem | null) => {
    if (!item) return;
    onClose();
    // Defer the command so the dialog has unmounted before the action fires
    // — important for actions that need editor focus (Bold, Find, etc.).
    setTimeout(() => {
      void item.run();
    }, 0);
  };

  return (
    <FocusTrap initialFocus={inputRef}>
      <div
        style={overlayStyle}
        onMouseDown={onClose}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div style={dialogStyle} onMouseDown={(e) => e.stopPropagation()}>
          <div style={inputWrapStyle}>
            <input
              ref={inputRef}
              type="text"
              placeholder="Type a command…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  if (filtered.length > 0)
                    setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  if (filtered.length > 0) setActiveIndex((i) => Math.max(i - 1, 0));
                } else if (e.key === 'Home') {
                  e.preventDefault();
                  setActiveIndex(0);
                } else if (e.key === 'End') {
                  e.preventDefault();
                  setActiveIndex(Math.max(0, filtered.length - 1));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  void run(current);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  onClose();
                }
              }}
              style={inputStyle}
              data-testid="command-palette-input"
            />
          </div>
          <div ref={listRef} style={listStyle} role="listbox">
            {filtered.length === 0 ? (
              <div style={emptyStyle}>No matching commands.</div>
            ) : (
              filtered.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  data-cp-index={index}
                  data-testid={`command-palette-item-${item.id}`}
                  style={itemStyle(index === currentIndex)}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void run(item)}
                >
                  <span style={labelStyle}>
                    <span>{item.label}</span>
                    <span style={pathStyle}>{item.path}</span>
                  </span>
                  {item.shortcut && <span style={shortcutStyle}>{item.shortcut}</span>}
                </button>
              ))
            )}
          </div>
          <div style={hintStyle}>
            <span>↑↓ navigate · ↵ run · Esc close</span>
            <span>{filtered.length} commands</span>
          </div>
        </div>
      </div>
    </FocusTrap>
  );
}
