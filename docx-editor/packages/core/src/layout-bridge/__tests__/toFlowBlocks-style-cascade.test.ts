/**
 * End-to-end style cascade regression tests.
 *
 * Closes the verification gap on #412 by exercising the full pipeline
 *   Document model → toProseDoc → toFlowBlocks → painted RunFormatting
 * for properties that should inherit through the OOXML style cascade
 *   docDefaults → default style of type → resolved style (basedOn chain)
 *
 * Concrete scenarios covered:
 * - #392: rFonts.ascii on the Normal style reaches runs in paragraphs
 *   whose own style is `basedOn=Normal` and whose runs have no explicit
 *   fontFamily mark.
 * - Paragraph spacing.before / spaceAfter / lineSpacing cascade through
 *   docDefaults → default paragraph style → basedOn chain.
 * - Default character style (the one marked w:default="1") reaches runs
 *   without an explicit <w:rStyle> reference.
 */

import { describe, test, expect } from 'bun:test';
import { toProseDoc } from '../../prosemirror/conversion/toProseDoc';
import { toFlowBlocks } from '../toFlowBlocks';
import type { Document, Paragraph, StyleDefinitions } from '../../types/document';
import type { ParagraphBlock, TextRun } from '../../layout-engine/types';

function makeDoc(paragraph: Paragraph, styles?: StyleDefinitions): Document {
  return {
    package: {
      document: { content: [paragraph] },
      styles,
    },
  };
}

function firstParagraph(blocks: unknown[]): ParagraphBlock {
  return blocks.find((b) => (b as ParagraphBlock).kind === 'paragraph') as ParagraphBlock;
}

function firstRun(blocks: unknown[]): TextRun {
  const para = firstParagraph(blocks);
  return para.runs![0] as TextRun;
}

describe('end-to-end cascade — #392 rFonts inheritance', () => {
  test('rFonts.ascii on Normal style reaches runs through basedOn chain', () => {
    // Reproduces #392 fixture shape:
    //   Normal style sets rFonts.ascii = 'Arial Narrow'
    //   Clauses style has basedOn=Normal (parser flattens this into Clauses.rPr)
    //   Paragraph references Clauses; runs have no fontFamily mark.
    // Expected: painted run carries fontFamily='Arial Narrow'.
    //
    // The styleParser flattens basedOn at parse time, so we hand-write
    // the post-flatten Clauses.rPr (which already includes Normal's font).
    const styles: StyleDefinitions = {
      docDefaults: {
        rPr: { fontSize: 22 },
      },
      styles: [
        {
          styleId: 'Normal',
          type: 'paragraph',
          default: true,
          name: 'Normal',
          rPr: { fontFamily: { ascii: 'Arial Narrow', hAnsi: 'Arial Narrow' } },
        },
        {
          styleId: 'Clauses',
          type: 'paragraph',
          basedOn: 'Normal',
          name: 'Clauses',
          // post-basedOn-flatten the parser would have copied Normal's rPr here
          rPr: { fontFamily: { ascii: 'Arial Narrow', hAnsi: 'Arial Narrow' } },
        },
      ],
    };

    const paragraph: Paragraph = {
      type: 'paragraph',
      formatting: { styleId: 'Clauses' },
      content: [
        {
          type: 'run',
          // run with NO rPr.rFonts at all — should fully inherit
          content: [{ type: 'text', text: 'cláusula um' }],
        },
      ],
    };

    const pmDoc = toProseDoc(makeDoc(paragraph, styles), { styles });
    const blocks = toFlowBlocks(pmDoc, {});
    const run = firstRun(blocks);

    expect(run.fontFamily).toBe('Arial Narrow');
  });

  test('run with partial w:rFonts (eastAsia only) inherits ascii from style chain', () => {
    // Per ECMA-376 §17.3.2.27, missing ascii/hAnsi sides inherit from
    // the paragraph-style chain. Our parser sets only the sides that
    // appear in the run-level mark; missing sides should fall through
    // to paragraph default.
    const styles: StyleDefinitions = {
      styles: [
        {
          styleId: 'Normal',
          type: 'paragraph',
          default: true,
          name: 'Normal',
          rPr: { fontFamily: { ascii: 'Arial Narrow', hAnsi: 'Arial Narrow' } },
        },
      ],
    };

    const paragraph: Paragraph = {
      type: 'paragraph',
      formatting: { styleId: 'Normal' },
      content: [
        {
          type: 'run',
          formatting: {
            // ONLY eastAsia set — no ascii / no hAnsi
            fontFamily: { eastAsia: 'Calibri' },
          },
          content: [{ type: 'text', text: 'mixed' }],
        },
      ],
    };

    const pmDoc = toProseDoc(makeDoc(paragraph, styles), { styles });
    const blocks = toFlowBlocks(pmDoc, {});
    const run = firstRun(blocks);

    // The run inherits ascii from Normal's rPr — does NOT fall back to
    // the painter's hardcoded Calibri stack.
    expect(run.fontFamily).toBe('Arial Narrow');
  });
});

