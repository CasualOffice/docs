/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Text Formatting Commands — thin re-exports from extension system
 *
 * Toggle marks, set marks, clear formatting, hyperlinks.
 * All implementations live in extensions/marks/; this file re-exports
 * for backward compatibility.
 */

import type { Command } from 'prosemirror-state';
import { singletonManager, schema } from '../schema';
import type { TextColorAttrs } from '../schema';

// Utility re-exports from markUtils (used by toolbar, conversion, etc.)
export {
  isMarkActive,
  getMarkAttr,
  clearFormatting,
  createSetMarkCommand,
  createRemoveMarkCommand,
} from '../extensions/marks/markUtils';

// Hyperlink query helpers (used by toolbar)
export {
  isHyperlinkActive,
  getHyperlinkAttrs,
  getSelectedText,
} from '../extensions/marks/HyperlinkExtension';

// ============================================================================
// PARAGRAPH DEFAULT FORMATTING HELPERS
// ============================================================================

/**
 * textFormattingToMarks — wraps markUtils version to use singleton schema
 */
import { textFormattingToMarks as _textFormattingToMarks } from '../extensions/marks/markUtils';
import type { TextFormatting } from '../../types/document';
import type { Mark } from 'prosemirror-model';

export function textFormattingToMarks(formatting: TextFormatting): Mark[] {
  return _textFormattingToMarks(formatting, schema);
}

// ============================================================================
// COMMANDS — delegated to singleton extension manager
// ============================================================================

const cmds = singletonManager.getCommands();

// Toggle marks (simple on/off)
export const toggleBold: Command = cmds.toggleBold();
export const toggleItalic: Command = cmds.toggleItalic();
export const toggleUnderline: Command = cmds.toggleUnderline();
export const toggleStrike: Command = cmds.toggleStrike();
export const toggleSuperscript: Command = cmds.toggleSuperscript();
export const toggleSubscript: Command = cmds.toggleSubscript();

// Set marks (with attributes)
export function setTextColor(attrs: TextColorAttrs): Command {
  return cmds.setTextColor(attrs);
}
export const clearTextColor: Command = cmds.clearTextColor();

export function setHighlight(color: string): Command {
  return cmds.setHighlight(color);
}
export const clearHighlight: Command = cmds.clearHighlight();

export function setFontSize(size: number): Command {
  return cmds.setFontSize(size);
}
export const clearFontSize: Command = cmds.clearFontSize();

export function setFontFamily(fontName: string): Command {
  return cmds.setFontFamily(fontName);
}
export const clearFontFamily: Command = cmds.clearFontFamily();

export function setUnderlineStyle(style: string, color?: TextColorAttrs): Command {
  return cmds.setUnderlineStyle(style, color);
}

// Character styling — smallCaps, allCaps, characterSpacing
// These marks have no dedicated commands in the extension yet; drive them via
// the generic toggleMark / createSetMarkCommand / createRemoveMarkCommand helpers.
import {
  toggleMark,
  createSetMarkCommand,
  createRemoveMarkCommand,
} from '../extensions/marks/markUtils';

export const toggleSmallCaps: Command = (state, dispatch, view) => {
  const markType = state.schema.marks['smallCaps'];
  if (!markType) return false;
  return toggleMark(markType)(state, dispatch, view);
};

export const toggleAllCaps: Command = (state, dispatch, view) => {
  const markType = state.schema.marks['allCaps'];
  if (!markType) return false;
  return toggleMark(markType)(state, dispatch, view);
};

/**
 * Toggle the `hidden` mark (w:vanish in OOXML) on the selection.
 * Hidden text remains in the document — visible in the editor as
 * dimmed + dotted-underline per HiddenExtension.toDOM — but is
 * conditionally suppressed by Word on print/export.
 */
export const toggleHidden: Command = (state, dispatch, view) => {
  const markType = state.schema.marks['hidden'];
  if (!markType) return false;
  return toggleMark(markType)(state, dispatch, view);
};

// Text effects — emboss / imprint / textShadow / textOutline. Each
// wraps the matching schema mark provided by TextEffectsExtensions.ts.
// The visual effect is CSS-driven (text-shadow, text-stroke); OOXML
// round-trip is handled by the existing parser/serializer pair.

export const toggleEmboss: Command = (state, dispatch, view) => {
  const markType = state.schema.marks['emboss'];
  if (!markType) return false;
  return toggleMark(markType)(state, dispatch, view);
};

export const toggleImprint: Command = (state, dispatch, view) => {
  const markType = state.schema.marks['imprint'];
  if (!markType) return false;
  return toggleMark(markType)(state, dispatch, view);
};

export const toggleTextShadow: Command = (state, dispatch, view) => {
  const markType = state.schema.marks['textShadow'];
  if (!markType) return false;
  return toggleMark(markType)(state, dispatch, view);
};

export const toggleTextOutline: Command = (state, dispatch, view) => {
  const markType = state.schema.marks['textOutline'];
  if (!markType) return false;
  return toggleMark(markType)(state, dispatch, view);
};

/** Set character spacing (letter-spacing) in twips. Pass 0 to remove. */
export function setCharacterSpacing(spacingTwips: number): Command {
  return (state, dispatch, view) => {
    const markType = state.schema.marks['characterSpacing'];
    if (!markType) return false;
    if (spacingTwips === 0) {
      return createRemoveMarkCommand(markType)(state, dispatch, view);
    }
    return createSetMarkCommand(markType, { spacing: spacingTwips })(state, dispatch, view);
  };
}

/**
 * Set all four character-spacing mark attrs in a single transaction
 * (spacing/position/scale/kerning). Used by the Character Spacing dialog
 * so toggling one field doesn't clobber the others. Pass null for any
 * field to clear it; if every field is null the mark is removed.
 */
export interface CharacterAttrs {
  /** twips, w:spacing */
  spacing: number | null;
  /** half-points, w:position */
  position: number | null;
  /** percentage, w:w */
  scale: number | null;
  /** half-points, w:kern */
  kerning: number | null;
}

export function setCharacterAttrs(attrs: CharacterAttrs): Command {
  return (state, dispatch, view) => {
    const markType = state.schema.marks['characterSpacing'];
    if (!markType) return false;
    const allEmpty =
      attrs.spacing == null &&
      attrs.position == null &&
      attrs.scale == null &&
      attrs.kerning == null;
    if (allEmpty) {
      return createRemoveMarkCommand(markType)(state, dispatch, view);
    }
    return createSetMarkCommand(markType, attrs as unknown as Record<string, unknown>)(
      state,
      dispatch,
      view
    );
  };
}

// Hyperlink commands
export function setHyperlink(href: string, tooltip?: string): Command {
  return cmds.setHyperlink(href, tooltip);
}
export const removeHyperlink: Command = cmds.removeHyperlink();

export function insertHyperlink(text: string, href: string, tooltip?: string): Command {
  return cmds.insertHyperlink(text, href, tooltip);
}
