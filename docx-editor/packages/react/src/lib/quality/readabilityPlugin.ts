/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Long-sentence highlighter — ProseMirror decoration plugin.
 *
 * Walks each paragraph, tokenises into sentences via `.!?` boundaries,
 * and adds an `inline` Decoration over the range of any sentence whose
 * word count crosses our thresholds:
 *
 *   > 35 words → amber background (very long — break in two)
 *   > 25 words → yellow background (long — consider splitting)
 *
 * No PM doc mutation: decorations are a view-only overlay so the
 * OOXML round-trip is untouched. Toggleable from the host so users
 * who find it noisy can hide the highlights without losing the
 * status-bar readability stats.
 *
 * Activation: the host owns an `enabled` flag (persisted in
 * statbar-prefs alongside the readability stat). When false, the
 * plugin returns an empty DecorationSet so the cost stays at the
 * cheapest possible no-op.
 */

import { Plugin, PluginKey } from 'prosemirror-state';
import type { EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';

export const READABILITY_PLUGIN_KEY = new PluginKey<ReadabilityPluginState>(
  'docx-editor-readability'
);

interface ReadabilityPluginState {
  enabled: boolean;
  decorations: DecorationSet;
}

const LONG_SENTENCE_WORDS = 25;
const VERY_LONG_SENTENCE_WORDS = 35;

const LONG_STYLE = 'background-color: rgba(252, 211, 77, 0.32);';
const VERY_LONG_STYLE = 'background-color: rgba(251, 146, 60, 0.4);';

const WORD_RE = /\p{L}+(?:'\p{L}+)*/gu;

function wordCount(text: string): number {
  return text.match(WORD_RE)?.length ?? 0;
}

/**
 * Walk one paragraph's text node-by-node, tracking character offsets
 * inside the paragraph so we can map sentence boundaries (which we
 * detect on the joined text) back to PM positions.
 *
 * Returns the joined text + a `(charOffset → pmPos)` lookup so the
 * caller can reconstruct sentence ranges without re-walking the doc.
 */
function gatherParagraph(
  paraNode: PMNode,
  paraStart: number
): {
  text: string;
  offsetToPm: (off: number) => number;
} {
  let text = '';
  const segments: { start: number; pmPos: number; length: number }[] = [];
  paraNode.descendants((node, posInPara) => {
    if (node.isText) {
      const t = node.text ?? '';
      segments.push({ start: text.length, pmPos: paraStart + posInPara + 1, length: t.length });
      text += t;
      return false;
    }
    return true;
  });
  const offsetToPm = (off: number): number => {
    for (const seg of segments) {
      const segEnd = seg.start + seg.length;
      if (off >= seg.start && off <= segEnd) {
        return seg.pmPos + (off - seg.start);
      }
    }
    // Off past the last segment — return paragraph end.
    return paraStart + paraNode.nodeSize - 1;
  };
  return { text, offsetToPm };
}

function buildDecorations(state: EditorState, enabled: boolean): DecorationSet {
  if (!enabled) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'paragraph') return true;
    const { text, offsetToPm } = gatherParagraph(node, pos);
    if (!text.trim()) return false;
    // Sentence boundaries: walk `.!?` followed by whitespace or end.
    let cursor = 0;
    const sentenceRanges: { from: number; to: number; words: number }[] = [];
    const re = /[.!?]+(?=\s|$)/g;
    let match;
    while ((match = re.exec(text)) != null) {
      const end = match.index + match[0].length;
      const sentenceText = text.slice(cursor, end);
      const trimmedStart = cursor + (sentenceText.length - sentenceText.replace(/^\s+/, '').length);
      sentenceRanges.push({
        from: trimmedStart,
        to: end,
        words: wordCount(sentenceText),
      });
      cursor = end;
    }
    if (cursor < text.length) {
      const tail = text.slice(cursor);
      if (tail.trim()) {
        const trimmedStart = cursor + (tail.length - tail.replace(/^\s+/, '').length);
        sentenceRanges.push({
          from: trimmedStart,
          to: text.length,
          words: wordCount(tail),
        });
      }
    }
    for (const s of sentenceRanges) {
      if (s.words <= LONG_SENTENCE_WORDS) continue;
      const style = s.words > VERY_LONG_SENTENCE_WORDS ? VERY_LONG_STYLE : LONG_STYLE;
      const title =
        s.words > VERY_LONG_SENTENCE_WORDS
          ? `${s.words}-word sentence — consider breaking in two`
          : `${s.words}-word sentence — consider shortening`;
      const from = offsetToPm(s.from);
      const to = offsetToPm(s.to);
      if (to > from) {
        decorations.push(
          Decoration.inline(from, to, {
            style,
            title,
            class: 'docx-readability-long-sentence',
          })
        );
      }
    }
    return false; // don't descend into paragraph children
  });
  return DecorationSet.create(state.doc, decorations);
}

/**
 * Toggle the highlighter on/off without recreating the plugin.
 * Reflects the new state via a meta-tagged no-op transaction the
 * caller dispatches.
 */
export function readabilityPluginSetEnabled(enabled: boolean): { [k: string]: unknown } {
  return { [READABILITY_PLUGIN_KEY as unknown as string]: { enabled } };
}

export function readabilityPlugin(initialEnabled = true): Plugin<ReadabilityPluginState> {
  return new Plugin<ReadabilityPluginState>({
    key: READABILITY_PLUGIN_KEY,
    state: {
      init(_config, state) {
        return {
          enabled: initialEnabled,
          decorations: buildDecorations(state, initialEnabled),
        };
      },
      apply(tr, value, _oldState, newState) {
        const meta = tr.getMeta(READABILITY_PLUGIN_KEY) as { enabled?: boolean } | undefined;
        const nextEnabled = meta?.enabled != null ? meta.enabled : value.enabled;
        // Recompute decorations when the doc changes OR the enabled
        // flag flips. Mapping the prior set across `tr` would be
        // cheaper but ranges shift inside paragraphs as the user
        // types, and a stale yellow span on a now-short sentence is
        // worse than the recompute cost.
        if (tr.docChanged || nextEnabled !== value.enabled) {
          return {
            enabled: nextEnabled,
            decorations: buildDecorations(newState, nextEnabled),
          };
        }
        return value;
      },
    },
    props: {
      decorations(state) {
        return this.getState(state)?.decorations ?? DecorationSet.empty;
      },
    },
  });
}
