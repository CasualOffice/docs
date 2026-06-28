/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * A `relFromV="paragraph"` anchored textbox (e.g. a letterhead "Powered by:"
 * box that `convertParagraphWithTextBoxes` extracts into a sibling block
 * immediately after its empty source paragraph) must anchor to the TOP of that
 * paragraph — the same base the float-image path uses (`fragment.y`). The bug:
 * the engine used the post-paragraph `cursorY` (the paragraph BOTTOM) as the
 * base, pushing the box a paragraph-height too low and flipping it below a
 * sibling object that correctly anchored to the paragraph top
 * (medical-incident-form's Safetymint header).
 */

import { describe, test, expect } from 'bun:test';
import { layoutDocument } from '../index';
import type {
  FlowBlock,
  Measure,
  ParagraphBlock,
  ParagraphMeasure,
  TextBoxBlock,
  TextBoxMeasure,
  TextBoxFragment,
} from '../types';

const PAGE = { w: 816, h: 1056 };
const MARGINS = { top: 96, right: 96, bottom: 96, left: 96 };

function para(id: string, height: number): { block: ParagraphBlock; measure: ParagraphMeasure } {
  return {
    block: {
      kind: 'paragraph',
      id,
      pmStart: 0,
      pmEnd: 0,
      runs: [{ kind: 'text', text: id }],
      attrs: {},
    },
    measure: {
      kind: 'paragraph',
      lines: [
        {
          fromRun: 0,
          fromChar: 0,
          toRun: 0,
          toChar: 0,
          width: 100,
          ascent: 10,
          descent: 3,
          lineHeight: height,
        },
      ],
      totalHeight: height,
    },
  };
}

function anchoredTextBox(
  id: string,
  offsetV: number
): { block: TextBoxBlock; measure: TextBoxMeasure } {
  return {
    block: {
      kind: 'textBox',
      id,
      width: 200,
      height: 20,
      content: [],
      anchor: { relFromV: 'paragraph', offsetV, relFromH: 'column', offsetH: 0 },
      pmStart: 0,
      pmEnd: 0,
    },
    measure: { kind: 'textBox', width: 200, height: 20, innerMeasures: [] },
  };
}

describe('paragraph-anchored textbox base', () => {
  test('anchors to the source paragraph TOP, ordered by offsetV', () => {
    // An empty anchor paragraph (height 40), then two sibling textboxes that
    // both anchor relative to that paragraph at different vertical offsets.
    const P = para('anchor', 40);
    const top = anchoredTextBox('tb-top', 10);
    const bottom = anchoredTextBox('tb-bottom', 60);

    const blocks: FlowBlock[] = [P.block, top.block, bottom.block];
    const measures: Measure[] = [P.measure, top.measure, bottom.measure];

    const layout = layoutDocument(blocks, measures, { pageSize: PAGE, margins: MARGINS });
    const frags = layout.pages[0].fragments;

    const paraFrag = frags.find((f) => f.kind === 'paragraph')!;
    const tbTop = frags.find(
      (f) => f.kind === 'textBox' && (f as TextBoxFragment).blockId === 'tb-top'
    ) as TextBoxFragment;
    const tbBottom = frags.find(
      (f) => f.kind === 'textBox' && (f as TextBoxFragment).blockId === 'tb-bottom'
    ) as TextBoxFragment;

    // Base is the paragraph TOP (its fragment.y), not the post-paragraph cursor
    // (paragraph top + 40). Each box = paragraphTop + offsetV.
    expect(tbTop.y).toBeCloseTo(paraFrag.y + 10, 1);
    expect(tbBottom.y).toBeCloseTo(paraFrag.y + 60, 1);

    // Ordering preserved: smaller offsetV paints above larger.
    expect(tbTop.y).toBeLessThan(tbBottom.y);
  });

  test('falls back to the flow cursor when no paragraph precedes the box', () => {
    // A textbox with no preceding paragraph on the page keeps the cursor-based
    // base (no regression for the standalone / leading-shape case).
    const tb = anchoredTextBox('tb-lone', 30);
    const layout = layoutDocument([tb.block], [tb.measure], { pageSize: PAGE, margins: MARGINS });
    const frag = layout.pages[0].fragments.find((f) => f.kind === 'textBox') as TextBoxFragment;
    // cursor starts at top margin → base = margins.top → y = margins.top + 30.
    expect(frag.y).toBeCloseTo(MARGINS.top + 30, 1);
  });
});
