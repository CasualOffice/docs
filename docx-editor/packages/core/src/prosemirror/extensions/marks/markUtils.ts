/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Shared mark utility functions
 *
 * setMark, removeMark, isMarkActive, getMarkAttr, marksToTextFormatting, textFormattingToMarks, clearFormatting
 */

import type { Command, EditorState, Transaction } from 'prosemirror-state';
import type { MarkType, Mark, ResolvedPos, Schema } from 'prosemirror-model';
import type { TextFormatting } from '../../../types/document';

type MarkAttrs = Record<string, unknown>;

// ============================================================================
// PARAGRAPH DEFAULT FORMATTING HELPERS
// ============================================================================

function marksToTextFormatting(marks: readonly Mark[]): TextFormatting {
  const formatting: TextFormatting = {};

  for (const mark of marks) {
    switch (mark.type.name) {
      case 'bold':
        formatting.bold = true;
        break;
      case 'italic':
        formatting.italic = true;
        break;
      case 'underline':
        formatting.underline = { style: mark.attrs.style || 'single' };
        break;
      case 'strike':
        formatting.strike = true;
        break;
      case 'textColor':
        formatting.color = mark.attrs;
        break;
      case 'highlight':
        formatting.highlight = mark.attrs.color;
        break;
      case 'fontSize':
        formatting.fontSize = mark.attrs.size;
        break;
      case 'fontFamily':
        formatting.fontFamily = {
          ascii: mark.attrs.ascii,
          hAnsi: mark.attrs.hAnsi,
        };
        break;
      case 'superscript':
        formatting.vertAlign = 'superscript';
        break;
      case 'subscript':
        formatting.vertAlign = 'subscript';
        break;
    }
  }

  return formatting;
}

/**
 * Mirror the cursor's stored marks into the paragraph's `defaultTextFormatting`
 * attr so an empty paragraph renders with the right caret height/font.
 *
 * IMPORTANT: callers must invoke this BEFORE `tr.setStoredMarks(...)`. The
 * `setNodeMarkup` step appended here clears `tr.storedMarks` (every step does —
 * see prosemirror-state Transaction.addStep), so stored marks must be set last.
 * Marks are passed in explicitly rather than read off `tr.storedMarks` for the
 * same reason.
 */
function saveStoredMarksToParagraph(
  state: EditorState,
  tr: Transaction,
  marks: readonly Mark[]
): Transaction {
  const { $from } = state.selection;
  const paragraph = $from.parent;

  if (paragraph.type.name !== 'paragraph') return tr;
  if (paragraph.textContent.length > 0) return tr;

  if (marks.length === 0) {
    return tr.setNodeMarkup($from.before(), undefined, {
      ...paragraph.attrs,
      defaultTextFormatting: null,
    });
  }

  const defaultTextFormatting = marksToTextFormatting(marks);

  return tr.setNodeMarkup($from.before(), undefined, {
    ...paragraph.attrs,
    defaultTextFormatting,
  });
}

// ============================================================================
// CORE MARK COMMANDS
// ============================================================================

/**
 * Apply a new stored-mark set at a collapsed cursor and mirror it into the
 * paragraph's defaultTextFormatting. Order matters: setNodeMarkup runs first
 * because every transform step clears tr.storedMarks, so setStoredMarks must
 * be the last mutation.
 */
function dispatchStoredMarks(
  state: EditorState,
  dispatch: (tr: Transaction) => void,
  marks: readonly Mark[]
): void {
  let tr = state.tr;
  tr = saveStoredMarksToParagraph(state, tr, marks);
  tr.setStoredMarks(marks);
  dispatch(tr);
}

/**
 * Resolve the effective "current" stored-mark set at a collapsed cursor.
 *
 * Priority: explicit storedMarks → $from.marks() → marks derived from the
 * paragraph's defaultTextFormatting. The last step matters for empty
 * paragraphs that inherit doc/style defaults (e.g. fontSize, fontFamily)
 * but have no inline content for $from.marks() to draw from — without it,
 * toggling bold on a fresh empty paragraph would silently strip the
 * inherited font defaults from defaultTextFormatting.
 */
function effectiveCursorMarks(state: EditorState): readonly Mark[] {
  if (state.storedMarks) return state.storedMarks;
  const $from = state.selection.$from;
  const fromMarks = $from.marks();
  if (fromMarks.length > 0) return fromMarks;
  const parent = $from.parent;
  if (parent.type.name !== 'paragraph') return fromMarks;
  if (parent.textContent.length > 0) return fromMarks;
  const dtf = parent.attrs.defaultTextFormatting as TextFormatting | null | undefined;
  if (!dtf) return fromMarks;
  return textFormattingToMarks(dtf, state.schema);
}

