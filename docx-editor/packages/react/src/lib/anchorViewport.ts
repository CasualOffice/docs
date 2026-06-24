/**
 * anchorViewport — shared math for "where can I float UI without
 * landing under fixed chrome".
 *
 * Right-dock panels (chat, writing assistant, version history, AI
 * suggestion) + the panel rail sit in the editor's flex row. When a
 * floating affordance (inline preview popover, selection Ask AI pill)
 * uses raw `window.innerWidth - VIEWPORT_PAD` as its clamp ceiling,
 * it can place itself ON TOP of those panels even though the doc
 * area itself is narrower. Result: the popover anchored to a
 * selection near the right edge of the doc lands behind the open
 * chat panel.
 *
 * `usableRightEdge(viewportPad)` returns the right-most viewport-x
 * the floater can safely use, accounting for every visible right-
 * dock panel by querying the DOM at place-time. Used by both the
 * preview popover and the selection pill so the math stays
 * consistent.
 */

const RIGHT_DOCK_SELECTORS: readonly string[] = [
  '[data-testid="chat-panel"]',
  '[data-testid="writing-assistant-sheet"]',
  '[data-testid="version-history-panel"]',
  '[data-testid="ai-suggestion-panel"]',
  '[data-testid="panel-rail"]',
];

/**
 * Sum the widths of every currently-visible right-dock surface. A
 * panel is considered "visible" when it has a non-null `offsetParent`
 * — covers the conditional-mount pattern we use AND the case where a
 * panel is hidden behind `display:none`.
 */
export function rightDockChromeWidth(): number {
  if (typeof document === 'undefined') return 0;
  let total = 0;
  for (const sel of RIGHT_DOCK_SELECTORS) {
    const nodes = document.querySelectorAll(sel);
    nodes.forEach((el) => {
      if (el instanceof HTMLElement && el.offsetParent !== null) {
        total += el.offsetWidth;
      }
    });
  }
  return total;
}

/**
 * Right-most viewport-x a floating UI can safely use without
 * overlapping a docked right-side panel. Pass the floater's own
 * width so callers can do `clamp(left, pad, usableRightEdge - width)`
 * in one go without subtracting twice.
 */
export function usableRightEdge(viewportPad: number): number {
  if (typeof window === 'undefined') return 0;
  return window.innerWidth - rightDockChromeWidth() - viewportPad;
}
