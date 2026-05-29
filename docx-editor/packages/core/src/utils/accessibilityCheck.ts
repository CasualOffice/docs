/**
 * Accessibility checker — read-only analyzer over a ProseMirror document.
 *
 * Surfaces two classes of issue that screen readers + assistive tech care
 * about and that the user can fix in the editor:
 *
 *   - `missing-alt`: an `image` node whose `alt` attr is empty/null.
 *   - `heading-jump`: heading levels that skip a level in document order
 *     (e.g. H1 → H3 with no H2 between). Outline order matters for
 *     navigation.
 *
 * No schema changes; this is purely a walk over the current PM doc. The
 * dialog calls it on open and renders the results.
 */

import type { Node as PMNode } from 'prosemirror-model';
import { collectHeadings } from './headingCollector';

export type AccessibilityIssue =
  | {
      kind: 'missing-alt';
      /** PM position of the image node — used to jump the caret to it. */
      pmPos: number;
    }
  | {
      kind: 'heading-jump';
      /** PM position of the heading paragraph that jumps. */
      pmPos: number;
      /** The previous heading's level, 1-indexed (e.g. 1 for H1). */
      previousLevel: number;
      /** This heading's level, 1-indexed (e.g. 3 for H3). */
      level: number;
      /** Text of the heading, for display in the issue list. */
      text: string;
    };

export function checkAccessibility(doc: PMNode): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];

  // Images missing alt text.
  doc.descendants((node, pos) => {
    if (node.type.name === 'image') {
      const alt = (node.attrs.alt as string | null | undefined) ?? '';
      if (!alt.trim()) issues.push({ kind: 'missing-alt', pmPos: pos });
    }
    return true;
  });

  // Heading-order jumps — walk in document order and flag any level that
  // is more than one deeper than the previous level. (Going shallower is
  // fine; that's a normal section close.)
  const headings = collectHeadings(doc);
  let prevLevel: number | null = null;
  for (const h of headings) {
    if (prevLevel !== null && h.level > prevLevel + 1) {
      // headingCollector levels are 0-indexed (level 0 = H1); convert to
      // 1-indexed for the UI so the dialog can render "H1 → H3" directly.
      issues.push({
        kind: 'heading-jump',
        pmPos: h.pmPos,
        previousLevel: prevLevel + 1,
        level: h.level + 1,
        text: h.text,
      });
    }
    prevLevel = h.level;
  }

  return issues;
}
