/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

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
  // Internal padding (declared up-front so it factors into the auto-grow fit).
  const margins = block.margins ?? DEFAULT_TEXTBOX_MARGINS;
  const borderV = block.outlineWidth && block.outlineWidth > 0 ? 2 * block.outlineWidth : 0;
  // Whether the box holds any real (non-whitespace) text. Decorative divider
  // rules / spacers carry only empty paragraphs — they must keep their declared
  // height and clip (see 2fe0382), never grow or overflow into a black bar.
  const hasText = block.content.some((p) =>
    p.runs?.some((r) => r.kind === 'text' && r.text.trim() !== '')
  );
  // Height the box's text actually needs (box-sizing is border-box, so include
  // the vertical padding + border).
  const contentHeight =
    measure.innerMeasures.reduce((sum, m) => sum + (m?.totalHeight ?? 0), 0) +
    margins.top +
    margins.bottom +
    borderV;
  // The old fixed shape-height + overflow:hidden clipped trailing lines — e.g.
  // CJK SDS header boxes showed only their first line (the declared height was
  // ~one line short of the 2–3 line content). Match Word per the fit mode:
  //   • spAutoFit  → the box GROWS to fit its text (border/fill grow with it).
  //   • otherwise  → the box keeps its declared size and text OVERFLOWS visibly
  //                  (VML / Word default for a fixed-size text box).
  // Non-text boxes (dividers, spacers) are left exactly as before: declared
  // height, clipped, with the ≥1px clamp for sub-pixel filled rules.
  let paintedHeight =
    block.fillColor && fragment.height < 1 ? Math.max(fragment.height, 1) : fragment.height;
  let overflow = 'hidden';
  if (hasText) {
    if (block.autoFit === 'spAutoFit') {
      paintedHeight = Math.max(fragment.height, contentHeight);
    } else if (contentHeight > fragment.height) {
      overflow = 'visible';
    }
  }
  containerEl.style.height = `${paintedHeight}px`;
  containerEl.style.overflow = overflow;
  containerEl.style.boxSizing = 'border-box';
  if (fragment.zIndex !== undefined) {
    containerEl.style.zIndex = String(fragment.zIndex);
  }

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

  // Internal padding (margins resolved above for the auto-grow fit).
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
  if (block.anchor && !fragment.isAnchored) {
    const isParagraphH = !block.anchor.relFromH || block.anchor.relFromH === 'paragraph';
    const isParagraphV = !block.anchor.relFromV || block.anchor.relFromV === 'paragraph';
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
