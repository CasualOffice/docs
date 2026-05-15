/**
 * Regression: wrapNone anchored images (`behind` / `inFront`) are positioned
 * floats. They must not consume a paragraph line like topAndBottom/block images.
 */

import { describe, expect, test } from 'bun:test';
import type { Node as PMNode } from 'prosemirror-model';
import { toProseDoc } from '../toProseDoc';
import { toFlowBlocks } from '../../../layout-bridge/toFlowBlocks';
import type { ParagraphBlock } from '../../../layout-engine/types';
import type { Document, Image, Paragraph } from '../../../types/document';

function makeWrapNoneImage(wrapType: 'behind' | 'inFront'): Image {
  return {
    type: 'image',
    rId: 'rIdSyntheticImage',
    src: 'data:image/png;base64,synthetic',
    size: { width: 914400, height: 914400 },
    wrap: { type: wrapType },
    position: {
      horizontal: { relativeTo: 'column', posOffset: -408940 },
      vertical: { relativeTo: 'paragraph', posOffset: -116205 },
    },
  };
}

function makeDocument(image: Image): Document {
  const paragraph: Paragraph = {
    type: 'paragraph',
    content: [
      {
        type: 'run',
        content: [{ type: 'drawing', image }],
      },
      {
        type: 'run',
        content: [{ type: 'text', text: 'Text remains in the normal paragraph flow.' }],
      },
    ],
  };

  return {
    package: {
      document: {
        content: [paragraph],
      },
    },
  };
}

function findImageNode(doc: PMNode): PMNode {
  let imageNode: PMNode | null = null;
  doc.descendants((node) => {
    if (node.type.name === 'image') {
      imageNode = node;
      return false;
    }
    return true;
  });

  if (!imageNode) {
    throw new Error('Expected synthetic document to contain an image node');
  }
  return imageNode;
}

describe('toProseDoc wrapNone positioned images', () => {
  for (const wrapType of ['inFront', 'behind'] as const) {
    test(`${wrapType} images import as positioned floats`, () => {
      const pmDoc = toProseDoc(makeDocument(makeWrapNoneImage(wrapType)));
      const imageNode = findImageNode(pmDoc);

      expect(imageNode.attrs.wrapType).toBe(wrapType);
      expect(imageNode.attrs.displayMode).toBe('float');
      expect(imageNode.attrs.cssFloat).toBe('none');
      expect(imageNode.attrs.position.horizontal.posOffset).toBe(-408940);
      expect(imageNode.attrs.position.vertical.posOffset).toBe(-116205);
    });
  }

  test('inFront image reaches flow layout as a positioned float', () => {
    const pmDoc = toProseDoc(makeDocument(makeWrapNoneImage('inFront')));
    const paragraph = toFlowBlocks(pmDoc, { pageContentHeight: 700 }).find(
      (block): block is ParagraphBlock => block.kind === 'paragraph'
    );

    expect(paragraph).toBeDefined();
    const firstRun = paragraph!.runs[0];
    if (!firstRun || firstRun.kind !== 'image') {
      throw new Error('Expected first run to be an image');
    }
    expect(firstRun.displayMode).toBe('float');
    expect(firstRun.wrapType).toBe('inFront');
    expect(firstRun.position?.horizontal?.posOffset).toBe(-408940);
    expect(firstRun.position?.vertical?.posOffset).toBe(-116205);
  });
});
