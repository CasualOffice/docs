/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Hyperlink Mark Extension
 */

import { createMarkExtension } from '../create';
import { isMarkActive } from './markUtils';
import type { HyperlinkAttrs } from '../../schema/marks';
import { Plugin, type Command, type EditorState } from 'prosemirror-state';
import type { ExtensionContext, ExtensionRuntime } from '../types';

/** A whole token is a URL: http(s):// or www. followed by non-space. */
const URL_TOKEN_RE = /^(?:https?:\/\/|www\.)[^\s]+$/i;
/** Normalise a bare `www.` URL to an absolute href. */
function toHref(url: string): string {
  return /^www\./i.test(url) ? `http://${url}` : url;
}

/**
 * Trim trailing characters that punctuate the surrounding sentence rather than
 * belong to the URL — so "see http://example.com." links the URL but not the
 * period, and "(http://example.com)" doesn't swallow the closing paren. Matches
 * the linkify convention used by Google Docs / GitHub / Slack: strip trailing
 * `.,;:!?` always, and a trailing `)]}` only when it has no matching opener in
 * the token (keeps balanced URLs like `…/Foo_(bar)` intact).
 */
function trimTrailingUrlPunct(url: string): string {
  let s = url;
  for (;;) {
    const next = s.replace(/[.,;:!?]+$/, '');
    const close = next[next.length - 1];
    if (close === ')' || close === ']' || close === '}') {
      const open = close === ')' ? '(' : close === ']' ? '[' : '{';
      const opens = next.split(open).length - 1;
      const closes = next.split(close).length - 1;
      if (closes > opens) {
        s = next.slice(0, -1);
        continue;
      }
    }
    if (next === s) return next;
    s = next;
  }
}

// ============================================================================
// HYPERLINK QUERY HELPERS (exported for toolbar)
// ============================================================================

export function isHyperlinkActive(state: EditorState): boolean {
  const hlType = state.schema.marks.hyperlink;
  if (!hlType) return false;
  return isMarkActive(state, hlType);
}

export function getHyperlinkAttrs(state: EditorState): { href: string; tooltip?: string } | null {
  const hlType = state.schema.marks.hyperlink;
  if (!hlType) return null;

  const { empty, $from, from, to } = state.selection;

  if (empty) {
    const marks = state.storedMarks || $from.marks();
    for (const mark of marks) {
      if (mark.type === hlType) {
        return { href: mark.attrs.href, tooltip: mark.attrs.tooltip };
      }
    }
    return null;
  }

  let attrs: { href: string; tooltip?: string } | null = null;
  state.doc.nodesBetween(from, to, (node) => {
    if (node.isText && attrs === null) {
      const mark = hlType.isInSet(node.marks);
      if (mark) {
        attrs = { href: mark.attrs.href, tooltip: mark.attrs.tooltip };
        return false;
      }
    }
    return true;
  });

  return attrs;
}

export function getSelectedText(state: EditorState): string {
  const { from, to, empty } = state.selection;
  if (empty) return '';
  return state.doc.textBetween(from, to, '');
}

// ============================================================================
// EXTENSION
// ============================================================================

