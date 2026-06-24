/**
 * Selection State Utilities
 *
 * Extracts selection state from ProseMirror for toolbar integration.
 */

import type { EditorState } from 'prosemirror-state';
import type { Mark } from 'prosemirror-model';
import type { TextFormatting, ParagraphFormatting } from '../types/document';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Selection state for toolbar integration
 */
export interface SelectionState {
  /** Whether there's an active selection (not just cursor) */
  hasSelection: boolean;
  /** Whether selection spans multiple paragraphs */
  isMultiParagraph: boolean;
  /** Current text formatting at selection/cursor */
  textFormatting: TextFormatting;
  /** Current paragraph formatting */
  paragraphFormatting: ParagraphFormatting;
  /** Current paragraph style ID (e.g., 'Heading1', 'Normal') */
  styleId: string | null;
  /** Start paragraph index */
  startParagraphIndex: number;
  /** End paragraph index */
  endParagraphIndex: number;
}

// ============================================================================
// FUNCTIONS
// ============================================================================

/**
 * Boundary marks at a collapsed cursor: stored marks first, otherwise
 * the union of marks on `$from.nodeBefore` and `$from.nodeAfter`.
 * Deduped by type+attrs so the same mark from both sides doesn't show
 * twice. See the comment on the call site in extractSelectionState for
 * why a union rather than `$from.marks()` alone.
 */
