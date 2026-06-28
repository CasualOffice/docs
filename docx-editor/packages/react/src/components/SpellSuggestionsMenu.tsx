/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * SpellSuggestionsMenu — right-click context menu shown when the user
 * right-clicks on a `.spellcheck-error` overlay. Matches the Google
 * Docs / Word pattern: a few bolded suggestions on top, then "Ignore"
 * and a divider, then a "Add to dictionary" placeholder (deferred to
 * the persisted-dictionary milestone).
 *
 * Closes on outside click + Escape. Keyboard nav (Up/Down/Enter) lets
 * power users tab through suggestions without a mouse.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Z_INDEX } from '../styles/zIndex';

export interface SpellSuggestionsMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  word: string;
  suggestions: string[];
  onPick: (suggestion: string) => void;
  onIgnore: () => void;
  onClose: () => void;
}

const menuStyle: CSSProperties = {
  position: 'fixed',
  minWidth: 220,
  background: 'var(--doc-surface, white)',
  color: 'var(--doc-text-on-surface, #1f2937)',
  border: '1px solid var(--doc-border-light, #e0e0e0)',
  borderRadius: 8,
  boxShadow: 'var(--doc-shadow, 0 2px 10px rgba(0, 0, 0, 0.15))',
  zIndex: Z_INDEX.contextMenu,
  padding: '6px 0',
  overflow: 'hidden',
};

const headerStyle: CSSProperties = {
  padding: '4px 12px 6px',
  fontSize: 11,
  fontStyle: 'italic',
  color: 'var(--doc-text-subtle, #6b7280)',
  whiteSpace: 'nowrap',
};

const itemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  padding: '6px 14px',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 13,
  color: 'var(--doc-text-on-surface, #1f2937)',
  textAlign: 'left',
};

const itemHoverStyle: CSSProperties = {
  ...itemStyle,
  background: 'var(--doc-primary-light, #e8f0fe)',
};

const dividerStyle: CSSProperties = {
  height: 1,
  background: 'var(--doc-border, #e0e0e0)',
  margin: '4px 8px',
};

export function SpellSuggestionsMenu({
  isOpen,
  position,
  word,
  suggestions,
  onPick,
  onIgnore,
  onClose,
}: SpellSuggestionsMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(0);

  // `items` is the list of focusable rows in render order — suggestions
  // first, then "Ignore". Used by keyboard navigation.
  const items = [
    ...suggestions.map((s) => ({ kind: 'suggest' as const, value: s })),
    {
      kind: 'ignore' as const,
      value: word,
    },
  ];

  useEffect(() => {
    if (!isOpen) return;
    setHover(0);
  }, [isOpen]);

  const close = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHover((h) => (h + 1) % items.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHover((h) => (h - 1 + items.length) % items.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const it = items[hover];
        if (!it) return;
        if (it.kind === 'suggest') onPick(it.value);
        else onIgnore();
        close();
      }
    };
    // setTimeout(0) — the contextmenu event that opened us would
    // otherwise close us immediately via mousedown.
    const timer = window.setTimeout(() => {
      window.addEventListener('mousedown', onDown);
    }, 0);
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, close, hover, items, onPick, onIgnore]);

  const getStyle = useCallback((): CSSProperties => {
    const itemCount = items.length;
    const menuHeight = 28 + itemCount * 32 + 16;
    const menuWidth = 220;
    let x = position.x;
    let y = position.y;
    if (typeof window !== 'undefined') {
      if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10;
      if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10;
      if (x < 10) x = 10;
      if (y < 10) y = 10;
    }
    return { ...menuStyle, left: x, top: y };
  }, [position, items.length]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Spell-check suggestions"
      data-testid="spell-suggestions-menu"
      style={getStyle()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div style={headerStyle}>“{word}”</div>
      {suggestions.length === 0 && (
        <div style={{ ...itemStyle, color: 'var(--doc-text-subtle, #6b7280)' }}>No suggestions</div>
      )}
      {suggestions.map((s, idx) => (
        <button
          key={s}
          type="button"
          role="menuitem"
          style={hover === idx ? itemHoverStyle : itemStyle}
          onMouseEnter={() => setHover(idx)}
          onClick={() => {
            onPick(s);
            close();
          }}
          data-testid={`spell-suggestion-${idx}`}
        >
          <strong style={{ fontWeight: 600 }}>{s}</strong>
        </button>
      ))}
      <div style={dividerStyle} />
      <button
        type="button"
        role="menuitem"
        style={hover === suggestions.length ? itemHoverStyle : itemStyle}
        onMouseEnter={() => setHover(suggestions.length)}
        onClick={() => {
          onIgnore();
          close();
        }}
        data-testid="spell-ignore"
      >
        Ignore
      </button>
    </div>
  );
}

export default SpellSuggestionsMenu;
