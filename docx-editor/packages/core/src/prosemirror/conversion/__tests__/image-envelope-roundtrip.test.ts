/**
 * Regression: images extracted from a group / mc:AlternateContent envelope
 * carry their captured `rawXml` + `envelopeKey` on the parsed model (see
 * textBoxEnricher). Those must survive a from-PM rebuild (collab sync, full
 * repack) the same way shapes and text boxes do — otherwise an edited document
 * silently loses the grouped drawing.
 *
 * Pins the threading added to convertImage (toProseDoc) and createImageRun
 * (fromProseDoc), plus the wp14 relative-size hint and the image hyperlink rId.
 */
import { describe, expect, test } from 'bun:test';
import type { Node as PMNode } from 'prosemirror-model';
import { toProseDoc } from '../toProseDoc';
import { fromProseDoc } from '../fromProseDoc';
import type { Document, Image, Paragraph, DrawingContent, Run } from '../../../types/document';

const RAW_XML = '<w:drawing><wp:anchor><GROUP_ENVELOPE/></wp:anchor></w:drawing>';
const ENVELOPE_KEY = 'env-image-1';

function makeEnvelopeImage(): Image {
  return {
    type: 'image',
    rId: 'rIdImg',
    src: 'data:image/png;base64,synthetic',
    size: { width: 914400, height: 914400 },
    wrap: { type: 'inFront' },
    relativeSize: { horizontal: { relativeFrom: 'page', pct: 50000 } },
    hlinkRId: 'rIdLink',
    rawXml: RAW_XML,
    envelopeKey: ENVELOPE_KEY,
  };
}

function makeDocument(image: Image): Document {
  const paragraph: Paragraph = {
    type: 'paragraph',
    content: [{ type: 'run', content: [{ type: 'drawing', image }] }],
  };
  return { package: { document: { content: [paragraph] } } };
}

function findImageNode(doc: PMNode): PMNode {
  let found: PMNode | null = null;
  doc.descendants((node) => {
    if (node.type.name === 'image') {
      found = node;
      return false;
    }
    return true;
  });
  if (!found) throw new Error('Expected an image node');
  return found;
}

function firstImage(doc: Document): Image {
  const para = doc.package.document.content[0] as Paragraph;
  const run = para.content[0] as Run;
  const drawing = run.content?.[0] as DrawingContent;
  if (!drawing || drawing.type !== 'drawing') throw new Error('Expected a drawing run');
  return drawing.image;
}

describe('image envelope round-trips through ProseMirror', () => {
  test('toProseDoc carries rawXml/envelopeKey/relativeSize/hlinkRId onto the image node', () => {
    const node = findImageNode(toProseDoc(makeDocument(makeEnvelopeImage())));
    expect(node.attrs.rawXml).toBe(RAW_XML);
    expect(node.attrs.envelopeKey).toBe(ENVELOPE_KEY);
    expect(node.attrs.hlinkRId).toBe('rIdLink');
    expect(node.attrs.relativeSize?.horizontal?.pct).toBe(50000);
  });

  test('fromProseDoc restores the envelope so a from-PM rebuild re-emits it', () => {
    const pmDoc = toProseDoc(makeDocument(makeEnvelopeImage()));
    const rebuilt = firstImage(fromProseDoc(pmDoc));
    expect(rebuilt.rawXml).toBe(RAW_XML);
    expect(rebuilt.envelopeKey).toBe(ENVELOPE_KEY);
    expect(rebuilt.hlinkRId).toBe('rIdLink');
    expect(rebuilt.relativeSize?.horizontal?.pct).toBe(50000);
  });

  test('an image node without an envelope (edited / plain image) emits none', () => {
    // Post-edit state: the edit handlers clear rawXml/envelopeKey so the model
    // serializer takes over. With the attrs absent, fromProseDoc must not
    // fabricate an envelope.
    const plain = makeEnvelopeImage();
    delete plain.rawXml;
    delete plain.envelopeKey;
    const rebuilt = firstImage(fromProseDoc(toProseDoc(makeDocument(plain))));
    expect(rebuilt.rawXml).toBeUndefined();
    expect(rebuilt.envelopeKey).toBeUndefined();
  });
});