describe('end-to-end cascade — paragraph spacing through default style', () => {
  test('spaceBefore from docDefaults reaches paragraphs without inline spacing', () => {
    const styles: StyleDefinitions = {
      docDefaults: {
        pPr: { spaceBefore: 240, spaceAfter: 120 },
      },
      styles: [
        {
          styleId: 'Normal',
          type: 'paragraph',
          default: true,
          name: 'Normal',
        },
      ],
    };

    const paragraph: Paragraph = {
      type: 'paragraph',
      // no styleId, no inline spacing — pure inheritance
      content: [{ type: 'run', content: [{ type: 'text', text: 'text' }] }],
    };

    const pmDoc = toProseDoc(makeDoc(paragraph, styles), { styles });
    const blocks = toFlowBlocks(pmDoc, {});
    const para = firstParagraph(blocks);

    // attrs.spacing.before is in pixels (twipsToPixels). 240 twips = 16 px.
    expect(para.attrs?.spacing?.before).toBeCloseTo(16, 1);
    expect(para.attrs?.spacing?.after).toBeCloseTo(8, 1);
  });

  test('spaceBefore on Heading1 overrides docDefaults via basedOn=Normal', () => {
    const styles: StyleDefinitions = {
      docDefaults: {
        pPr: { spaceBefore: 0, spaceAfter: 120 },
      },
      styles: [
        {
          styleId: 'Normal',
          type: 'paragraph',
          default: true,
          name: 'Normal',
        },
        {
          styleId: 'Heading1',
          type: 'paragraph',
          basedOn: 'Normal',
          name: 'Heading 1',
          // post-basedOn-flatten
          pPr: { spaceBefore: 480, spaceAfter: 120 },
        },
      ],
    };

    const paragraph: Paragraph = {
      type: 'paragraph',
      formatting: { styleId: 'Heading1' },
      content: [{ type: 'run', content: [{ type: 'text', text: 'Heading' }] }],
    };

    const pmDoc = toProseDoc(makeDoc(paragraph, styles), { styles });
    const blocks = toFlowBlocks(pmDoc, {});
    const para = firstParagraph(blocks);

    // 480 twips = 32 px (Heading1 wins over docDefaults' 0)
    expect(para.attrs?.spacing?.before).toBeCloseTo(32, 1);
  });

  test('inline w:spacing overrides resolved-style spacing', () => {
    const styles: StyleDefinitions = {
      docDefaults: {
        pPr: { spaceBefore: 240, spaceAfter: 120 },
      },
      styles: [{ styleId: 'Normal', type: 'paragraph', default: true, name: 'Normal' }],
    };

    const paragraph: Paragraph = {
      type: 'paragraph',
      formatting: { spaceBefore: 1800 }, // 1800 twips = 120 px, overrides docDefaults
      content: [{ type: 'run', content: [{ type: 'text', text: 'text' }] }],
    };

    const pmDoc = toProseDoc(makeDoc(paragraph, styles), { styles });
    const blocks = toFlowBlocks(pmDoc, {});
    const para = firstParagraph(blocks);

    expect(para.attrs?.spacing?.before).toBeCloseTo(120, 1);
  });
});

describe('end-to-end cascade — default character style reaches runs', () => {
  test('default character style fontFamily applies to runs without rStyle', () => {
    // Mirrors many real Word docs: "Default Paragraph Font" / "FontePadrao"
    // exists with a default flag and no styleId on the run.
    const styles: StyleDefinitions = {
      docDefaults: { rPr: { fontSize: 22 } },
      styles: [
        {
          styleId: 'Normal',
          type: 'paragraph',
          default: true,
          name: 'Normal',
        },
        {
          styleId: 'FontePadrao',
          type: 'character',
          default: true,
          name: 'Default Paragraph Font',
          rPr: { fontFamily: { ascii: 'Cambria', hAnsi: 'Cambria' } },
        },
      ],
    };

    const paragraph: Paragraph = {
      type: 'paragraph',
      content: [{ type: 'run', content: [{ type: 'text', text: 'plain' }] }],
    };

    const pmDoc = toProseDoc(makeDoc(paragraph, styles), { styles });
    const blocks = toFlowBlocks(pmDoc, {});
    const run = firstRun(blocks);

    // Run with no <w:rStyle> still inherits the default character style.
    expect(run.fontFamily).toBe('Cambria');
  });
});
