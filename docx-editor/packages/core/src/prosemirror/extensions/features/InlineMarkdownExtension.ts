/**
 * Inline-markdown autoformat — typing `*italic*` / `**bold**` applies the mark
 * (standard Markdown convention; `*` only — `_` is skipped to avoid snake_case
 * false positives). Fires on the closing `*`:
 *
 *   "**X*" + "*"  → bold X      (X is the 2nd closing's completion of `**X**`)
 *   "*X"  + "*"   → italic X    (opening `*` not preceded by another `*`)
 *
 * The inner text must start and end with a non-space, non-`*` character, so
 * `2 * 3` (spaced) and `** **` never trigger — matching Markdown's no-adjacent-
 * whitespace rule.
 */
import { Plugin } from 'prosemirror-state';
import { createExtension } from '../create';
import type { ExtensionContext, ExtensionRuntime } from '../types';

// Inner = one non-space-non-* char, optionally more non-* then a non-space-non-*.
const INNER = '[^*\\s](?:[^*]*[^*\\s])?';
const BOLD_RE = new RegExp(`\\*\\*(${INNER})\\*$`);
const ITALIC_RE = new RegExp(`(?:^|[^*])(\\*${INNER})$`);

export const InlineMarkdownExtension = createExtension({
  name: 'inlineMarkdown',
  onSchemaReady(ctx: ExtensionContext): ExtensionRuntime {
    const boldType = ctx.schema.marks.bold;
    const italicType = ctx.schema.marks.italic;

    const plugin = new Plugin({
      props: {
        handleTextInput(view, from, _to, text) {
          if (text !== '*') return false;
          const { state } = view;
          const $from = state.doc.resolve(from);
          if (!$from.parent.isTextblock) return false;
          const before = state.doc.textBetween($from.start(), from);

          // Bold first (it's a superset of the italic delimiter).
          const bold = boldType && BOLD_RE.exec(before);
          if (bold) {
            const inner = bold[1];
            const start = from - bold[0].length;
            const node = state.schema.text(inner, [boldType.create()]);
            view.dispatch(
              state.tr
                .delete(start, from)
                .insert(start, node)
                .removeStoredMark(boldType)
                .scrollIntoView()
            );
            return true;
          }

          const italic = italicType && ITALIC_RE.exec(before);
          if (italic) {
            const token = italic[1]; // `*X`
            const inner = token.slice(1);
            const start = from - token.length;
            const node = state.schema.text(inner, [italicType.create()]);
            view.dispatch(
              state.tr
                .delete(start, from)
                .insert(start, node)
                .removeStoredMark(italicType)
                .scrollIntoView()
            );
            return true;
          }
          return false;
        },
      },
    });

    return { plugins: [plugin] };
  },
});
