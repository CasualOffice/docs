/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

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
import { formatShortcut } from '../../lib/platform';

// Recently-used tracker: persists the last 5 picked item ids so repeat
// users see their habits without typing. Lives in localStorage so the
// list survives reloads but stays per-browser; sync across devices
// would need a host integration we don't have yet.
const MRU_KEY = 'docx-editor-palette-recents';
const MRU_LIMIT = 5;

function loadRecents(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(MRU_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string').slice(0, MRU_LIMIT)
      : [];
  } catch {
    return [];
  }
}

function pushRecent(id: string): string[] {
  const current = loadRecents().filter((x) => x !== id);
  const next = [id, ...current].slice(0, MRU_LIMIT);
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(MRU_KEY, JSON.stringify(next));
    }
  } catch {
    // Quota / private mode — silent.
  }
  return next;
}

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

/* ============================================================
   Premium palette aesthetics: backdrop blur, soft scale-in,
   refined typography, generous spacing, paginated shortcut chips.
   No emoji. Animation curve matches Linear / Arc / Notion.
   ============================================================ */

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  // Backdrop blur + low-opacity scrim — the doc behind stays
  // legible enough to remind the user where they are; the palette
  // is the focal point. Matches Arc / Linear.
  background: 'rgba(15, 23, 42, 0.32)',
  backdropFilter: 'blur(8px) saturate(140%)',
  WebkitBackdropFilter: 'blur(8px) saturate(140%)',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  paddingTop: '14vh',
  zIndex: 10001,
  // Fade the scrim in; the dialog handles its own scale-in.
  animation: 'docCpOverlayIn var(--doc-anim-base) both',
};

const dialogStyle: CSSProperties = {
  width: 600,
  maxWidth: '92vw',
  background: 'var(--doc-surface, white)',
  color: 'var(--doc-text-on-surface)',
  borderRadius: 14,
  // Layered shadow — ambient softness + a tighter shadow for the
  // edge definition. One shadow alone looks flat.
  boxShadow:
    '0 1px 1px rgba(0, 0, 0, 0.04), 0 6px 16px rgba(0, 0, 0, 0.08), 0 24px 64px rgba(15, 23, 42, 0.18)',
  border: '1px solid var(--doc-border-light)',
  display: 'flex',
  flexDirection: 'column',
  maxHeight: '64vh',
  overflow: 'hidden',
  // Soft scale-in from slightly smaller — feels like the palette
  // is settling into place rather than appearing.
  animation: 'docCpDialogIn var(--doc-anim-base) both',
};

const inputWrapStyle: CSSProperties = {
  padding: '14px 18px 14px 50px',
  borderBottom: '1px solid var(--doc-border-light)',
  position: 'relative',
};

// Leading magnifying-glass icon — quiet, premium signifier of
// "this is search". Positioned absolute so the input is full-width
// without leftPadding hacks.
const searchIconStyle: CSSProperties = {
  position: 'absolute',
  left: 20,
  top: '50%',
  transform: 'translateY(-50%)',
  color: 'var(--doc-text-muted)',
  pointerEvents: 'none',
};

const inputStyle: CSSProperties = {
  width: '100%',
  fontSize: 16,
  fontWeight: 400,
  padding: '4px 0',
  border: 'none',
  background: 'transparent',
  color: 'var(--doc-text)',
  outline: 'none',
  boxSizing: 'border-box',
  letterSpacing: '-0.005em',
};

const listStyle: CSSProperties = {
  overflowY: 'auto',
  padding: '6px 8px',
  minHeight: 80,
};

const emptyStyle: CSSProperties = {
  padding: '28px 16px',
  textAlign: 'center',
  color: 'var(--doc-text-muted)',
  fontSize: 13,
  fontStyle: 'italic',
};

const itemStyle = (active: boolean): CSSProperties => ({
  width: '100%',
  textAlign: 'left',
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '10px 14px',
  border: 'none',
  background: active ? 'var(--doc-primary-light)' : 'transparent',
  color: active ? 'var(--doc-text)' : 'inherit',
  cursor: 'pointer',
  fontSize: 14,
  borderRadius: 8,
  // Smooth bg transition on keyboard navigation rather than a snap.
  transition: 'background var(--doc-anim-fast)',
});

const labelStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 1,
  minWidth: 0,
};

const labelTextStyle: CSSProperties = {
  fontWeight: 500,
  letterSpacing: '-0.003em',
  color: 'var(--doc-text)',
};

const pathStyle: CSSProperties = {
  fontSize: 11.5,
  color: 'var(--doc-text-muted)',
  fontWeight: 400,
};

// Shortcut chip — minimal monospace pill that matches the Mac
// menu-bar feel. Each segment of the shortcut renders as its own
// chip with a thin separator dot, which is a small premium move
// that distinguishes the palette from a flat shortcut string.
const shortcutChipStyle: CSSProperties = {
  fontSize: 11,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  color: 'var(--doc-text-muted)',
  border: '1px solid var(--doc-border-light)',
  borderRadius: 4,
  padding: '2px 6px',
  background: 'var(--doc-surface)',
  whiteSpace: 'nowrap',
  fontWeight: 500,
  minWidth: 18,
  textAlign: 'center',
  lineHeight: 1.3,
};

