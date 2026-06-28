/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Pins wp14:sizeRelH / wp14:sizeRelV / wp14:pctWidth / wp14:pctHeight
 * round-trip. These are Word 2010+ extension hints recording the
 * percentage-of-anchor sizing rule. We don't drive layout from them;
 * round-trip is the only requirement.
 *
 * Affected fixture: issue-319-sections.docx, where Word emits
 *   <wp14:sizeRelH relativeFrom="margin"><wp14:pctWidth>0</wp14:pctWidth></wp14:sizeRelH>
 *   <wp14:sizeRelV relativeFrom="margin"><wp14:pctHeight>0</wp14:pctHeight></wp14:sizeRelV>
 * even when absolute EMU sizing is used.
 */

import { describe, expect, test } from 'bun:test';
import type { Image } from '../../types/document';
import { parseDrawing } from '../imageParser';
import { parseXml } from '../xmlParser';
import type { XmlElement } from '../xmlParser';

// Minimal extract — we don't go through the run serializer here (it
// requires a full Image with rels + media), but the parser side covers
// the more bug-prone of the two layers. The serializer is a single
// string template that's directly verifiable by reading the diff.

function findDrawing(node: XmlElement): XmlElement | null {
  if (node.name === 'w:drawing') return node;
  for (const c of node.elements ?? []) {
    if (c.type === 'element') {
      const found = findDrawing(c);
      if (found) return found;
    }
  }
  return null;
}

function parseImageWithRel(innerXml: string): Image | null {
  const root = parseXml(
    `<?xml version="1.0"?><w:root xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${innerXml}</w:root>`
  );
  const drawing = findDrawing(root);
  if (!drawing) throw new Error('no drawing in test input');
  return parseDrawing(drawing, undefined, undefined);
}

const baseAnchor = (sizeRel: string) => `
  <w:drawing>
    <wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">
      <wp:simplePos x="0" y="0"/>
      <wp:positionH relativeFrom="column"><wp:posOffset>0</wp:posOffset></wp:positionH>
      <wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>
      <wp:extent cx="1000000" cy="1000000"/>
      <wp:docPr id="1" name="img"/>
      <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"></a:graphicData></a:graphic>
      ${sizeRel}
    </wp:anchor>
  </w:drawing>`;

describe('wp14:sizeRelH / wp14:sizeRelV round-trip (parse side)', () => {
  test('parses sizeRelH with relativeFrom="margin" and pctWidth', () => {
    const xml = baseAnchor(
      '<wp14:sizeRelH relativeFrom="margin"><wp14:pctWidth>0</wp14:pctWidth></wp14:sizeRelH>'
    );
    const img = parseImageWithRel(xml);
    expect(img?.relativeSize?.horizontal).toEqual({ relativeFrom: 'margin', pct: 0 });
    expect(img?.relativeSize?.vertical).toBeUndefined();
  });

  test('parses sizeRelV with relativeFrom="page" and pctHeight=50', () => {
    const xml = baseAnchor(
      '<wp14:sizeRelV relativeFrom="page"><wp14:pctHeight>50000</wp14:pctHeight></wp14:sizeRelV>'
    );
    const img = parseImageWithRel(xml);
    expect(img?.relativeSize?.vertical).toEqual({ relativeFrom: 'page', pct: 50000 });
  });

  test('parses both H and V together (issue-319-sections.docx pattern)', () => {
    const xml = baseAnchor(
      '<wp14:sizeRelH relativeFrom="margin"><wp14:pctWidth>0</wp14:pctWidth></wp14:sizeRelH>' +
        '<wp14:sizeRelV relativeFrom="margin"><wp14:pctHeight>0</wp14:pctHeight></wp14:sizeRelV>'
    );
    const img = parseImageWithRel(xml);
    expect(img?.relativeSize).toBeDefined();
    expect(img?.relativeSize?.horizontal).toEqual({ relativeFrom: 'margin', pct: 0 });
    expect(img?.relativeSize?.vertical).toEqual({ relativeFrom: 'margin', pct: 0 });
  });

  test('omits relativeSize when no wp14 elements present', () => {
    const img = parseImageWithRel(baseAnchor(''));
    expect(img?.relativeSize).toBeUndefined();
  });

  test('defaults relativeFrom to "margin" when attribute missing', () => {
    const xml = baseAnchor('<wp14:sizeRelH><wp14:pctWidth>25</wp14:pctWidth></wp14:sizeRelH>');
    const img = parseImageWithRel(xml);
    expect(img?.relativeSize?.horizontal).toEqual({ relativeFrom: 'margin', pct: 25 });
  });
});
