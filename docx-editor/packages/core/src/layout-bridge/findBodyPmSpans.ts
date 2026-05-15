/**
 * Body-scoped DOM lookups for `data-pm-start` / `data-pm-end` markers.
 *
 * Headers and footers are parsed via a separate ProseMirror document
 * (see `convertHeaderFooterToContent`), so HF runs end up with PM
 * positions that overlap body PM positions. Any container-level
 * `querySelector(...)` that doesn't restrict to `.layout-page-content`
 * will match both trees and produce wrong results: phantom selection
 * rectangles in headers, scroll-restore latching onto an HF span,
 * caret resolution returning an HF position, etc.
 *
 * These helpers centralize the body-only scope so call sites can't
 * forget the prefix. The match for HF lookups is `.layout-page-header`
 * / `.layout-page-footer`; HF call sites should write their own queries
 * scoped to those classes.
 */

const BODY_SCOPE = '.layout-page-content';

/**
 * All body-tree run spans carrying both `data-pm-start` and `data-pm-end`.
 *
 * This is the workhorse for caret resolution and selection-rect painting.
 */
export function findBodyPmSpans(container: ParentNode): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(`${BODY_SCOPE} span[data-pm-start][data-pm-end]`)
  );
}

/**
 * All body-tree empty-paragraph runs. Used as a caret fallback when a
 * paragraph has no painted text spans.
 */
export function findBodyEmptyRuns(container: ParentNode): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(`${BODY_SCOPE} .layout-empty-run`));
}

/**
 * All body-tree elements carrying a `data-pm-start` attribute.
 *
 * Includes paragraph elements as well as run spans, which is what scroll-
 * anchor recovery needs. Distinct from {@link findBodyPmSpans}, which
 * filters down to run spans only.
 */
export function findBodyPmAnchors(container: ParentNode): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(`${BODY_SCOPE} [data-pm-start]`));
}

/**
 * First body-tree element whose `data-pm-start` exactly matches `pmStart`.
 *
 * Used for scroll anchors and image `NodeSelection` resolution where the
 * caller already knows the exact PM position it wants to find. Returns
 * `null` for non-finite inputs so callers don't need to guard.
 */
export function findBodyPmAnchor(container: ParentNode, pmStart: number): HTMLElement | null {
  if (!Number.isFinite(pmStart)) return null;
  return container.querySelector<HTMLElement>(`${BODY_SCOPE} [data-pm-start="${pmStart}"]`);
}
