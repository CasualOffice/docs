/**
 * Image commands — thin re-exports from the extension system.
 *
 * Wrap-type transitions for floating images. Inline↔anchor conversions are
 * structural and live in a follow-up; this surface only covers anchor↔anchor.
 */

import type { Command } from 'prosemirror-state';
import { singletonManager } from '../schema';
import type {
  ImageLayoutTarget,
  SetImageWrapTypeOptions,
} from '../extensions/nodes/ImageExtension';

const cmds = singletonManager.getCommands();

/**
 * Change a floating image's wrap layout. `pos` is the PM document position of
 * the image node; `target` is either an OOXML wrap type (square / tight /
 * topAndBottom / behind / inFront / inline) or a directional convenience
 * choice (`squareLeft` / `squareRight`).
 *
 * `opts.initialPositionEmu` is used when promoting an inline image to an
 * anchor — the caller measures the image's current rendered offset relative
 * to the column origin in EMUs and passes it through, so the new float lands
 * exactly where the inline glyph used to sit (matches Word's behavior).
 */
export function setImageWrapType(
  pos: number,
  target: ImageLayoutTarget,
  opts?: SetImageWrapTypeOptions
): Command {
  return cmds.setImageWrapType(pos, target, opts);
}

export type {
  AnchorWrapType,
  ImageLayoutTarget,
  SetImageWrapTypeOptions,
} from '../extensions/nodes/ImageExtension';
