/**
 * Integration tests — run-level OOXML attributes survive the bridge.
 *
 * Regression guard for #410: `extractRunFormatting` had no `case` for several
 * run-level marks (`allCaps`, `smallCaps`, `position`, `horizontalScale`,
 * `kerning`, `characterSpacing`'s position/scale/kerning attrs), so painted
 * runs lost the values. The hidden ProseMirror toDOM rendered them correctly
 * — only the layout-painter pipeline silently dropped them.
 */

import { describe, test, expect } from 'bun:test';
import { Schema } from 'prosemirror-model';
import { toFlowBlocks } from '../toFlowBlocks';
import type { ParagraphBlock, TextRun } from '../../layout-engine/types';

// Minimal schema with the marks we exercise. Mirrors the actual ParagraphExtension
// + the marks added in #410's fix; we don't need the full StarterKit here.
const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: {
      content: 'inline*',
      group: 'block',
      attrs: {
        styleId: { default: null },
        defaultTextFormatting: { default: null },
      },
    },
    text: { group: 'inline' },
  },
  marks: {
    allCaps: {},
    smallCaps: {},
    emboss: {},
    imprint: {},
    textShadow: {},
    textOutline: {},
    emphasisMark: {
      attrs: { type: { default: 'dot' } },
    },
    characterSpacing: {
      attrs: {
        spacing: { default: null },
        position: { default: null },
        scale: { default: null },
        kerning: { default: null },
      },
    },
  },
});

function buildSingleRunDoc(text: string, markName: string, attrs?: Record<string, unknown>) {
  const mark = schema.marks[markName].create(attrs);
  const node = schema.text(text, [mark]);
  return schema.node('doc', null, [schema.node('paragraph', null, [node])]);
}

function firstRun(blocks: unknown[]): TextRun {
  const para = blocks.find((b) => (b as ParagraphBlock).kind === 'paragraph') as ParagraphBlock;
  return para.runs![0] as TextRun;
}

describe('toFlowBlocks — run-level marks reach RunFormatting (#410)', () => {
  test('allCaps mark sets formatting.allCaps', () => {
    const doc = buildSingleRunDoc('hello', 'allCaps');
    const blocks = toFlowBlocks(doc, {});
    expect(firstRun(blocks).allCaps).toBe(true);
  });

  test('smallCaps mark sets formatting.smallCaps', () => {
    const doc = buildSingleRunDoc('Hello', 'smallCaps');
    const blocks = toFlowBlocks(doc, {});
    expect(firstRun(blocks).smallCaps).toBe(true);
  });

  test('characterSpacing.spacing → letterSpacing in pixels', () => {
    const doc = buildSingleRunDoc('text', 'characterSpacing', { spacing: 16 });
    const blocks = toFlowBlocks(doc, {});
    // 16 twips = 16 / 1440 inch * 96 px = 1.066... px
    expect(firstRun(blocks).letterSpacing).toBeCloseTo(1.0667, 3);
  });

  test('characterSpacing.position → positionPx in CSS pixels', () => {
    // 12 half-points = 6 pt = 8 px (at 96 dpi, 6/72 * 96 = 8)
    const doc = buildSingleRunDoc('text', 'characterSpacing', { position: 12 });
    const blocks = toFlowBlocks(doc, {});
    expect(firstRun(blocks).positionPx).toBeCloseTo(8, 3);
  });

  test('characterSpacing.scale → horizontalScale percent', () => {
    const doc = buildSingleRunDoc('text', 'characterSpacing', { scale: 90 });
    const blocks = toFlowBlocks(doc, {});
    expect(firstRun(blocks).horizontalScale).toBe(90);
  });

  test('characterSpacing.kerning (half-points) → kerningMinPt', () => {
    // 16 half-points = 8 pt threshold
    const doc = buildSingleRunDoc('text', 'characterSpacing', { kerning: 16 });
    const blocks = toFlowBlocks(doc, {});
    expect(firstRun(blocks).kerningMinPt).toBe(8);
  });

  test('zero/identity values are not propagated (avoid emitting no-op CSS)', () => {
    const doc = buildSingleRunDoc('text', 'characterSpacing', {
      spacing: 0,
      position: 0,
      scale: 100, // identity
      kerning: 0,
    });
    const blocks = toFlowBlocks(doc, {});
    const run = firstRun(blocks);
    expect(run.letterSpacing).toBeUndefined();
    expect(run.positionPx).toBeUndefined();
    expect(run.horizontalScale).toBeUndefined();
    expect(run.kerningMinPt).toBeUndefined();
  });

  test('emboss / imprint / textShadow / textOutline marks reach RunFormatting', () => {
    for (const markName of ['emboss', 'imprint', 'textShadow', 'textOutline'] as const) {
      const doc = buildSingleRunDoc('hi', markName);
      const blocks = toFlowBlocks(doc, {});
      const run = firstRun(blocks);
      expect(run[markName]).toBe(true);
    }
  });

  test('emphasisMark mark forwards its variant attribute', () => {
    for (const variant of ['dot', 'comma', 'circle', 'underDot'] as const) {
      const doc = buildSingleRunDoc('hi', 'emphasisMark', { type: variant });
      const blocks = toFlowBlocks(doc, {});
      expect(firstRun(blocks).emphasisMark).toBe(variant);
    }
  });

  test('emphasisMark with unknown variant falls back to dot', () => {
    const doc = buildSingleRunDoc('hi', 'emphasisMark', { type: 'unknownXyz' });
    const blocks = toFlowBlocks(doc, {});
    expect(firstRun(blocks).emphasisMark).toBe('dot');
  });
});

describe('toFlowBlocks — paragraph defaultTextFormatting cascades to runs (#392)', () => {
  test('runs with no fontFamily mark inherit fontFamily from paragraph defaults', () => {
    // Simulate the #392 fixture: paragraph carries the resolved style font
    // via attrs.defaultTextFormatting; the run itself has no fontFamily mark.
    const doc = schema.node('doc', null, [
      schema.node(
        'paragraph',
        {
          defaultTextFormatting: {
            fontFamily: { ascii: 'Arial Narrow', hAnsi: 'Arial Narrow' },
          },
        },
        [schema.text('body text')]
      ),
    ]);
    const blocks = toFlowBlocks(doc, {});
    expect(firstRun(blocks).fontFamily).toBe('Arial Narrow');
  });

  test('paragraph defaultTextFormatting.fontSize cascades as points', () => {
    const doc = schema.node('doc', null, [
      schema.node(
        'paragraph',
        {
          defaultTextFormatting: { fontSize: 22 }, // half-points → 11pt
        },
        [schema.text('body text')]
      ),
    ]);
    const blocks = toFlowBlocks(doc, {});
    expect(firstRun(blocks).fontSize).toBe(11);
  });

  test('explicit run-level mark overrides paragraph default', () => {
    // Run sets letterSpacing via its own mark; paragraph default for fontFamily
    // still cascades. Both should appear, run mark wins on conflict.
    const mark = schema.marks.characterSpacing.create({ spacing: 16 });
    const node = schema.text('body', [mark]);
    const doc = schema.node('doc', null, [
      schema.node(
        'paragraph',
        {
          defaultTextFormatting: {
            fontFamily: { ascii: 'Cambria', hAnsi: 'Cambria' },
          },
        },
        [node]
      ),
    ]);
    const blocks = toFlowBlocks(doc, {});
    const run = firstRun(blocks);
    expect(run.fontFamily).toBe('Cambria');
    expect(run.letterSpacing).toBeCloseTo(1.0667, 3);
  });
});
