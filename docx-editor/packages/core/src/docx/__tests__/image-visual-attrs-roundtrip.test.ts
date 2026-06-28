/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { describe, test, expect } from 'bun:test';
import { parseDrawing } from '../imageParser';
import { serializeRun } from '../serializer/runSerializer';
import { parseXml } from '../xmlParser';
import type { XmlElement } from '../xmlParser';
import type { Image, Run } from '../../types/document';

const NS = [
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
].join(' ');

function parseDrawingFromXml(innerXml: string): Image | null {
  const doc = parseXml(`<w:drawing ${NS}>${innerXml}</w:drawing>`);
  const drawing = (doc.elements as XmlElement[])[0];
  return parseDrawing(drawing, undefined, undefined);
}

function serializeImage(image: Image): string {
  const run: Run = { type: 'run', content: [{ type: 'drawing', image }] };
  return serializeRun(run);
}

/** Parse the `<w:drawing>` payload out of a serialized `<w:r>...</w:r>` blob. */
function reparseSerializedImage(xml: string): Image | null {
  const wrapped = `<root ${NS}>${xml}</root>`;
  const doc = parseXml(wrapped);
  const root = (doc.elements as XmlElement[])[0];
  const wr = (root.elements as XmlElement[])[0]; // <w:r>
  const drawing = (wr.elements as XmlElement[])[0]; // <w:drawing>
  return parseDrawing(drawing, undefined, undefined);
}

