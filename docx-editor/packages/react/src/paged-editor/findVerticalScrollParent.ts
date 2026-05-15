/**
 * Shared logic for locating the DOM element that vertically scrolls the paginated editor.
 * Used by scroll-to-position, arrow-key line navigation, and drag auto-scroll.
 */

/**
 * First ancestor of `el` with `overflow-y: auto|scroll` and scrollable overflow height.
 * Walk starts at `el.parentElement` (does not treat `el` itself as the scroller).
 *
 * @returns `null` when no such ancestor exists before `document.documentElement`.
 */
export function findVerticalScrollParent(el: HTMLElement): HTMLElement | null {
  let parent = el.parentElement;
  while (parent && parent !== document.documentElement) {
    const { overflowY } = getComputedStyle(parent);
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      parent.scrollHeight > parent.clientHeight + 1
    ) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

/**
 * Like {@link findVerticalScrollParent}, but falls back to `document.documentElement`
 * so callers always get a valid scroll target (matches legacy `scrollIntoView` root).
 */
export function findVerticalScrollParentOrRoot(el: HTMLElement): HTMLElement {
  return findVerticalScrollParent(el) ?? document.documentElement;
}
