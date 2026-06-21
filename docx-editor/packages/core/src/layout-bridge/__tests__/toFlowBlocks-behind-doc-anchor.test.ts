/**
 * Integration test — a behind-doc shape's wrap survives end-to-end so the
 * layout engine can both paint it behind text AND reserve its flow band.
 *
 *   Document model (Shape with wrap.type 'behind', anchored to a paragraph)
 *     → toProseDoc (textBox node carries wrapType='behind')
 *     → toFlowBlocks (TextBoxBlock.anchor.behindDoc === true)
 *
 * Regression guard for B2 (SDS hazard box): before this, the VML group's
 * `z-index < 0` was dropped at parse time and `convertTextBoxNode` never set
 * `anchor.behindDoc`, so behind-doc anchored shapes could not reserve space.
 */

import { describe, test, expect } from 'bun:test';
import { toProseDoc } from '../../prosemirror/conversion/toProseDoc';
import { toFlowBlocks } from '../toFlowBlocks';
import type { Document, Paragraph, Shape } from '../../types/document';
import type { TextBoxBlock } from '../../layout-engine/types';

function paragraphWithShape(shape: Shape): Paragraph {
  return {
    type: 'paragraph',
    content: [{ type: 'run', content: [{ type: 'shape', shape }] }],
  };
}

function makeDocument(paragraph: Paragraph): Document {
  return { package: { document: { content: [paragraph] } } };
}

function behindShape(): Shape {
  return {
    type: 'shape',
    shapeType: 'rect',
    size: { width: 914400, height: 914400 }, // 1in × 1in (EMU)
    position: {
      horizontal: { relativeTo: 'page', posOffset: 914400 },
      vertical: { relativeTo: 'paragraph', posOffset: 304800 },
    },
    wrap: { type: 'behind' },
    textBody: { content: [{ type: 'paragraph', content: [] }] },
  };
}

describe('toFlowBlocks — behind-doc anchored shape', () => {
  test('wrap.type "behind" → anchor.behindDoc true on the layout block', () => {
    const pmDoc = toProseDoc(makeDocument(paragraphWithShape(behindShape())));
    const blocks = toFlowBlocks(pmDoc, {});
    const tb = blocks.find((b): b is TextBoxBlock => b.kind === 'textBox');
    expect(tb).toBeDefined();
    expect(tb!.anchor?.behindDoc).toBe(true);
    expect(tb!.anchor?.relFromV).toBe('paragraph');
  });

  test('a non-behind (inFront) shape leaves behindDoc unset', () => {
    const shape = behindShape();
    shape.wrap = { type: 'inFront' };
    const pmDoc = toProseDoc(makeDocument(paragraphWithShape(shape)));
    const blocks = toFlowBlocks(pmDoc, {});
    const tb = blocks.find((b): b is TextBoxBlock => b.kind === 'textBox');
    expect(tb).toBeDefined();
    expect(tb!.anchor?.behindDoc).toBeUndefined();
  });
});