function cursorBoundaryMarks(state: EditorState): readonly Mark[] {
  if (state.storedMarks) return state.storedMarks;
  const $from = state.selection.$from;
  const left = $from.nodeBefore?.marks ?? [];
  const right = $from.nodeAfter?.marks ?? [];
  if (right.length === 0) return left;
  if (left.length === 0) return right;
  const seen = new Set<string>();
  const out: Mark[] = [];
  for (const m of [...left, ...right]) {
    const key = m.type.name + JSON.stringify(m.attrs);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

/**
 * Intersection of marks across every text node in a non-empty range.
 * Returns the marks every covered character carries.
 */
function selectionRangeMarks(state: EditorState, from: number, to: number): readonly Mark[] {
  let intersection: Mark[] | null = null;
  state.doc.nodesBetween(from, to, (node) => {
    if (!node.isText) return true;
    if (intersection === null) {
      intersection = [...node.marks];
    } else {
      intersection = intersection.filter((m) => node.marks.some((n) => n.eq(m)));
    }
    return false;
  });
  return intersection ?? [];
}

/**
 * Extract selection state from editor state.
 * Used by PagedEditor integration in DocxEditor for toolbar state.
 */
export function extractSelectionState(state: EditorState): SelectionState | null {
  const { selection, doc } = state;
  const { from, to, empty } = selection;

  // Find containing paragraphs
  const $from = doc.resolve(from);

  // Get paragraph indices
  let startParagraphIndex = 0;
  let endParagraphIndex = 0;

  doc.forEach((_node, offset, index) => {
    if (offset <= from) {
      startParagraphIndex = index;
    }
    if (offset <= to) {
      endParagraphIndex = index;
    }
  });

  // Get current text formatting from marks at selection
  let textFormatting: TextFormatting = {};

  // Check paragraph for default text formatting (for empty paragraphs)
  const paragraph = $from.parent;
  const isEmptyParagraph =
    paragraph.type.name === 'paragraph' && paragraph.textContent.length === 0;
  const paragraphDefaultFormatting = paragraph.attrs?.defaultTextFormatting as
    | TextFormatting
    | undefined;

  // For empty selection (cursor): stored marks → union of marks on the
  // text nodes immediately before AND after the cursor. The union
  // matches Word + Google Docs' toolbar behaviour: cursor at the start
  // of a bold run lights the bold button (the bold run is `nodeAfter`),
  // and cursor at the end of a bold run keeps it lit (the bold run is
  // `nodeBefore`). PM's $from.marks() is left-leaning, so without the
  // nodeAfter union the start-of-bold case reads bold-inactive.
  //
  // For non-empty selections: walk every text node in the range and
  // intersect the marks. A formatting is "active" only when every
  // covered character carries it — so a selection that's half bold,
  // half plain shows bold-inactive (matching Word). This catches the
  // selectText('bold') + applyBold sequence: after addMark the
  // selection still covers all four characters of "bold", every text
  // node in range has the mark, and the toolbar lights up.
  const marks: readonly Mark[] = empty
    ? cursorBoundaryMarks(state)
    : selectionRangeMarks(state, from, to);

  // If in empty paragraph with no marks but has defaultTextFormatting, use that
  if (isEmptyParagraph && marks.length === 0 && paragraphDefaultFormatting) {
    textFormatting = { ...paragraphDefaultFormatting };
  }

  // Override with actual marks if present
  for (const mark of marks) {
    switch (mark.type.name) {
      case 'bold':
        textFormatting.bold = true;
        break;
      case 'italic':
        textFormatting.italic = true;
        break;
      case 'underline':
        textFormatting.underline = {
          style: mark.attrs.style || 'single',
          color: mark.attrs.color,
        };
        break;
      case 'strike':
        if (mark.attrs.double) {
          textFormatting.doubleStrike = true;
        } else {
          textFormatting.strike = true;
        }
        break;
      case 'textColor':
        textFormatting.color = {
          rgb: mark.attrs.rgb,
          themeColor: mark.attrs.themeColor,
        };
        break;
      case 'highlight':
        textFormatting.highlight = mark.attrs.color;
        break;
      case 'fontSize':
        textFormatting.fontSize = mark.attrs.size;
        break;
      case 'fontFamily':
        textFormatting.fontFamily = {
          ascii: mark.attrs.ascii,
          hAnsi: mark.attrs.hAnsi,
        };
        break;
      case 'superscript':
        textFormatting.vertAlign = 'superscript';
        break;
      case 'subscript':
        textFormatting.vertAlign = 'subscript';
        break;
      case 'smallCaps':
        textFormatting.smallCaps = true;
        break;
      case 'allCaps':
        textFormatting.allCaps = true;
        break;
      case 'hidden':
        textFormatting.hidden = true;
        break;
      case 'emboss':
        textFormatting.emboss = true;
        break;
      case 'imprint':
        textFormatting.imprint = true;
        break;
      case 'textShadow':
        textFormatting.shadow = true;
        break;
      case 'textOutline':
        textFormatting.outline = true;
        break;
    }
  }

  // Get paragraph formatting and styleId from current paragraph
  const paragraphFormatting: ParagraphFormatting = {};
  let styleId: string | null = null;

  if (paragraph.type.name === 'paragraph') {
    if (paragraph.attrs.alignment) {
      paragraphFormatting.alignment = paragraph.attrs.alignment;
    }
    if (paragraph.attrs.lineSpacing) {
      paragraphFormatting.lineSpacing = paragraph.attrs.lineSpacing;
      paragraphFormatting.lineSpacingRule = paragraph.attrs.lineSpacingRule;
    }
    if (paragraph.attrs.numPr) {
      paragraphFormatting.numPr = paragraph.attrs.numPr;
    }
    if (paragraph.attrs.indentLeft) {
      paragraphFormatting.indentLeft = paragraph.attrs.indentLeft;
    }
    if (paragraph.attrs.indentRight) {
      paragraphFormatting.indentRight = paragraph.attrs.indentRight;
    }
    if (paragraph.attrs.indentFirstLine) {
      paragraphFormatting.indentFirstLine = paragraph.attrs.indentFirstLine;
    }
    if (paragraph.attrs.hangingIndent) {
      paragraphFormatting.hangingIndent = paragraph.attrs.hangingIndent;
    }
    if (paragraph.attrs.tabs) {
      paragraphFormatting.tabs = paragraph.attrs.tabs;
    }
    if (paragraph.attrs.bidi) {
      paragraphFormatting.bidi = true;
    }
    if (paragraph.attrs.styleId) {
      styleId = paragraph.attrs.styleId;
    }
  }

  return {
    hasSelection: !empty,
    isMultiParagraph: startParagraphIndex !== endParagraphIndex,
    textFormatting,
    paragraphFormatting,
    styleId,
    startParagraphIndex,
    endParagraphIndex,
  };
}
