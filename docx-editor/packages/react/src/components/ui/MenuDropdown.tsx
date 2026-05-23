/**
 * MenuDropdown — a reusable dropdown menu with text label trigger
 *
 * Uses position:fixed so dropdowns escape overflow:auto/hidden ancestors.
 * Supports submenu panels that appear to the right on hover (Google Docs style).
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { MaterialSymbol } from './MaterialSymbol';
import { useMenuBar } from './MenuBarContext';

export interface MenuItem {
  icon?: string;
  label: string;
  shortcut?: string;
  onClick?: () => void;
  disabled?: boolean;
  /** Custom content to render instead of a simple menu item */
  customContent?: ReactNode;
  /** Submenu content that appears to the right on hover */
  submenuContent?: (closeMenu: () => void) => ReactNode;
}

export interface MenuSeparator {
  type: 'separator';
}

export type MenuEntry = MenuItem | MenuSeparator;

function isSeparator(entry: MenuEntry): entry is MenuSeparator {
  return 'type' in entry && entry.type === 'separator';
}

interface MenuDropdownProps {
  label: string;
  items: MenuEntry[];
  disabled?: boolean;
  /**
   * Stable id for this menu within a MenuBarProvider. When omitted, the
   * label is used. Needed so adjacent menus can hover-to-switch and so
   * ArrowLeft/Right keyboard nav can move between them.
   */
  id?: string;
}

const triggerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  padding: '2px 8px',
  border: 'none',
  background: 'transparent',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 400,
  color: 'var(--doc-text, #374151)',
  whiteSpace: 'nowrap',
  height: 28,
  lineHeight: '28px',
};

const triggerOpenStyle: CSSProperties = {
  ...triggerStyle,
  background: 'var(--doc-hover, #f3f4f6)',
};

const menuItemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 12px',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 13,
  color: 'var(--doc-text, #374151)',
  width: '100%',
  textAlign: 'left',
  whiteSpace: 'nowrap',
};

const menuItemDisabledStyle: CSSProperties = {
  ...menuItemStyle,
  opacity: 0.4,
  cursor: 'default',
};

const separatorStyle: CSSProperties = {
  height: 1,
  backgroundColor: 'var(--doc-border, #e5e7eb)',
  margin: '4px 0',
};

const shortcutStyle: CSSProperties = {
  marginLeft: 'auto',
  fontSize: 12,
  color: 'var(--doc-text-muted, #9ca3af)',
};

const submenuPanelStyle: CSSProperties = {
  position: 'absolute',
  left: '100%',
  top: -4,
  marginLeft: 2,
  backgroundColor: 'var(--doc-surface, white)',
  color: 'var(--doc-text-on-surface, #1f2937)',
  border: '1px solid var(--doc-border, #d1d5db)',
  borderRadius: 6,
  boxShadow: 'var(--doc-shadow, 0 4px 12px rgba(0, 0, 0, 0.12))',
  padding: 8,
  zIndex: 1001,
};