export function setMark(markType: MarkType, attrs: MarkAttrs): Command {
  return (state, dispatch) => {
    const { from, to, empty } = state.selection;
    const mark = markType.create(attrs);

    if (empty) {
      if (dispatch) {
        const current = effectiveCursorMarks(state);
        const sansType = markType.isInSet(current)
          ? current.filter((m) => m.type !== markType)
          : current;
        dispatchStoredMarks(state, dispatch, [...sansType, mark]);
      }
      return true;
    }

    if (dispatch) {
      dispatch(state.tr.addMark(from, to, mark).scrollIntoView());
    }
    return true;
  };
}

export function removeMark(markType: MarkType): Command {
  return (state, dispatch) => {
    const { from, to, empty } = state.selection;

    if (empty) {
      if (dispatch) {
        const next = effectiveCursorMarks(state).filter((m) => m.type !== markType);
        dispatchStoredMarks(state, dispatch, next);
      }
      return true;
    }

    if (dispatch) {
      dispatch(state.tr.removeMark(from, to, markType).scrollIntoView());
    }
    return true;
  };
}

/**
 * Toggle a mark with empty-paragraph defaultTextFormatting persistence.
 *
 * For non-collapsed selections this delegates to the standard
 * addMark/removeMark behaviour. For collapsed cursors it routes through
 * `setMark` / `removeMark` so the paragraph's `defaultTextFormatting`
 * attr stays in sync — the toolbar relies on that attr to light up bold/
 * italic/etc. after the user navigates away from an empty paragraph and
 * comes back.
 */
