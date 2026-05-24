/**
 * Pin Word-default boilerplate inside pic:pic descriptors:
 *   - <a:picLocks noChangeAspect="1"/> in <pic:cNvPicPr>
 *   - <a:extLst><a:ext><a14:useLocalDpi val="0"/></a:ext></a:extLst> in <a:blip>
 *   - <a:srcRect/> bare element when no crop is set
 *
 * scripts/roundtrip-audit.mjs surfaced 20 + 18 + 18 + 17 = 73 dropped
 * occurrences of these structural markers across the fixture corpus
 * (example-with-image, medical-incident-form, generic-render-regression,
 * and others). All are emitted by Word for every saved image regardless
 * of edit history — matching the structure keeps document.xml diffs to
 * the actual edits.
 */
import { describe, expect, test } from 'bun:test';
import type { DrawingContent, Image } from '../../types/document';
import { resetAutoIdCounter, serializeRun } from '../serializer/runSerializer';

function imageXml(overrides: Partial<Image> = {}) {
  const image: Image = {
    type: 'image',
    rId: 'rId7',
    src: 'media/image1.png',
    size: { width: 914400, height: 914400 },
    wrap: { type: 'inline' },
    ...overrides,
  };
  const drawing: DrawingContent = { type: 'drawing', image };
  return serializeRun({ type: 'run', content: [drawing] });
}

describe('pic:pic descriptor boilerplate round-trip', () => {
  test('emits <a:picLocks noChangeAspect="1"/> inside <pic:cNvPicPr>', () => {
    const xml = imageXml();
    expect(xml).toContain('<pic:cNvPicPr><a:picLocks noChangeAspect="1"/></pic:cNvPicPr>');
  });

  test('emits a:extLst + a14:useLocalDpi extension inside <a:blip>', () => {
    const xml = imageXml();
    expect(xml).toContain(
      '<a:ext uri="{28A0092B-C50C-407E-A947-70E740481C1C}"><a14:useLocalDpi xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main" val="0"/></a:ext>'
    );
  });

  test('alphaModFix and extLst both go inside <a:blip>', () => {
    const xml = imageXml({ opacity: 0.5 });
    // alphaModFix then extLst — both siblings inside one <a:blip>.
    expect(xml).toMatch(/<a:blip [^>]*><a:alphaModFix [^/]+\/><a:extLst>/);
  });

  test('bare <a:srcRect/> when no crop is set', () => {
    const xml = imageXml();
    expect(xml).toContain('<a:srcRect/>');
  });

  test('attributed <a:srcRect l=... .../> when crop is set', () => {
    const xml = imageXml({ crop: { left: 0.1, right: 0.2 } });
    expect(xml).toContain('<a:srcRect l="10000" r="20000"/>');
  });
});

describe('duplicate image-id guard (template-engine docs)', () => {
  // Template-engine-generated DOCX files routinely emit
  // <pic:cNvPr id="0"/> on every image. If we keep that id verbatim on
  // serialisation, every image lands with id="0" and Word fails to
  // render any but the first. The serialiser should treat "0" (string
  // OR numeric) as a falsy id and allocate a fresh auto-id instead.
  test('image with id="0" gets auto-assigned a unique id', () => {
    resetAutoIdCounter();
    const xml = imageXml({ id: '0' });
    // Should NOT contain id="0" anywhere — the fallback allocator
    // assigns 100000+ for first auto id.
    expect(xml).not.toMatch(/<pic:cNvPr id="0"/);
    expect(xml).not.toMatch(/<wp:docPr id="0"/);
    // Should contain a non-zero auto-id.
    expect(xml).toMatch(/<pic:cNvPr id="1\d{5}"/);
  });

  test('two images with id="0" get distinct auto-ids', () => {
    resetAutoIdCounter();
    const xmlA = imageXml({ id: '0', rId: 'rId7' });
    const xmlB = imageXml({ id: '0', rId: 'rId8' });
    const idA = xmlA.match(/<pic:cNvPr id="(\d+)"/)?.[1];
    const idB = xmlB.match(/<pic:cNvPr id="(\d+)"/)?.[1];
    expect(idA).toBeDefined();
    expect(idB).toBeDefined();
    expect(idA).not.toBe(idB);
  });

  test('image with numeric 0 id also falls through', () => {
    resetAutoIdCounter();
    const xml = imageXml({ id: 0 as unknown as string });
    expect(xml).not.toMatch(/<pic:cNvPr id="0"/);
    expect(xml).toMatch(/<pic:cNvPr id="1\d{5}"/);
  });

  test('image with explicit non-zero id keeps it', () => {
    resetAutoIdCounter();
    const xml = imageXml({ id: '42' });
    expect(xml).toContain('<pic:cNvPr id="42"');
  });
});