export function MenuDropdown({ label, items, disabled, id }: MenuDropdownProps) {
  // When inside a <MenuBarProvider>, isOpen is driven by the shared
  // openId so adjacent menus can hover-to-switch and one click swaps
  // between them. Outside a provider, this falls back to a local
  // boolean and the component keeps its old isolated behavior.
  const bar = useMenuBar();
  const menuId = id ?? label;
  const [localOpen, setLocalOpen] = useState(false);
  const isOpen = bar ? bar.openId === menuId : localOpen;
  const setIsOpen = useCallback(
    (next: boolean) => {
      if (bar) bar.setOpenId(next ? menuId : null);
      else setLocalOpen(next);
    },
    [bar, menuId]
  );

  const [hoveredSubmenu, setHoveredSubmenu] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });

  // Register this trigger with the menu bar so it can move keyboard
  // focus between menus (ArrowLeft / ArrowRight on a trigger).
  useEffect(() => {
    if (!bar) return;
    bar.registerTrigger(menuId, triggerRef.current);
    return () => bar.registerTrigger(menuId, null);
  }, [bar, menuId]);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    setHoveredSubmenu(null);
  }, [setIsOpen]);

  // Calculate position when opening
  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + 2, left: rect.left });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        closeMenu();
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        closeMenu();
        // Return focus to the trigger so keyboard users don't lose their place.
        triggerRef.current?.focus();
      }
    }

    // Arrow keys cycle through interactive menu items. Home/End jump to ends.
    function handleArrows(e: KeyboardEvent) {
      if (!dropdownRef.current) return;
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End')
        return;
      const buttons = Array.from(
        dropdownRef.current.querySelectorAll<HTMLButtonElement>('button:not([disabled])')
      );
      if (buttons.length === 0) return;
      const active = document.activeElement as HTMLElement | null;
      const idx = active ? buttons.indexOf(active as HTMLButtonElement) : -1;
      e.preventDefault();
      let next: number;
      if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = buttons.length - 1;
      else if (e.key === 'ArrowDown') next = idx < 0 ? 0 : (idx + 1) % buttons.length;
      else next = idx <= 0 ? buttons.length - 1 : idx - 1;
      buttons[next]?.focus();
    }

    // Close on scroll of any ancestor (dropdown position would be stale)
    function handleScroll() {
      closeMenu();
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    document.addEventListener('keydown', handleArrows);
    window.addEventListener('scroll', handleScroll, true);
    // Intentionally NOT auto-focusing the first menu item on open.
    // Word and Google Docs don't paint a focus ring on the first item
    // when a menu is opened via mouse click — it only appears once the
    // user starts navigating with the keyboard. The first ArrowDown
    // press inside handleArrows() above focuses item 0 from its `idx <
    // 0` branch, so keyboard accessibility is preserved.
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('keydown', handleArrows);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen, closeMenu]);

  const handleItemClick = (item: MenuItem) => {
    if (item.disabled || item.submenuContent) return;
    if (!item.onClick) return;
    item.onClick();
    closeMenu();
  };

  return (
    // position: relative scopes the dropdown's absolutely-positioned
    // children. The trigger sits at z-index above the open-menu backdrop
    // so clicks on adjacent triggers go directly through to them
    // (Word / Google Docs: one click swaps between menus, not two).
    <div style={{ position: 'relative', zIndex: isOpen ? 10000 : 1 }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onMouseEnter={() => {
          if (disabled || !bar) return;
          bar.hoverTrigger(menuId);
        }}
        onKeyDown={(e) => {
          if (!bar) return;
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            bar.moveFocus(menuId, 1);
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            bar.moveFocus(menuId, -1);
          }
        }}
        onMouseDown={(e) => e.preventDefault()}
        disabled={disabled}
        style={{
          ...(isOpen ? triggerOpenStyle : triggerStyle),
          position: 'relative',
          zIndex: 10001,
        }}
      >
        {label}
        <MaterialSymbol name="arrow_drop_down" size={16} />
      </button>

      {isOpen && (
        <>
          {/* Invisible backdrop — catches the WHOLE click cycle (down→up→click)
              so the underlying toolbar buttons (e.g. the numbered-list / TOC
              icon below the menu bar) don't fire when the user clicks away.
              Closing on mousedown alone wasn't enough: React's re-render
              removed the backdrop between mousedown and mouseup, so the
              click event then landed on whatever was underneath. Closing
              on click (and swallowing all three pointer events) keeps the
              backdrop alive for the full cycle. */}
          <div
            aria-hidden="true"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onMouseUp={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              closeMenu();
            }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9998,
              background: 'transparent',
              pointerEvents: 'auto',
            }}
          />
          <div
            ref={dropdownRef}
            style={{
              position: 'fixed',
              top: dropdownPos.top,
              left: dropdownPos.left,
              backgroundColor: 'var(--doc-surface, white)',
              color: 'var(--doc-text-on-surface, #1f2937)',
              border: '1px solid var(--doc-border, #d1d5db)',
              borderRadius: 6,
              boxShadow: 'var(--doc-shadow, 0 4px 12px rgba(0, 0, 0, 0.12))',
              padding: '4px 0',
              zIndex: 9999,
              minWidth: 200,
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            {items.map((entry, i) => {
              if (isSeparator(entry)) {
                return <div key={`sep-${i}`} style={separatorStyle} />;
              }
              const item = entry;
              if (item.customContent) {
                return (
                  <div key={item.label} onMouseDown={(e) => e.preventDefault()}>
                    {item.customContent}
                  </div>
                );
              }

              const hasSubmenu = !!item.submenuContent;
              const isSubmenuOpen = hoveredSubmenu === item.label;

              return (
                <div
                  key={item.label}
                  style={{ position: 'relative' }}
                  onMouseEnter={() => hasSubmenu && setHoveredSubmenu(item.label)}
                  onMouseLeave={() => hasSubmenu && setHoveredSubmenu(null)}
                >
                  <button
                    type="button"
                    style={item.disabled ? menuItemDisabledStyle : menuItemStyle}
                    onClick={() => handleItemClick(item)}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseOver={(e) => {
                      if (!item.disabled) {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                          'var(--doc-hover, #f3f4f6)';
                      }
                    }}
                    onMouseOut={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                    }}
                    disabled={item.disabled}
                  >
                    {item.icon && <MaterialSymbol name={item.icon} size={18} />}
                    <span>{item.label}</span>
                    {item.shortcut && <span style={shortcutStyle}>{item.shortcut}</span>}
                    {hasSubmenu && (
                      <span style={{ marginLeft: 'auto' }}>
                        <MaterialSymbol name="keyboard_arrow_right" size={16} />
                      </span>
                    )}
                  </button>
                  {hasSubmenu && isSubmenuOpen && (
                    <div style={submenuPanelStyle} onMouseDown={(e) => e.preventDefault()}>
                      {item.submenuContent!(closeMenu)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
