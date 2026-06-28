/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * FocusTrap — wraps a modal subtree and keeps Tab / Shift+Tab cycling
 * inside it. Restores focus to the previously-focused element on
 * unmount.
 *
 * Use inside every modal dialog so keyboard users can't escape to the
 * background content while the dialog is open. Pairs with
 * `aria-modal="true"` on the dialog's role="dialog" container — the
 * ARIA flag signals modality; this component enforces it.
 *
 * Behavior:
 *   - On mount: snapshots `document.activeElement` so it can be
 *     re-focused on unmount.
 *   - Focuses the first focusable descendant inside `children`, or the
 *     element matching `initialFocus` if provided.
 *   - Intercepts Tab / Shift+Tab keydowns: cycles within the focusable
 *     list inside the wrapper. Escape is not intercepted — dialogs
 *     handle that themselves.
 *   - On unmount: restores focus to the snapshot if it's still in the
 *     DOM.
 *
 * Out of scope for v1:
 *   - Inert-attribute backdrop. Modern browsers ignore Tab on
 *     `inert` subtrees, which would be simpler, but inert isn't
 *     universal yet. We do focus-cycle instead.
 *   - Per-dialog initial-focus heuristics. Callers can pass an
 *     `initialFocus` ref if the first focusable isn't the right
 *     element (e.g. a "Cancel" button shouldn't be auto-focused).
 */
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]:not([disabled])',
  'button:not([disabled])',
  'input:not([type="hidden"]):not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

export interface FocusTrapProps {
  /** Subtree to scope focus to. */
  children: ReactNode;
  /** When false, the trap is inactive (still renders children).
   *  Useful for dialogs that conditionally mount inside a sibling. */
  active?: boolean;
  /** Optional ref to focus on mount instead of the first focusable. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Optional class applied to the wrapper. */
  className?: string;
}

export function FocusTrap({ children, active = true, initialFocus, className }: FocusTrapProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!active) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    previousFocusRef.current = document.activeElement;

    // Defer initial focus by a microtask so the wrapper is fully in
    // the DOM (some callers mount FocusTrap conditionally in the same
    // commit that toggles the dialog visible).
    queueMicrotask(() => {
      if (!wrapperRef.current) return;
      if (initialFocus?.current) {
        initialFocus.current.focus();
        return;
      }
      const first = wrapperRef.current.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      first?.focus();
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const root = wrapperRef.current;
      if (!root) return;
      const focusables = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.hasAttribute('disabled') && el.offsetParent !== null
      );
      if (focusables.length === 0) {
        // Nothing to focus inside — let the browser handle Tab normally.
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;
      // Forward Tab past the last element wraps to the first; reverse
      // Tab past the first wraps to the last.
      if (e.shiftKey && (activeEl === first || !root.contains(activeEl))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // Restore focus to the prior element if it's still in the DOM.
      const prev = previousFocusRef.current as HTMLElement | null;
      if (prev && document.contains(prev)) {
        prev.focus();
      }
    };
  }, [active, initialFocus]);

  // `display: contents` removes this wrapper from the layout tree so
  // it doesn't break parent flex / grid centering (most modal dialogs
  // use a flex overlay to center their content). The ref still
  // resolves to a real DOM node so we can query focusable descendants;
  // the wrapper just doesn't render its own box.
  return (
    <div ref={wrapperRef} className={className} style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
