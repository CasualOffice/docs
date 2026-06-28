/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * GrammarSuggestionsMenu — the popup shown when the user right-clicks a
 * `.grammar-error` span. Sibling of `SpellSuggestionsMenu`, but a grammar issue
 * leads with an explanation (why it's flagged) above the suggested fix(es),
 * matching Google Docs. Closes on outside click + Escape; arrow keys + Enter
 * walk the fixes.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Z_INDEX } from '../styles/zIndex';

export interface GrammarSuggestionsMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  message: string;
  replacements: string[];
  onPick: (replacement: string) => void;
  onClose: () => void;
}

const menuStyle: CSSProperties = {
  position: 'fixed',
  minWidth: 240,
  maxWidth: 320,
  background: 'var(--doc-surface, white)',
  color: 'var(--doc-text-on-surface, #1f2937)',
  border: '1px solid var(--doc-border-light, #e0e0e0)',
  borderRadius: 8,
  boxShadow: 'var(--doc-shadow, 0 2px 10px rgba(0, 0, 0, 0.15))',
  zIndex: Z_INDEX.contextMenu,
  padding: '6px 0',
  overflow: 'hidden',
};

const messageStyle: CSSProperties = {
  padding: '6px 14px 8px',
  fontSize: 12,
  color: 'var(--doc-text-subtle, #6b7280)',
  lineHeight: 1.4,
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
  background: 'var(--doc-border-light, #e0e0e0)',
  margin: '4px 8px',
};

export function GrammarSuggestionsMenu({
  isOpen,
  position,
  message,
  replacements,
  onPick,
  onClose,
}: GrammarSuggestionsMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(0);

  // Focusable rows: each replacement, then "Dismiss".
  const rowCount = replacements.length + 1;

  useEffect(() => {
    if (isOpen) setHover(0);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e: MouseEvent): void => {
      if (!menuRef.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHover((h) => (h + 1) % rowCount);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHover((h) => (h - 1 + rowCount) % rowCount);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (hover < replacements.length) onPick(replacements[hover]);
        else onClose();
      }
    };
    // setTimeout(0) — the contextmenu event that opened us would otherwise
    // close us immediately via the mousedown listener.
    const timer = window.setTimeout(() => window.addEventListener('mousedown', onDown), 0);
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose, onPick, hover, rowCount, replacements]);

  const getStyle = useCallback((): CSSProperties => {
    const menuWidth = 280;
    const menuHeight = 40 + rowCount * 32 + 16;
    let x = position.x;
    let y = position.y;
    if (typeof window !== 'undefined') {
      if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10;
      if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10;
      x = Math.max(10, x);
      y = Math.max(10, y);
    }
    return { ...menuStyle, left: x, top: y };
  }, [position, rowCount]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Grammar suggestion"
      data-testid="grammar-suggestions-menu"
      style={getStyle()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div style={messageStyle}>{message}</div>
      {replacements.map((r, idx) => (
        <button
          key={r}
          type="button"
          role="menuitem"
          style={hover === idx ? itemHoverStyle : itemStyle}
          onMouseEnter={() => setHover(idx)}
          onClick={() => onPick(r)}
          data-testid={`grammar-suggestion-${idx}`}
        >
          <strong style={{ fontWeight: 600 }}>{r}</strong>
        </button>
      ))}
      <div style={dividerStyle} />
      <button
        type="button"
        role="menuitem"
        style={hover === replacements.length ? itemHoverStyle : itemStyle}
        onMouseEnter={() => setHover(replacements.length)}
        onClick={onClose}
        data-testid="grammar-dismiss"
      >
        Dismiss
      </button>
    </div>
  );
}

export default GrammarSuggestionsMenu;