export const HyperlinkExtension = createMarkExtension({
  name: 'hyperlink',
  schemaMarkName: 'hyperlink',
  markSpec: {
    attrs: {
      href: {},
      tooltip: { default: null },
      rId: { default: null },
    },
    inclusive: false,
    parseDOM: [
      {
        tag: 'a[href]',
        getAttrs: (dom) => {
          const element = dom as HTMLAnchorElement;
          return {
            href: element.getAttribute('href') || '',
            tooltip: element.getAttribute('title') || undefined,
          };
        },
      },
    ],
    toDOM(mark) {
      const attrs = mark.attrs as HyperlinkAttrs;
      const domAttrs: Record<string, string> = {
        href: attrs.href,
        target: '_blank',
        rel: 'noopener noreferrer',
      };
      if (attrs.tooltip) {
        domAttrs.title = attrs.tooltip;
      }
      return ['a', domAttrs, 0];
    },
  },
  onSchemaReady(ctx: ExtensionContext): ExtensionRuntime {
    const hlType = ctx.schema.marks.hyperlink;

    const setHyperlink = (href: string, tooltip?: string): Command => {
      return (state, dispatch) => {
        const { from, to, empty } = state.selection;

        if (empty) return false;

        if (dispatch) {
          const mark = hlType.create({ href, tooltip: tooltip || null });
          let tr = state.tr.addMark(from, to, mark);
          // Remove any explicit text color so the default hyperlink blue (#0563c1)
          // shows through, matching MS Word behavior
          const textColorType = state.schema.marks.textColor;
          if (textColorType) {
            tr = tr.removeMark(from, to, textColorType);
          }
          dispatch(tr.scrollIntoView());
        }

        return true;
      };
    };

    const removeHyperlink: Command = (state, dispatch) => {
      const { from, to, empty } = state.selection;

      if (empty) {
        const $pos = state.selection.$from;
        const marks = $pos.marks();
        const linkMark = marks.find((m) => m.type === hlType);

        if (!linkMark) return false;

        let start = $pos.pos;
        let end = $pos.pos;

        const parent = $pos.parent;
        parent.forEach((node, offset) => {
          if (node.isText) {
            const nodeStart = $pos.start() + offset;
            const nodeEnd = nodeStart + node.nodeSize;

            if (nodeStart <= $pos.pos && $pos.pos <= nodeEnd) {
              const hasLink = node.marks.some((m) => m.type === hlType);
              if (hasLink) {
                start = Math.min(start, nodeStart);
                end = Math.max(end, nodeEnd);
              }
            }
          }
        });

        if (dispatch) {
          dispatch(state.tr.removeMark(start, end, hlType).scrollIntoView());
        }
        return true;
      }

      if (dispatch) {
        dispatch(state.tr.removeMark(from, to, hlType).scrollIntoView());
      }

      return true;
    };

    const insertHyperlink = (text: string, href: string, tooltip?: string): Command => {
      return (state, dispatch) => {
        if (dispatch) {
          const mark = hlType.create({ href, tooltip: tooltip || null });
          const textNode = state.schema.text(text, [mark]);
          dispatch(state.tr.replaceSelectionWith(textNode, false).scrollIntoView());
        }
        return true;
      };
    };

    // Auto-link plugin: (1) typing a space/enter after a URL token wraps it in
    // a hyperlink (Word/GDocs autoformat); (2) pasting a bare URL over a
    // non-empty selection wraps the SELECTED text in a link to that URL
    // (Google Docs behaviour) instead of replacing it.
    const autoLinkPlugin = new Plugin({
      props: {
        handleTextInput(view, from, to, text) {
          // Trigger only on a space; the URL is the token immediately before.
          if (text !== ' ') return false;
          const { state } = view;
          const $from = state.doc.resolve(from);
          if (!$from.parent.isTextblock) return false;
          const before = state.doc.textBetween($from.start(), from, undefined, '￼');
          const m = before.match(/(\S+)$/);
          if (!m || !URL_TOKEN_RE.test(m[1])) return false;
          const token = m[1];
          // Link the URL but not the punctuation that ends the sentence around
          // it ("see http://x.com." → link drops the period).
          const linked = trimTrailingUrlPunct(token);
          if (!URL_TOKEN_RE.test(linked)) return false;
          const tokenStart = from - token.length;
          const linkEnd = tokenStart + linked.length;
          // Skip if the token is already (partly) linked.
          let alreadyLinked = false;
          state.doc.nodesBetween(tokenStart, from, (node) => {
            if (node.marks.some((mk) => mk.type === hlType)) alreadyLinked = true;
          });
          if (alreadyLinked) return false;
          const mark = hlType.create({ href: toHref(linked), tooltip: null });
          const tr = state.tr
            .insertText(text, from, to)
            .addMark(tokenStart, linkEnd, mark)
            .removeStoredMark(hlType); // don't carry the link onto further typing
          view.dispatch(tr);
          return true;
        },
        handlePaste(view, event) {
          const raw = event.clipboardData?.getData('text/plain')?.trim();
          if (!raw || /\s/.test(raw) || !URL_TOKEN_RE.test(raw)) return false;
          const { from, to, empty } = view.state.selection;
          if (empty) return false; // only wrap an existing selection
          const mark = hlType.create({ href: toHref(raw), tooltip: null });
          view.dispatch(view.state.tr.addMark(from, to, mark).scrollIntoView());
          return true; // handled — keep the selected text, just link it
        },
      },
    });

    return {
      commands: {
        setHyperlink,
        removeHyperlink: () => removeHyperlink,
        insertHyperlink,
      },
      plugins: [autoLinkPlugin],
    };
  },
});
