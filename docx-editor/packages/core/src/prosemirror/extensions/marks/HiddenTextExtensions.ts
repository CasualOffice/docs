/**
 * Run-level marks that don't fit the existing TextEffectsExtensions bucket:
 *
 * - `hidden` (w:vanish): hides the run from the visible layout. Word still
 *   keeps the text in the document and prints/exports it conditionally; the
 *   simplest WYSIWYG approximation is `display: none`.
 * - `rtl` (w:rtl): forces a single run to right-to-left independently of the
 *   paragraph direction. Rendered as `dir="rtl"`.
 * - `textEffect` (w:effect): legacy text animations (blink, ants, shimmer,
 *   sparkle). Browsers don't have a native equivalent; we apply distinctive
 *   class hooks so the host stylesheet can opt-in to animations or just
 *   visually mark the runs.
 */

import { createMarkExtension } from '../create';
import type { TextEffect } from '../../../types/formatting';

export const HiddenExtension = createMarkExtension({
  name: 'hidden',
  schemaMarkName: 'hidden',
  markSpec: {
    parseDOM: [{ tag: 'span.docx-hidden' }],
    toDOM() {
      // Word's editing view shows hidden text dimmed with a dotted underline
      // so it remains selectable. `display: none` would break cursor
      // navigation across the boundary; suppression on print/export is a
      // separate view-mode concern that the host can opt into via the
      // `docx-hidden` class hook.
      return [
        'span',
        { class: 'docx-hidden', style: 'opacity: 0.4; text-decoration: underline dotted' },
        0,
      ];
    },
  },
});

export const RtlExtension = createMarkExtension({
  name: 'rtl',
  schemaMarkName: 'rtl',
  markSpec: {
    parseDOM: [{ tag: 'span[dir=rtl].docx-rtl' }],
    toDOM() {
      return ['span', { class: 'docx-rtl', dir: 'rtl' }, 0];
    },
  },
});

export const TextEffectExtension = createMarkExtension({
  name: 'textEffect',
  schemaMarkName: 'textEffect',
  markSpec: {
    attrs: {
      effect: { default: 'blinkBackground' satisfies TextEffect },
    },
    parseDOM: [
      {
        tag: 'span.docx-text-effect',
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          // Reject the parse when the source span doesn't carry a valid
          // `data-effect`. Otherwise pasting any unrelated `<span>` from
          // external HTML would mint a `blinkBackground` mark.
          const effect = el.dataset.effect;
          if (
            effect === 'blinkBackground' ||
            effect === 'lights' ||
            effect === 'antsBlack' ||
            effect === 'antsRed' ||
            effect === 'shimmer' ||
            effect === 'sparkle'
          ) {
            return { effect };
          }
          return false;
        },
      },
    ],
    toDOM(mark) {
      const effect = mark.attrs.effect as TextEffect;
      return [
        'span',
        {
          class: `docx-text-effect docx-text-effect-${effect}`,
          'data-effect': effect,
        },
        0,
      ];
    },
  },
});