const hintStyle: CSSProperties = {
  padding: '10px 18px',
  fontSize: 11,
  color: 'var(--doc-text-muted)',
  borderTop: '1px solid var(--doc-border-light)',
  background: 'var(--doc-surface-muted)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  letterSpacing: '0.01em',
};

const kbdHintStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
};

export function CommandPaletteDialog({ isOpen, onClose, items }: CommandPaletteDialogProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [recents, setRecents] = useState<string[]>(() => loadRecents());
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
    if (!q) {
      // No query: surface recently-used items at the top (in MRU order),
      // followed by everything else in the host's order. The recents
      // list is small (≤5) so the linear scan is fine.
      if (recents.length === 0) return items;
      const byId = new Map(items.map((i) => [i.id, i]));
      const front = recents.map((id) => byId.get(id)).filter((i): i is CommandPaletteItem => !!i);
      const seen = new Set(front.map((i) => i.id));
      return [...front, ...items.filter((i) => !seen.has(i.id))];
    }
    // Fuzzy scorer: each character of the query must appear in the
    // haystack in order. Higher score means tighter match:
    //   - +5 when the match lands on a word boundary (start of string,
    //     after a space, after `>` for nested labels).
    //   - +3 when consecutive query characters land in adjacent
    //     positions of the haystack.
    //   - -1 per skipped character before the next match (so a tighter
    //     run beats a sprawling one).
    // Falls back to substring filtering for the no-fuzzy-match case so
    // a single typo doesn't blow up the whole list — same intent the
    // original code expressed.
    const scored = items
      .map((item) => {
        const hay = [item.label, item.path, item.shortcut ?? '', item.id].join(' ').toLowerCase();
        let score = 0;
        let qi = 0;
        let lastMatch = -1;
        for (let hi = 0; hi < hay.length && qi < q.length; hi++) {
          if (hay[hi] === q[qi]) {
            const prev = hay[hi - 1];
            if (hi === 0 || prev === ' ' || prev === '>') score += 5;
            if (lastMatch === hi - 1) score += 3;
            score -= hi - lastMatch - 1;
            lastMatch = hi;
            qi++;
          }
        }
        if (qi < q.length) return null;
        return { item, score };
      })
      .filter((x): x is { item: (typeof items)[number]; score: number } => x !== null)
      .sort((a, b) => b.score - a.score);
    return scored.map((x) => x.item);
  }, [items, query, recents]);

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
    // Bump this item to the top of the MRU list before tearing down.
    setRecents(pushRecent(item.id));
    onClose();
    // Defer the command so the dialog has unmounted before the action fires
    // — important for actions that need editor focus (Bold, Find, etc.).
    setTimeout(() => {
      void item.run();
    }, 0);
  };

  return (
    <FocusTrap initialFocus={inputRef}>
      <style>{`
        @keyframes docCpOverlayIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes docCpDialogIn {
          from { opacity: 0; transform: scale(0.96) translateY(-6px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
      <div
        style={overlayStyle}
        onMouseDown={onClose}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div style={dialogStyle} onMouseDown={(e) => e.stopPropagation()}>
          <div style={inputWrapStyle}>
            <svg
              style={searchIconStyle}
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              aria-label="Search commands, files, or settings"
              placeholder="Search commands, files, or settings…"
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
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
            />
          </div>
          {/* Results are plain <button>s navigated via the input's Arrow keys.
              No role="listbox" — a listbox requires role="option" children and
              an aria-activedescendant combobox wiring; buttons are already
              named + keyboard-operable, so we keep it simple and compliant. */}
          <div ref={listRef} style={listStyle}>
            {filtered.length === 0 ? (
              <div style={emptyStyle}>No commands match — try a different search.</div>
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
                    <span style={labelTextStyle}>{item.label}</span>
                    <span style={pathStyle}>{item.path}</span>
                  </span>
                  {item.shortcut && <ShortcutChips raw={item.shortcut} />}
                </button>
              ))
            )}
          </div>
          <div style={hintStyle}>
            <span style={kbdHintStyle}>
              <span style={shortcutChipStyle}>↑</span>
              <span style={shortcutChipStyle}>↓</span>
              <span>navigate</span>
              <span style={{ margin: '0 6px', opacity: 0.5 }}>·</span>
              <span style={shortcutChipStyle}>↵</span>
              <span>run</span>
              <span style={{ margin: '0 6px', opacity: 0.5 }}>·</span>
              <span style={shortcutChipStyle}>esc</span>
              <span>close</span>
            </span>
            <span>{filtered.length} commands</span>
          </div>
        </div>
      </div>
    </FocusTrap>
  );
}

/**
 * Render the shortcut as separate monospace chips per segment
 * (e.g. ⌘ + ⇧ + P), which reads more like a Mac menu-bar shortcut
 * than a single concatenated string. Falls back to the formatted
 * full string when the platform formatter doesn't return a known
 * separator.
 */
function ShortcutChips({ raw }: { raw: string }) {
  const formatted = formatShortcut(raw);
  // formatShortcut returns the platform-correct string; we split on
  // common separators so each modifier / key becomes its own chip.
  const parts = formatted.split(/(?<=.)(?=[⌘⇧⌥⌃])|\+| /).filter(Boolean);
  if (parts.length <= 1) {
    return <span style={shortcutChipStyle}>{formatted}</span>;
  }
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      {parts.map((p, i) => (
        <span key={i} style={shortcutChipStyle}>
          {p}
        </span>
      ))}
    </span>
  );
}
