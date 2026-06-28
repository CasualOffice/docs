/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Pins the envelope-preservation contract added in
 * `textBoxEnricher.ts` + `runSerializer.ts`: when a Shape or Image
 * carries `rawXml`, the run serializer emits that raw XML verbatim
 * and skips its own model-based serialization. Multiple Shape/Image
 * siblings extracted from the same source envelope share an
 * `envelopeKey` — only the first one's rawXml is emitted; the rest
 * are render-only stubs whose serialization is suppressed.
 *
 * Why: the VML round-trip cluster (`v:rect`, `v:shape`, `v:textbox`,
 * `v:fill`, `v:f`, `w:pict`, `w10:wrap`) — and the deeper DrawingML
 * descriptors we don't fully model — vanish on parse → serialize if
 * we rebuild the drawing from the in-memory model. Capturing the
 * envelope XML at parse time and replaying it verbatim closes the
 * gap for documents that haven't been edited.
 */
import { describe, expect, test } from 'bun:test';
import type { DrawingContent, Image, Shape, ShapeContent } from '../../types/document';
import { serializeRun } from '../serializer/runSerializer';

const IMAGE_BASE: Image = {
  type: 'image',
  rId: 'rId7',
  src: 'media/image1.png',
  size: { width: 914400, height: 914400 },
  wrap: { type: 'inline' },
};

const SHAPE_BASE: Shape = {
  type: 'shape',
  shapeType: 'rect',
  size: { width: 914400, height: 914400 },
};

describe('rawXml envelope preservation', () => {
  test('Image.rawXml is emitted verbatim, model serializer is bypassed', () => {
    const image: Image = {
      ...IMAGE_BASE,
      rawXml: '<w:drawing><wp:inline><CUSTOM_MARKER/></wp:inline></w:drawing>',
    };
    const xml = serializeRun({
      type: 'run',
      content: [{ type: 'drawing', image } satisfies DrawingContent],
    });
    expect(xml).toContain('<CUSTOM_MARKER/>');
    // Model-driven path emits pic:cNvPicPr boilerplate; raw-XML skip
    // means it must NOT show up.
    expect(xml).not.toContain('pic:cNvPicPr');
  });

  test('Shape.rawXml is emitted verbatim, model serializer is bypassed', () => {
    const shape: Shape = {
      ...SHAPE_BASE,
      rawXml: '<w:pict><RAW_VML_TEXTBOX/></w:pict>',
    };
    const xml = serializeRun({
      type: 'run',
      content: [{ type: 'shape', shape } satisfies ShapeContent],
    });
    expect(xml).toContain('<RAW_VML_TEXTBOX/>');
    expect(xml).not.toContain('<wps:wsp');
  });

  test('siblings sharing an envelopeKey are suppressed after the first emit', () => {
    const envelopeKey = 'env-test-1';
    const firstImage: Image = {
      ...IMAGE_BASE,
      rawXml: '<w:drawing><wp:anchor><GROUP_ENVELOPE/></wp:anchor></w:drawing>',
      envelopeKey,
    };
    const siblingShape: Shape = { ...SHAPE_BASE, envelopeKey };
    const siblingImage: Image = { ...IMAGE_BASE, envelopeKey };

    const xml = serializeRun({
      type: 'run',
      content: [
        { type: 'drawing', image: firstImage },
        { type: 'shape', shape: siblingShape },
        { type: 'drawing', image: siblingImage },
      ],
    });

    expect((xml.match(/<GROUP_ENVELOPE\/>/g) ?? []).length).toBe(1);
    // Siblings emit nothing — no wsp from the shape, no pic:pic from
    // the second image.
    expect(xml).not.toContain('<wps:wsp');
    expect(xml).not.toContain('<pic:cNvPicPr');
  });

  test('items with envelopeKey but no rawXml in the run fall through to model emission', () => {
    // Edge case: if the first envelope item was stripped by an editor
    // pass but a sibling still carries the key, the sibling has no
    // rawXml to emit. Serializer should fall back to model emission
    // rather than emitting nothing — losing the shape entirely would
    // be a silent data-loss regression.
    const shape: Shape = { ...SHAPE_BASE, envelopeKey: 'orphan' };
    const xml = serializeRun({
      type: 'run',
      content: [{ type: 'shape', shape }],
    });
    // Model path emits wps:wsp; ensure we didn't suppress it.
    expect(xml).toContain('<wps:wsp');
  });

  test('a Shape with no rawXml and no envelopeKey serializes from model as today', () => {
    const shape: Shape = { ...SHAPE_BASE };
    const xml = serializeRun({
      type: 'run',
      content: [{ type: 'shape', shape }],
    });
    expect(xml).toContain('<wps:wsp');
  });
});
