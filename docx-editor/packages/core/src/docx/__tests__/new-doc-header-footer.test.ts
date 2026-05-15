import { describe, test, expect } from 'bun:test';
import JSZip from 'jszip';
import { createDocx } from '../rezip';
import { createEmptyDocument } from '../../utils/createDocument';
import { RELATIONSHIP_TYPES } from '../relsParser';
import type { Document } from '../../types/document';
import type { HeaderFooter } from '../../types/content';

const HEADER_CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml';
const FOOTER_CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml';

function addHeader(doc: Document, rId: string, target: string, text: string): void {
  const header: HeaderFooter = {
    type: 'header',
    hdrFtrType: 'default',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'run', formatting: {}, content: [{ type: 'text', text }] }],
      },
    ],
  };

  doc.package.headers = new Map([[rId, header]]);
  doc.package.relationships = new Map([
    [rId, { id: rId, type: RELATIONSHIP_TYPES.header, target }],
  ]);

  const sect = doc.package.document.finalSectionProperties ?? {};
  doc.package.document.finalSectionProperties = {
    ...sect,
    headerReferences: [{ type: 'default', rId }],
  };
}

function addFooter(doc: Document, rId: string, target: string, text: string): void {
  const footer: HeaderFooter = {
    type: 'footer',
    hdrFtrType: 'default',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'run', formatting: {}, content: [{ type: 'text', text }] }],
      },
    ],
  };

  doc.package.footers = new Map([[rId, footer]]);
  doc.package.relationships = new Map([
    ...(doc.package.relationships ?? []),
    [rId, { id: rId, type: RELATIONSHIP_TYPES.footer, target }],
  ]);

  const sect = doc.package.document.finalSectionProperties ?? {};
  doc.package.document.finalSectionProperties = {
    ...sect,
    footerReferences: [{ type: 'default', rId }],
  };
}

describe('New blank-doc header/footer save (#274)', () => {
  test('header added to blank doc persists through createDocx', async () => {
    const doc = createEmptyDocument();
    addHeader(doc, 'rId_new_header_default', 'header1.xml', 'Hello from header');

    const buffer = await createDocx(doc);
    const zip = await JSZip.loadAsync(buffer);

    const headerXml = await zip.file('word/header1.xml')!.async('text');
    expect(headerXml).toContain('Hello from header');

    const contentTypes = await zip.file('[Content_Types].xml')!.async('text');
    expect(contentTypes).toContain(`PartName="/word/header1.xml"`);
    expect(contentTypes).toContain(HEADER_CT);

    const docRels = await zip.file('word/_rels/document.xml.rels')!.async('text');
    expect(docRels).toContain('Id="rId_new_header_default"');
    expect(docRels).toContain('Target="header1.xml"');
    expect(docRels).toContain(RELATIONSHIP_TYPES.header);

    const documentXml = await zip.file('word/document.xml')!.async('text');
    expect(documentXml).toMatch(/<w:headerReference [^/]*r:id="rId_new_header_default"[^/]*\/>/);
  });

  test('footer added to blank doc persists through createDocx', async () => {
    const doc = createEmptyDocument();
    addFooter(doc, 'rId_new_footer_default', 'footer1.xml', 'Hello from footer');

    const buffer = await createDocx(doc);
    const zip = await JSZip.loadAsync(buffer);

    const footerXml = await zip.file('word/footer1.xml')!.async('text');
    expect(footerXml).toContain('Hello from footer');

    const contentTypes = await zip.file('[Content_Types].xml')!.async('text');
    expect(contentTypes).toContain(`PartName="/word/footer1.xml"`);
    expect(contentTypes).toContain(FOOTER_CT);

    const docRels = await zip.file('word/_rels/document.xml.rels')!.async('text');
    expect(docRels).toContain('Id="rId_new_footer_default"');
    expect(docRels).toContain('Target="footer1.xml"');
    expect(docRels).toContain(RELATIONSHIP_TYPES.footer);
  });

  test('both header and footer added together both persist', async () => {
    const doc = createEmptyDocument();
    addHeader(doc, 'rId_new_header_default', 'header1.xml', 'Top of page');
    addFooter(doc, 'rId_new_footer_default', 'footer1.xml', 'Bottom of page');

    const buffer = await createDocx(doc);
    const zip = await JSZip.loadAsync(buffer);

    expect(await zip.file('word/header1.xml')!.async('text')).toContain('Top of page');
    expect(await zip.file('word/footer1.xml')!.async('text')).toContain('Bottom of page');

    const contentTypes = await zip.file('[Content_Types].xml')!.async('text');
    expect(contentTypes).toContain('PartName="/word/header1.xml"');
    expect(contentTypes).toContain('PartName="/word/footer1.xml"');

    const docRels = await zip.file('word/_rels/document.xml.rels')!.async('text');
    expect(docRels).toContain('Id="rId_new_header_default"');
    expect(docRels).toContain('Id="rId_new_footer_default"');
  });
});
