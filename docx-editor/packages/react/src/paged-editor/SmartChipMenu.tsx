/**
 * Smart-chip menu — the caret-anchored popup that appears while an `@query`
 * trigger is active in the body (Google-Docs "@" menu). Detection lives in the
 * core `SmartChipExtension`; this component only renders the choices and routes
 * a selection back to the caller, which dispatches the actual insertion.
 *
 * Positioned in the same overlay-relative space as the caret (see
 * `CaretPosition`), so it tracks the cursor as the user keeps typing.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CaretPosition } from '@eigenpal/docx-core/layout-bridge';
import type { SmartChipTrigger } from '@eigenpal/docx-core/prosemirror';

export interface SmartChipMenuItem {
  /** Stable id for keys. */
  id: string;
  /** Label shown in the row. */
  label: string;
  /** Secondary hint (e.g. a preview of what gets inserted). */
  hint?: string;
  /** Inline SVG icon (24×24 viewBox, `currentColor` fill). */
  icon: React.ReactNode;
  /** Lowercase strings the `@query` is matched against. */
  keywords: string[];
  /** Invoked when the row is chosen. */
  onSelect: () => void;
}

interface SmartChipMenuProps {
  /** Active trigger, or null when no `@query` is open. */
  trigger: SmartChipTrigger | null;
  /** Caret position in overlay space; the menu anchors just below it. */
  caret: CaretPosition | null;
  /** Whether the editor body is focused (menu hides otherwise). */
  isFocused: boolean;
  /** Current zoom — caret coords are pre-zoom, the overlay is scaled. */
  zoom: number;
  /** The full menu (filtered by the trigger query before render). */
  items: SmartChipMenuItem[];
}

const ROW_HEIGHT = 34;

export function SmartChipMenu({
  trigger,
  caret,
  isFocused,
  zoom,
  items,
}: SmartChipMenuProps): React.ReactElement | null {
  const [active, setActive] = useState(0);
  // Suppress the menu for a trigger the user dismissed with Escape, until the
  // trigger position changes (i.e. they moved on or re-typed `@`).
  const dismissedFromRef = useRef<number | null>(null);

  const filtered = useMemo(() => {
    if (!trigger) return [];
    const q = trigger.query;
    if (!q) return items;
    return items.filter((it) => it.keywords.some((k) => k.includes(q)));
  }, [trigger, items]);

  // Reset the highlighted row whenever the candidate set changes.
  useEffect(() => {
    setActive(0);
  }, [trigger?.query, filtered.length]);

  const dismissed = trigger != null && dismissedFromRef.current === trigger.from;
  const open = isFocused && trigger != null && caret != null && filtered.length > 0 && !dismissed;

  // Keyboard: the hidden ProseMirror holds focus, so intercept navigation keys
  // at the window (capture phase) and stop them from reaching the editor.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setActive((i) => (i + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setActive((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        filtered[active]?.onSelect();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        dismissedFromRef.current = trigger?.from ?? null;
        // Force a re-render so `dismissed` recomputes and the menu hides.
        setActive((i) => i);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, filtered, active, trigger]);

  if (!open || !caret) return null;

  return (
    <div
      data-testid="smart-chip-menu"
      role="listbox"
      onMouseDown={(e) => {
        // Keep ProseMirror focus / selection — clicking a row must not move
        // the caret out of the `@query` before we replace it.
        e.preventDefault();
        e.stopPropagation();
      }}
      style={{
        position: 'absolute',
        left: caret.x * zoom,
        top: (caret.y + caret.height) * zoom + 4,
        minWidth: 200,
        background: '#fff',
        border: '1px solid #dadce0',
        borderRadius: 8,
        boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
        padding: '6px 0',
        zIndex: 220,
        fontSize: 13,
        color: '#202124',
      }}
    >
      {filtered.map((it, i) => (
        <button
          key={it.id}
          type="button"
          role="option"
          aria-selected={i === active}
          data-testid={`smart-chip-item-${it.id}`}
          onMouseEnter={() => setActive(i)}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            it.onSelect();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            width: '100%',
            height: ROW_HEIGHT,
            padding: '0 14px',
            border: 'none',
            background: i === active ? '#e8f0fe' : 'transparent',
            color: 'inherit',
            font: 'inherit',
            textAlign: 'left',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: 'inline-flex',
              width: 18,
              height: 18,
              color: '#5f6368',
              flexShrink: 0,
            }}
          >
            {it.icon}
          </span>
          <span style={{ flex: 1 }}>{it.label}</span>
          {it.hint && <span style={{ color: '#80868b', fontSize: 12 }}>{it.hint}</span>}
        </button>
      ))}
    </div>
  );
}
