/**
 * Unit tests for footnoteLayout helpers.
 *
 * Covers the style-cascade fix (P3 #40): the footnote-body default
 * font size should come from the document's resolved `FootnoteText`
 * style if one is defined, falling back to the 8pt baked-in default
 * otherwise. The two candidate style IDs Word writes are
 * `FootnoteText` (modern) and `footnote text` (legacy / Pages).
 */

import { describe, test, expect } from 'bun:test';
import type { ParagraphBlock, FlowBlock } from '../layout-engine/types';
import type { StyleDefinitions } from '../types/document';
import { applyFootnotePresentation } from './footnoteLayout';

function paragraph(text: string): ParagraphBlock {
  return {
    kind: 'paragraph',
    id: `p-${text}`,
    runs: [{ kind: 'text', text }],
  } as ParagraphBlock;
}

function firstRunFontSize(blocks: FlowBlock[]): number | undefined {
  const b = blocks[0];
  if (b?.kind !== 'paragraph') return undefined;
  const runs = (b as ParagraphBlock).runs;
  const r = runs[0];
  return r?.kind === 'text' || r?.kind === 'tab' ? r.fontSize : undefined;
}

describe('applyFootnotePresentation', () => {
  test('falls back to 8pt when no defaultFontSizePt is passed', () => {
    const out = applyFootnotePresentation([paragraph('body')], 1);
    // out[0].runs[0] is the prepended display-number run.
    expect(firstRunFontSize(out)).toBe(8);
  });

  test('honors the resolved defaultFontSizePt for the display-number run', () => {
    const out = applyFootnotePresentation([paragraph('body')], 1, 10);
    expect(firstRunFontSize(out)).toBe(10);
  });

  test('honors the resolved defaultFontSizePt for runs that omit fontSize', () => {
    const out = applyFootnotePresentation([paragraph('body')], 1, 9);
    const para = out[0] as ParagraphBlock;
    // After the display-number prepend, runs[1] is the original body run.
    const body = para.runs[1];
    expect(body.kind).toBe('text');
    if (body.kind === 'text') {
      expect(body.fontSize).toBe(9);
    }
  });

  test('does not override runs that already specify fontSize', () => {
    const para: ParagraphBlock = {
      kind: 'paragraph',
      id: 'p-explicit',
      runs: [{ kind: 'text', text: 'body', fontSize: 11 }],
    } as ParagraphBlock;
    const out = applyFootnotePresentation([para], 1, 7);
    const outPara = out[0] as ParagraphBlock;
    const body = outPara.runs[1];
    if (body.kind === 'text') {
      expect(body.fontSize).toBe(11);
    }
  });

  test('empty-input branch uses the resolved defaultFontSizePt', () => {
    const out = applyFootnotePresentation([], 3, 9);
    expect(firstRunFontSize(out)).toBe(9);
  });
});

// ============================================================================
// Style-cascade resolution (private helper, tested through the seam below)
// ============================================================================
//
// We can't import the private `resolveFootnoteFontSizePt` directly, so we
// drive it through `convertFootnoteToContent` by passing a minimal
// `StyleDefinitions` and reading the resolved size off the first run.
// `convertFootnoteToContent` requires a measureBlocks callback; a no-op
// that returns zero-height measures is enough for this assertion.

import { convertFootnoteToContent } from './footnoteLayout';
import type { Footnote } from '../types/document';

const NOOP_MEASURE = (blocks: FlowBlock[]) =>
  blocks.map((b) => {
    if (b.kind === 'paragraph') {
      return { kind: 'paragraph' as const, totalHeight: 0, lines: [] };
    }
    return { kind: 'paragraph' as const, totalHeight: 0, lines: [] };
  });

function emptyFootnote(): Footnote {
  return {
    type: 'footnote',
    id: 1,
    content: [
      // Single empty paragraph — enough to exercise the presentation
      // pipeline; the prepended display-number run is what we assert on.
      { type: 'paragraph', formatting: {}, content: [] } as unknown as Footnote['content'][0],
    ],
  };
}

function stylesWithFootnoteSize(styleId: string, halfPoints: number): StyleDefinitions {
  return {
    styles: [
      {
        styleId,
        type: 'paragraph',
        name: styleId,
        rPr: { fontSize: halfPoints },
      },
    ],
  } as unknown as StyleDefinitions;
}

describe('convertFootnoteToContent style cascade', () => {
  test('uses `FootnoteText` style fontSize when defined (half-points → points)', () => {
    const content = convertFootnoteToContent(emptyFootnote(), 1, 400, {
      styles: stylesWithFootnoteSize('FootnoteText', 20), // 20 half-points = 10pt
      measureBlocks: NOOP_MEASURE,
    });
    expect(firstRunFontSize(content.blocks)).toBe(10);
  });

  test('falls through to `footnote text` (legacy spelling) when `FootnoteText` is missing', () => {
    const content = convertFootnoteToContent(emptyFootnote(), 1, 400, {
      styles: stylesWithFootnoteSize('footnote text', 18), // 18 half-points = 9pt
      measureBlocks: NOOP_MEASURE,
    });
    expect(firstRunFontSize(content.blocks)).toBe(9);
  });

  test('falls back to 8pt when neither candidate style is defined', () => {
    const content = convertFootnoteToContent(emptyFootnote(), 1, 400, {
      styles: { styles: [] } as unknown as StyleDefinitions,
      measureBlocks: NOOP_MEASURE,
    });
    expect(firstRunFontSize(content.blocks)).toBe(8);
  });

  test('falls back to 8pt when no styles are provided at all', () => {
    const content = convertFootnoteToContent(emptyFootnote(), 1, 400, {
      measureBlocks: NOOP_MEASURE,
    });
    expect(firstRunFontSize(content.blocks)).toBe(8);
  });
});
