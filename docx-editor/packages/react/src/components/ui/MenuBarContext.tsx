/**
 * MenuBarContext — shared open-state for a horizontal menu bar so
 * adjacent <MenuDropdown/> components can switch in a single click
 * (Word / Google Docs convention).
 *
 * Without this context, each MenuDropdown owns its own isOpen state
 * and they don't know about each other — switching menus took two
 * clicks (one to close the current, one to open the next), and
 * hovering an adjacent trigger while one was open didn't switch.
 *
 * Wrap a row of MenuDropdowns in <MenuBarProvider> to opt in. Outside
 * a provider, MenuDropdown falls back to its own local state and keeps
 * its existing isolated behavior.
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export interface MenuBarContextValue {
  /** Id of the currently-open menu within this bar, or null if none. */
  openId: string | null;
  /** Open the menu with the given id (closes any sibling). Pass null to close all. */
  setOpenId: (id: string | null) => void;
  /**
   * Called by a MenuDropdown trigger on hover. If a sibling is already open,
   * this acts like a click and switches. If nothing is open, it's a no-op
   * — hover alone shouldn't pop a menu on initial entry.
   */
  hoverTrigger: (id: string) => void;
  /** Move focus to the previous or next trigger element (ArrowLeft/Right). */
  moveFocus: (fromId: string, direction: -1 | 1) => void;
  /** Each MenuDropdown registers its trigger so arrow-key nav can move between them. */
  registerTrigger: (id: string, el: HTMLElement | null) => void;
}

const MenuBarContext = createContext<MenuBarContextValue | null>(null);

export function useMenuBar(): MenuBarContextValue | null {
  return useContext(MenuBarContext);
}

export interface MenuBarProviderProps {
  children: ReactNode;
}

export function MenuBarProvider({ children }: MenuBarProviderProps) {
  const [openId, setOpenIdState] = useState<string | null>(null);
  const triggersRef = useRef(new Map<string, HTMLElement>());

  const setOpenId = useCallback((id: string | null) => {
    setOpenIdState(id);
  }, []);

  const hoverTrigger = useCallback((id: string) => {
    // Only switch on hover when a different menu is already open.
    setOpenIdState((curr) => (curr !== null && curr !== id ? id : curr));
  }, []);

  const registerTrigger = useCallback((id: string, el: HTMLElement | null) => {
    if (el) triggersRef.current.set(id, el);
    else triggersRef.current.delete(id);
  }, []);

  const moveFocus = useCallback((fromId: string, direction: -1 | 1) => {
    const ids = Array.from(triggersRef.current.keys());
    const fromIdx = ids.indexOf(fromId);
    if (fromIdx < 0 || ids.length === 0) return;
    let nextIdx = fromIdx + direction;
    if (nextIdx < 0) nextIdx = ids.length - 1;
    if (nextIdx >= ids.length) nextIdx = 0;
    const targetId = ids[nextIdx];
    const el = triggersRef.current.get(targetId);
    el?.focus();
    // If a menu was open, switch the open menu along with focus.
    setOpenIdState((curr) => (curr !== null ? targetId : curr));
  }, []);

  const value = useMemo<MenuBarContextValue>(
    () => ({ openId, setOpenId, hoverTrigger, moveFocus, registerTrigger }),
    [openId, setOpenId, hoverTrigger, moveFocus, registerTrigger]
  );

  return <MenuBarContext.Provider value={value}>{children}</MenuBarContext.Provider>;
}
