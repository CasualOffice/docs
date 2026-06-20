/**
 * calculateChainHeight — a keepNext chain must reserve enough height to keep
 * the chain's paragraphs with the START of whatever they anchor to. The anchor
 * can be a table or image, not just a paragraph: a heading with keepNext above
 * a table is the common "table caption" case, and the chain height must include
 * the table's first row so the caption never orphans from its table.
 */
import { describe, expect, test } from 'bun:test';
import { calculateChainHeight, type KeepNextChain } from './keep-together';
import type {
  FlowBlock,
  Measure,
  ParagraphBlock,
  ParagraphMeasure,
  TableBlock,
  TableMeasure,
  ImageBlock,
  ImageMeasure,
} from './types';

function para(id: number, keepNext: boolean): ParagraphBlock {
  return {
    kind: 'paragraph',
    id,
    runs: [{ kind: 'text', text: 'x', pmStart: 0, pmEnd: 1 }],
    attrs: { keepNext },
    pmStart: 0,
    pmEnd: 2,
  };
}

function paraMeasure(lineHeight: number): ParagraphMeasure {
  return {
    kind: 'paragraph',
    lines: [
      {
        fromRun: 0,
        fromChar: 0,
        toRun: 0,
        toChar: 1,
        width: 10,
        ascent: 8,
        descent: 2,
        lineHeight,
      },
    ],
    totalHeight: lineHeight,
  };
}

describe('calculateChainHeight anchor handling', () => {
  test('table anchor contributes its first-row height (caption keeps with table)', () => {
    const blocks: FlowBlock[] = [
      para(0, true), // caption heading, keepNext
      { kind: 'table', id: 1, rows: [] } as unknown as TableBlock, // anchor: table
    ];
    const measures: Measure[] = [
      paraMeasure(24),
      {
        kind: 'table',
        rows: [{ height: 80 }, { height: 80 }],
        totalWidth: 400,
      } as unknown as TableMeasure,
    ];
    const chain: KeepNextChain = {
      startIndex: 0,
      endIndex: 0,
      memberIndices: [0],
      anchorIndex: 1,
    };

    // 24 (caption) + 80 (first table row) — NOT just 24 (the old bug ignored
    // the table entirely, letting the table orphan to the next page).
    expect(calculateChainHeight(chain, blocks, measures)).toBe(104);
  });

  test('image anchor contributes its full height (images are atomic)', () => {
    const blocks: FlowBlock[] = [
      para(0, true),
      { kind: 'image', id: 1, src: 'x' } as unknown as ImageBlock,
    ];
    const measures: Measure[] = [
      paraMeasure(24),
      { kind: 'image', width: 100, height: 150 } as unknown as ImageMeasure,
    ];
    const chain: KeepNextChain = {
      startIndex: 0,
      endIndex: 0,
      memberIndices: [0],
      anchorIndex: 1,
    };

    expect(calculateChainHeight(chain, blocks, measures)).toBe(174);
  });
});
