/**
 * Text Box Renderer
 *
 * Renders text box fragments to DOM. Handles:
 * - Background fill color
 * - Border/outline
 * - Internal padding (margins)
 * - Paragraph content inside the box (using pre-measured data)
 */

import {
  DEFAULT_TEXTBOX_MARGINS,
  type TextBoxFragment,
  type TextBoxBlock,
  type TextBoxMeasure,
} from '../layout-engine/types';
import type { RenderContext } from './renderPage';
import { renderParagraphFragment } from './renderParagraph';
import { emuToPixels } from '../utils/units';

/**
 * CSS class names for text box elements
 */
export const TEXTBOX_CLASS_NAMES = {
  textBox: 'layout-textbox',
};

/**
 * Options for rendering a text box fragment
 */
export interface RenderTextBoxFragmentOptions {
  document?: Document;
}

/**
 * Render a text box fragment to DOM
 */
export function renderTextBoxFragment(
  fragment: TextBoxFragment,
  block: TextBoxBlock,
  measure: TextBoxMeasure,
  context: RenderContext,
  options: RenderTextBoxFragmentOptions = {}
): HTMLElement {
  const doc = options.document ?? document;

  const containerEl = doc.createElement('div');
  containerEl.className = TEXTBOX_CLASS_NAMES.textBox;

  // Basic styling
  containerEl.style.position = 'absolute';
  containerEl.style.width = `${fragment.width}px`;
  containerEl.style.height = `${fragment.height}px`;
  containerEl.style.overflow = 'hidden';
  containerEl.style.boxSizing = 'border-box';

  // Fill color
  if (block.fillColor) {
    containerEl.style.backgroundColor = block.fillColor;
  }

  // Border/outline
  if (block.outlineWidth && block.outlineWidth > 0) {
    const style = block.outlineStyle || 'solid';
    const color = block.outlineColor || '#000000';
    containerEl.style.border = `${block.outlineWidth}px ${style} ${color}`;
  }

  // Internal padding
  const margins = block.margins ?? DEFAULT_TEXTBOX_MARGINS;
  containerEl.style.padding = `${margins.top}px ${margins.right}px ${margins.bottom}px ${margins.left}px`;

  // Anchored position — apply DrawingML wp:positionH/V offsets as a
  // CSS transform so the box visually moves from its cursor location
  // to its declared offset WITHOUT changing in-flow space. This
  // preserves pagination (the previous overlay-only attempt at
  // d8b85d1 dropped the in-flow space and shifted body text — see
  // TextBoxExtension.ts comment block referencing that regression).
  //
  // Scope: only honor paragraph-relative anchors (the default and
  // most common case). For page / margin / column anchors, doing a
  // translate from the in-flow origin would land the box at "wrong
  // place + offset" which is worse than the current "wrong place,
  // no offset" — wait for the hybrid cursor-reservation work before
  // touching those.
  if (block.anchor) {
    const isParagraphH =
      !block.anchor.relFromH || block.anchor.relFromH === 'paragraph';
    const isParagraphV =
      !block.anchor.relFromV || block.anchor.relFromV === 'paragraph';
    const dxPx =
      isParagraphH && typeof block.anchor.offsetH === 'number'
        ? emuToPixels(block.anchor.offsetH)
        : 0;
    const dyPx =
      isParagraphV && typeof block.anchor.offsetV === 'number'
        ? emuToPixels(block.anchor.offsetV)
        : 0;
    if (dxPx !== 0 || dyPx !== 0) {
      containerEl.style.transform = `translate(${dxPx}px, ${dyPx}px)`;
    }
  }

  // Store metadata
  containerEl.dataset.blockId = String(fragment.blockId);
  if (fragment.pmStart !== undefined) {
    containerEl.dataset.pmStart = String(fragment.pmStart);
  }
  if (fragment.pmEnd !== undefined) {
    containerEl.dataset.pmEnd = String(fragment.pmEnd);
  }

  // Render inner paragraph content using pre-measured data
  const innerWidth = fragment.width - margins.left - margins.right;
  let yOffset = 0;

  for (let i = 0; i < block.content.length; i++) {
    const paraBlock = block.content[i];
    const paraMeasure = measure.innerMeasures[i];
    if (!paraMeasure) continue;

    const paraFragment = {
      kind: 'paragraph' as const,
      blockId: paraBlock.id,
      x: 0,
      y: yOffset,
      width: innerWidth,
      height: paraMeasure.totalHeight,
      pmStart: paraBlock.pmStart,
      pmEnd: paraBlock.pmEnd,
      fromLine: 0,
      toLine: paraMeasure.lines.length,
    };

    // Pass `positioning: 'flow'` so the renderer's outer position is
    // explicit. `renderParagraphFragment` already defaults to `position:
    // relative` (it needs to be a containing block for floating images),
    // so passing 'flow' here is documentation more than behavior change —
    // pre-PR the textbox caller re-set the same `position: relative; top:
    // 0; left: 0` after the renderer call (#379).
    const paraEl = renderParagraphFragment(
      paraFragment,
      paraBlock,
      paraMeasure,
      { ...context, positioning: 'flow' },
      { document: doc }
    );

    containerEl.appendChild(paraEl);
    yOffset += paraMeasure.totalHeight;
  }

  return containerEl;
}
