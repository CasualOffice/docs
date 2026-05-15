import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { parseDocx } from '../parser';
import { repackDocx } from '../rezip';
import type { Document } from '../../types/document';
import type { HeaderFooter, Paragraph, Image } from '../../types/content';

// 1x1 transparent PNG as a data URL.
const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const FIXTURE_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'e2e',
  'fixtures',
  'titlePg-header-footer.docx'
);

async function loadFixture(): Promise<Document> {
  const buffer = readFileSync(FIXTURE_PATH);
  return await parseDocx(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  );
}

function findFirstHeader(doc: Document): HeaderFooter | undefined {
  const headers = doc.package.headers;
  if (!headers || headers.size === 0) return undefined;
  return headers.values().next().value;
}

function findFirstFooter(doc: Document): HeaderFooter | undefined {
  const footers = doc.package.footers;
  if (!footers || footers.size === 0) return undefined;
  return footers.values().next().value;
}

function insertImageInto(part: HeaderFooter, image: Image): void {
  const paragraph: Paragraph = {
    type: 'paragraph',
    content: [{ type: 'run', formatting: {}, content: [{ type: 'drawing', image }] }],
  };
  part.content.push(paragraph);
}

describe('Header images — rezip round-trip (issue #251)', () => {
  test('newly inserted header image is persisted with a valid relationship', async () => {
    const doc = await loadFixture();

    const header = findFirstHeader(doc);
    expect(header).toBeDefined();

    const insertedImage: Image = {
      type: 'image',
      rId: '', // placeholder — rezip assigns the real rId
      src: TINY_PNG_DATA_URL,
      size: { width: 96, height: 96 },
      wrap: { type: 'inline' },
    };
    insertImageInto(header!, insertedImage);

    const repacked = await repackDocx(doc, { updateModifiedDate: false });

    // The inserted image's rId must have been rewritten to a real value.
    expect(insertedImage.rId).toMatch(/^rId\d+$/);

    const outZip = await JSZip.loadAsync(repacked);

    // Binary must have been added to word/media/. Capture the new filename.
    const mediaFiles = Object.keys(outZip.files).filter((p) =>
      /^word\/media\/image\d+\.png$/.test(p)
    );
    expect(mediaFiles.length).toBeGreaterThan(0);
    const newMediaName = mediaFiles[mediaFiles.length - 1].replace(/^word\/media\//, '');

    // The header's rels file must reference the new image with the assigned rId.
    const headerRelsPaths = Object.keys(outZip.files).filter((p) =>
      /^word\/_rels\/header\d+\.xml\.rels$/.test(p)
    );
    expect(headerRelsPaths.length).toBeGreaterThan(0);

    const relsXmls = await Promise.all(headerRelsPaths.map((p) => outZip.file(p)!.async('text')));
    const combinedRels = relsXmls.join('\n');
    expect(combinedRels).toContain(`Id="${insertedImage.rId}"`);
    expect(combinedRels).toContain(`Target="media/${newMediaName}"`);

    // The document's main rels file must NOT reference this image (media target
    // is a package-wide namespace, so Target identity is the right check —
    // rId numbers are scoped per-rels file and can legitimately collide).
    const docRels = await outZip.file('word/_rels/document.xml.rels')!.async('text');
    expect(docRels).not.toContain(`Target="media/${newMediaName}"`);

    // The header XML must reference the new rId via r:embed.
    const headerXmlPaths = Object.keys(outZip.files).filter((p) =>
      /^word\/header\d+\.xml$/.test(p)
    );
    const headerXmls = await Promise.all(headerXmlPaths.map((p) => outZip.file(p)!.async('text')));
    expect(headerXmls.join('\n')).toContain(`r:embed="${insertedImage.rId}"`);

    // Content types must register the PNG extension.
    const contentTypes = await outZip.file('[Content_Types].xml')!.async('text');
    expect(contentTypes).toContain('Extension="png"');
  });

  test('newly inserted footer image is persisted to the footer rels file', async () => {
    const doc = await loadFixture();

    const footer = findFirstFooter(doc);
    expect(footer).toBeDefined();

    const insertedImage: Image = {
      type: 'image',
      rId: '',
      src: TINY_PNG_DATA_URL,
      size: { width: 96, height: 96 },
      wrap: { type: 'inline' },
    };
    insertImageInto(footer!, insertedImage);

    const repacked = await repackDocx(doc, { updateModifiedDate: false });
    expect(insertedImage.rId).toMatch(/^rId\d+$/);

    const outZip = await JSZip.loadAsync(repacked);
    const mediaFiles = Object.keys(outZip.files).filter((p) =>
      /^word\/media\/image\d+\.png$/.test(p)
    );
    expect(mediaFiles.length).toBeGreaterThan(0);
    const newMediaName = mediaFiles[mediaFiles.length - 1].replace(/^word\/media\//, '');

    const footerRelsPaths = Object.keys(outZip.files).filter((p) =>
      /^word\/_rels\/footer\d+\.xml\.rels$/.test(p)
    );
    const relsXmls = await Promise.all(footerRelsPaths.map((p) => outZip.file(p)!.async('text')));
    const combinedRels = relsXmls.join('\n');
    expect(combinedRels).toContain(`Target="media/${newMediaName}"`);

    const docRels = await outZip.file('word/_rels/document.xml.rels')!.async('text');
    expect(docRels).not.toContain(`Target="media/${newMediaName}"`);
  });
});