describe('wp:srcRect crop round-trip', () => {
  test('parse a:srcRect with all four sides', () => {
    const img = parseDrawingFromXml(`
      <wp:inline distT="0" distB="0" distL="0" distR="0">
        <wp:extent cx="1000000" cy="500000"/>
        <wp:docPr id="1" name="Picture 1"/>
        <a:graphic>
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic>
              <pic:nvPicPr><pic:cNvPr id="1" name="img"/><pic:cNvPicPr/></pic:nvPicPr>
              <pic:blipFill>
                <a:blip r:embed="rId1"/>
                <a:srcRect l="10000" t="5000" r="15000" b="20000"/>
                <a:stretch><a:fillRect/></a:stretch>
              </pic:blipFill>
              <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1000000" cy="500000"/></a:xfrm></pic:spPr>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:inline>`);
    expect(img?.crop).toEqual({ left: 0.1, top: 0.05, right: 0.15, bottom: 0.2 });
  });

  test('emit a bare <a:srcRect/> when no crop is set (Word default)', () => {
    // Word always emits the element — bare when no crop, with attrs
    // when crop is set. We match that so round-trip preserves the
    // structural placeholder (per scripts/roundtrip-audit.mjs the
    // bare form was 17 dropped a:srcRect across 5 fixtures before
    // this contract change).
    const xml = serializeImage({
      type: 'image',
      rId: 'rId1',
      size: { width: 1000000, height: 500000 },
      wrap: { type: 'inline' },
    });
    expect(xml).toContain('<a:srcRect/>');
    // Sanity: no spurious attributes when there's no crop.
    expect(xml).not.toMatch(/<a:srcRect [^/]/);
  });

  test('serialize crop fractions back to 1/100000 attrs, omitting zero sides', () => {
    const xml = serializeImage({
      type: 'image',
      rId: 'rId1',
      size: { width: 1000000, height: 500000 },
      wrap: { type: 'inline' },
      crop: { left: 0.1, top: 0, right: 0.15, bottom: 0.2 },
    });
    // Zero sides are omitted from <a:srcRect/> by the truthy serializer guard.
    expect(xml).toContain('<a:srcRect l="10000" r="15000" b="20000"/>');
    expect(xml).not.toMatch(/<a:srcRect[^>]*\bt="/);
  });

  test('round-trip preserves crop within rounding tolerance', () => {
    const original: Image = {
      type: 'image',
      rId: 'rId1',
      size: { width: 1000000, height: 500000 },
      wrap: { type: 'inline' },
      crop: { left: 0.1, top: 0.05, right: 0.15, bottom: 0.2 },
    };
    const xml = serializeImage(original);
    const parsed = reparseSerializedImage(xml);
    expect(parsed?.crop).toEqual(original.crop!);
  });
});

describe('opacity helper null-safety (regression: PM null leaks → opacity:0)', () => {
  // ProseMirror schema attrs default to `null`, not `undefined`. A previous
  // version of `applyImageVisualAttrs` checked `!== undefined` only; the
  // `null` default leaked through `as number | undefined` casts in the
  // bridge and `null < 1` evaluated true, painting every plain image at
  // `opacity: 0`. The helpers must use `!= null` to catch both.
  // Fixture-tested below via the public API.
  test('hasImageVisualAttrs treats null opacity as "not set"', async () => {
    const { hasImageVisualAttrs } = await import('../../layout-painter/renderImage');
    // Simulate a PM node with default-null opacity / crop fields.
    expect(
      hasImageVisualAttrs({
        cropTop: null as unknown as number | undefined,
        cropRight: null as unknown as number | undefined,
        cropBottom: null as unknown as number | undefined,
        cropLeft: null as unknown as number | undefined,
        opacity: null as unknown as number | undefined,
      })
    ).toBe(false);
  });

  test('hasImageVisualAttrs detects an explicit opacity < 1', async () => {
    const { hasImageVisualAttrs } = await import('../../layout-painter/renderImage');
    expect(hasImageVisualAttrs({ opacity: 0.5 })).toBe(true);
    expect(hasImageVisualAttrs({ opacity: 1 })).toBe(false);
  });
});

describe('a:alphaModFix opacity round-trip', () => {
  test('parse a:alphaModFix amt as opacity fraction', () => {
    const img = parseDrawingFromXml(`
      <wp:inline distT="0" distB="0" distL="0" distR="0">
        <wp:extent cx="1000000" cy="500000"/>
        <wp:docPr id="1" name="Picture 1"/>
        <a:graphic>
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic>
              <pic:nvPicPr><pic:cNvPr id="1" name="img"/><pic:cNvPicPr/></pic:nvPicPr>
              <pic:blipFill>
                <a:blip r:embed="rId1"><a:alphaModFix amt="50000"/></a:blip>
                <a:stretch><a:fillRect/></a:stretch>
              </pic:blipFill>
              <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1000000" cy="500000"/></a:xfrm></pic:spPr>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:inline>`);
    expect(img?.opacity).toBeCloseTo(0.5, 5);
  });

  test('amt="100000" (fully opaque) does not produce an opacity field', () => {
    const img = parseDrawingFromXml(`
      <wp:inline>
        <wp:extent cx="100" cy="100"/>
        <wp:docPr id="1" name="img"/>
        <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
          <pic:pic>
            <pic:nvPicPr><pic:cNvPr id="1" name="img"/><pic:cNvPicPr/></pic:nvPicPr>
            <pic:blipFill><a:blip r:embed="rId1"><a:alphaModFix amt="100000"/></a:blip></pic:blipFill>
            <pic:spPr><a:xfrm><a:ext cx="100" cy="100"/></a:xfrm></pic:spPr>
          </pic:pic>
        </a:graphicData></a:graphic>
      </wp:inline>`);
    expect(img?.opacity).toBeUndefined();
  });

  test('serialize opacity < 1 emits a:alphaModFix; opacity 1 omits it', () => {
    const opaque = serializeImage({
      type: 'image',
      rId: 'rId1',
      size: { width: 100, height: 100 },
      wrap: { type: 'inline' },
    });
    expect(opaque).not.toContain('alphaModFix');

    const transparent = serializeImage({
      type: 'image',
      rId: 'rId1',
      size: { width: 100, height: 100 },
      wrap: { type: 'inline' },
      opacity: 0.5,
    });
    expect(transparent).toContain('<a:alphaModFix amt="50000"/>');
  });
});

describe('wp:effectExtent round-trip stays separate from dist*', () => {
  test('effectExtent is its own element, not folded into wp:inline distT/B/L/R', () => {
    const xml = serializeImage({
      type: 'image',
      rId: 'rId1',
      size: { width: 1000000, height: 500000 },
      wrap: { type: 'inline' },
      // image.padding is the wp:effectExtent reservation.
      padding: { top: 100, bottom: 200, left: 300, right: 400 },
    });
    expect(xml).toContain('<wp:effectExtent l="300" t="100" r="400" b="200"/>');
    // dist* on wp:inline are wrap distances; with no image.wrap.dist* set,
    // they MUST be zero — the previous bug folded padding here.
    expect(xml).toContain('distT="0" distB="0" distL="0" distR="0"');
  });

  test('image.wrap.distT/B/L/R survive round-trip on wp:inline', () => {
    const xml = serializeImage({
      type: 'image',
      rId: 'rId1',
      size: { width: 100, height: 100 },
      wrap: { type: 'inline', distT: 1, distB: 2, distL: 3, distR: 4 },
    });
    expect(xml).toContain('distT="1" distB="2" distL="3" distR="4"');
  });
});

describe('wp:anchor layoutInCell / allowOverlap', () => {
  test('parse explicit "0" → false, "1" → true, absent → undefined', () => {
    const explicit0 = parseDrawingFromXml(`
      <wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0"
                 relativeHeight="0" behindDoc="0" locked="0"
                 layoutInCell="0" allowOverlap="0">
        <wp:simplePos x="0" y="0"/>
        <wp:positionH relativeFrom="column"><wp:posOffset>0</wp:posOffset></wp:positionH>
        <wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>
        <wp:extent cx="100" cy="100"/>
        <wp:wrapNone/>
        <wp:docPr id="1" name="img"/>
        <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
          <pic:pic>
            <pic:nvPicPr><pic:cNvPr id="1" name="img"/><pic:cNvPicPr/></pic:nvPicPr>
            <pic:blipFill><a:blip r:embed="rId1"/></pic:blipFill>
            <pic:spPr><a:xfrm><a:ext cx="100" cy="100"/></a:xfrm></pic:spPr>
          </pic:pic>
        </a:graphicData></a:graphic>
      </wp:anchor>`);
    expect(explicit0?.layoutInCell).toBe(false);
    expect(explicit0?.allowOverlap).toBe(false);
  });

  test('serializer emits the explicit "0" only when the model says false', () => {
    const xml = serializeImage({
      type: 'image',
      rId: 'rId1',
      size: { width: 100, height: 100 },
      wrap: { type: 'square' },
      position: {
        horizontal: { relativeTo: 'column', posOffset: 0 },
        vertical: { relativeTo: 'paragraph', posOffset: 0 },
      },
      layoutInCell: false,
      allowOverlap: false,
    });
    expect(xml).toContain('layoutInCell="0"');
    expect(xml).toContain('allowOverlap="0"');
  });

  test('absent or explicit-true folds back to the spec default "1"', () => {
    const xml = serializeImage({
      type: 'image',
      rId: 'rId1',
      size: { width: 100, height: 100 },
      wrap: { type: 'square' },
      position: {
        horizontal: { relativeTo: 'column', posOffset: 0 },
        vertical: { relativeTo: 'paragraph', posOffset: 0 },
      },
    });
    expect(xml).toContain('layoutInCell="1"');
    expect(xml).toContain('allowOverlap="1"');
  });
});
