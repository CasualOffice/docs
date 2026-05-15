/**
 * Integration test — paragraph themed shading resolves end-to-end.
 *
 * Covers the full display pipeline for paragraph backgrounds:
 *   Document model (w:shd themeFill=... themeFillTint=...)
 *     → toProseDoc (PM state)
 *     → toFlowBlocks (layout blocks with `attrs.shading` as CSS color)
 *
 * Regression guard: before unifying on resolveColorToHex, the layout-bridge
 * read `pmAttrs.shading?.fill?.rgb` directly and silently dropped themed fills.
 */

import { describe, test, expect } from 'bun:test';
import { toProseDoc } from '../../prosemirror/conversion/toProseDoc';
import { toFlowBlocks } from '../toFlowBlocks';
import type { Document, Paragraph, Theme } from '../../types/document';

const OFFICE_THEME: Theme = {
  colorScheme: {
    dk1: '000000',
    lt1: 'FFFFFF',
    dk2: '44546A',
    lt2: 'E7E6E6',
    accent1: '4472C4',
    accent2: 'ED7D31',
    accent3: 'A5A5A5',
    accent4: 'FFC000',
    accent5: '5B9BD5',
    accent6: '70AD47',
    hlink: '0563C1',
    folHlink: '954F72',
  },
};

function makeParagraph(shading?: Paragraph['formatting']): Paragraph {
  return {
    type: 'paragraph',
    formatting: shading,
    content: [],
  };
}

function makeDocument(paragraph: Paragraph, theme?: Theme): Document {
  return {
    package: {
      document: { content: [paragraph] },
      theme,
    },
  };
}

describe('toFlowBlocks — paragraph shading resolves theme colors', () => {
  test('rgb shading passes through', () => {
    const p = makeParagraph({ shading: { fill: { rgb: 'FFFF00' } } });
    const pmDoc = toProseDoc(makeDocument(p, OFFICE_THEME));
    const blocks = toFlowBlocks(pmDoc, { theme: OFFICE_THEME });
    const para = blocks.find((b) => b.kind === 'paragraph');
    expect(para?.attrs?.shading).toBe('#FFFF00');
  });

  test('themed fill with tint resolves to correct rgb', () => {
    // accent1 (#4472C4) with tint 0x33 (~20% keep) → near-white blue
    const p = makeParagraph({
      shading: { fill: { themeColor: 'accent1', themeTint: '33' } },
    });
    const pmDoc = toProseDoc(makeDocument(p, OFFICE_THEME));
    const blocks = toFlowBlocks(pmDoc, { theme: OFFICE_THEME });
    const para = blocks.find((b) => b.kind === 'paragraph');
    expect(para?.attrs?.shading).toBe('#DAE3F3');
  });

  test('themed fill with shade resolves to darkened rgb', () => {
    // background1 (lt1 = FFFFFF) with shade 0xF2 (~95% keep) → light gray
    const p = makeParagraph({
      shading: { fill: { themeColor: 'background1', themeShade: 'F2' } },
    });
    const pmDoc = toProseDoc(makeDocument(p, OFFICE_THEME));
    const blocks = toFlowBlocks(pmDoc, { theme: OFFICE_THEME });
    const para = blocks.find((b) => b.kind === 'paragraph');
    expect(para?.attrs?.shading).toBe('#F2F2F2');
  });

  test('themed fill without theme on flow-blocks side leaves shading unset', () => {
    const p = makeParagraph({
      shading: { fill: { themeColor: 'accent1', themeTint: '33' } },
    });
    const pmDoc = toProseDoc(makeDocument(p, OFFICE_THEME));
    // No theme passed to toFlowBlocks — simulates consumer forgetting to thread it.
    const blocks = toFlowBlocks(pmDoc);
    const para = blocks.find((b) => b.kind === 'paragraph');
    expect(para?.attrs?.shading).toBeUndefined();
  });

  test('auto fill is treated as transparent (no shading attr)', () => {
    const p = makeParagraph({ shading: { fill: { auto: true } } });
    const pmDoc = toProseDoc(makeDocument(p, OFFICE_THEME));
    const blocks = toFlowBlocks(pmDoc, { theme: OFFICE_THEME });
    const para = blocks.find((b) => b.kind === 'paragraph');
    expect(para?.attrs?.shading).toBeUndefined();
  });
});