export function toggleMark(markType: MarkType, attrs: MarkAttrs = {}): Command {
  return (state, dispatch, view) => {
    const { from, to, empty } = state.selection;

    if (empty) {
      const current = effectiveCursorMarks(state);
      const isActive = markType.isInSet(current);
      if (isActive) {
        return removeMark(markType)(state, dispatch, view);
      }
      return setMark(markType, attrs)(state, dispatch, view);
    }

    // Non-empty selection: match prosemirror-commands.toggleMark semantics —
    // if every text node in the range already has the mark, remove it;
    // otherwise add it.
    let allHave = true;
    let anyText = false;
    state.doc.nodesBetween(from, to, (node) => {
      if (node.isText) {
        anyText = true;
        if (!markType.isInSet(node.marks)) {
          allHave = false;
          return false;
        }
      }
      return true;
    });

    if (dispatch) {
      const tr = state.tr;
      if (anyText && allHave) {
        tr.removeMark(from, to, markType);
      } else {
        tr.addMark(from, to, markType.create(attrs));
      }
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

/**
 * Union of marks on the text nodes immediately before and after a
 * cursor position. Used by `isMarkActive` / `getMarkAttr` so the
 * toolbar reports the formatting *adjacent* to a collapsed cursor,
 * not just the formatting of the LEFT text node.
 *
 * Why: PM's `$pos.marks()` returns the left-side text node's marks
 * (with inclusive adjustments). That makes the toolbar light up
 * correctly when the cursor sits *after* a bold word (left = bold)
 * but go dark when the cursor sits *before* a bold word (left =
 * plain, right = bold). Word + Google Docs both light the toolbar
 * up on either side of a formatted run, so we union both neighbors.
 *
 * Note this is intentionally not used by the storedMarks pipeline —
 * typing a character at the boundary still picks up the LEFT side
 * (matching Word's typing semantics, where typing before a bold word
 * produces plain text). Only the *display* path changes.
 */
function boundaryMarks($pos: ResolvedPos): readonly Mark[] {
  const before = $pos.nodeBefore;
  const after = $pos.nodeAfter;
  const left = before?.marks ?? [];
  const right = after?.marks ?? [];
  if (right.length === 0) return left;
  if (left.length === 0) return right;
  const out: Mark[] = [...left];
  for (const m of right) {
    if (!out.some((o) => o.eq(m))) out.push(m);
  }
  return out;
}

/**
 * Check if a mark is active in the current selection
 */
export function isMarkActive(
  state: EditorState,
  markType: MarkType,
  attrs?: Record<string, unknown>
): boolean {
  const { from, to, empty } = state.selection;

  if (empty) {
    const marks = state.storedMarks || boundaryMarks(state.selection.$from);
    return marks.some((mark) => {
      if (mark.type !== markType) return false;
      if (!attrs) return true;
      return Object.entries(attrs).every(([key, value]) => mark.attrs[key] === value);
    });
  }

  let hasMark = false;
  state.doc.nodesBetween(from, to, (node) => {
    if (node.isText) {
      const mark = markType.isInSet(node.marks);
      if (mark) {
        if (!attrs) {
          hasMark = true;
          return false;
        }
        const attrsMatch = Object.entries(attrs).every(([key, value]) => mark.attrs[key] === value);
        if (attrsMatch) {
          hasMark = true;
          return false;
        }
      }
    }
    return true;
  });

  return hasMark;
}

/**
 * Get the current value of a mark attribute
 */
export function getMarkAttr(state: EditorState, markType: MarkType, attr: string): unknown | null {
  const { empty, $from, from, to } = state.selection;

  if (empty) {
    const marks = state.storedMarks || boundaryMarks($from);
    for (const mark of marks) {
      if (mark.type === markType) {
        return mark.attrs[attr];
      }
    }
    return null;
  }

  let value: unknown = null;
  state.doc.nodesBetween(from, to, (node) => {
    if (node.isText && value === null) {
      const mark = markType.isInSet(node.marks);
      if (mark) {
        value = mark.attrs[attr];
        return false;
      }
    }
    return true;
  });

  return value;
}

/**
 * Convert TextFormatting to marks array (used to restore formatting on empty paragraphs)
 */
export function textFormattingToMarks(formatting: TextFormatting, schema: Schema): Mark[] {
  const marks: Mark[] = [];

  if (formatting.bold) {
    marks.push(schema.marks.bold.create());
  }
  if (formatting.italic) {
    marks.push(schema.marks.italic.create());
  }
  if (formatting.underline) {
    marks.push(
      schema.marks.underline.create({
        style: formatting.underline.style || 'single',
        color: formatting.underline.color,
      })
    );
  }
  if (formatting.strike) {
    marks.push(schema.marks.strike.create());
  }
  if (formatting.doubleStrike) {
    marks.push(schema.marks.strike.create({ double: true }));
  }
  // Color: skip pure `auto` (no themeColor) — that's the doc-default
  // black and doesn't need a mark. But `auto + themeColor` carries
  // Word's theme-resolved intent and must survive the round-trip;
  // matches the gate in toProseDoc.ts. Forward `auto` so fromProseDoc
  // can write `<w:color w:val="auto" w:themeColor="..."/>` back.
  if (formatting.color && (!formatting.color.auto || formatting.color.themeColor)) {
    marks.push(
      schema.marks.textColor.create({
        rgb: formatting.color.rgb,
        themeColor: formatting.color.themeColor,
        themeTint: formatting.color.themeTint,
        themeShade: formatting.color.themeShade,
        auto: formatting.color.auto || null,
      })
    );
  }
  if (formatting.highlight) {
    marks.push(schema.marks.highlight.create({ color: formatting.highlight }));
  }
  if (formatting.fontSize) {
    marks.push(schema.marks.fontSize.create({ size: formatting.fontSize }));
  }
  if (formatting.fontFamily) {
    // OOXML carries up to four font-script categories (ascii / hAnsi /
    // eastAsia / cs) plus the matching `*Theme` references. Previously
    // we forwarded only ascii / hAnsi / asciiTheme — eastAsia + cs
    // (and the eastAsia/cs themes) were dropped at the boundary, so
    // East Asian fonts like DengXian round-tripped as Arial.
    marks.push(
      schema.marks.fontFamily.create({
        ascii: formatting.fontFamily.ascii,
        hAnsi: formatting.fontFamily.hAnsi,
        eastAsia: formatting.fontFamily.eastAsia,
        cs: formatting.fontFamily.cs,
        asciiTheme: formatting.fontFamily.asciiTheme,
        hAnsiTheme: formatting.fontFamily.hAnsiTheme,
        eastAsiaTheme: formatting.fontFamily.eastAsiaTheme,
        csTheme: formatting.fontFamily.csTheme,
      })
    );
  }
  if (formatting.vertAlign === 'superscript') {
    marks.push(schema.marks.superscript.create());
  }
  if (formatting.vertAlign === 'subscript') {
    marks.push(schema.marks.subscript.create());
  }

  return marks;
}

/**
 * Clear all text formatting (remove all marks)
 */
export const clearFormatting: Command = (state, dispatch) => {
  const { from, to, empty } = state.selection;

  if (empty) {
    if (dispatch) {
      dispatch(state.tr.setStoredMarks([]));
    }
    return true;
  }

  if (dispatch) {
    let tr = state.tr;

    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.isText && node.marks.length > 0) {
        const start = Math.max(from, pos);
        const end = Math.min(to, pos + node.nodeSize);
        for (const mark of node.marks) {
          tr = tr.removeMark(start, end, mark.type);
        }
      }
    });

    dispatch(tr.scrollIntoView());
  }

  return true;
};

/**
 * Create a command that sets a mark on the selection
 */
export function createSetMarkCommand(markType: MarkType, attrs?: Record<string, unknown>): Command {
  return setMark(markType, attrs || {});
}

/**
 * Create a command that removes a mark from the selection
 */
export function createRemoveMarkCommand(markType: MarkType): Command {
  return removeMark(markType);
}
