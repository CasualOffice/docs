/**
 * Pins empty-paragraph-property round-trip.
 *
 * titlePg-header-footer.docx contains paragraphs with empty self-closing
 *   <w:pBdr/> <w:spacing/> <w:ind/> <w:rPr/>
 * inside their <w:pPr>. These are semantically meaningful — they
 * explicitly override the paragraph style chain's inherited values.
 * Both layers had a bug:
 *   - parseParagraphProperties only populated the property when there
 *     were attributes to read, so the marker that the element existed
 *     at all was lost.
 *   - serializeParagraphFormatting returned '' from each sub-serializer
 *     when no children landed, so even if the marker had survived
 *     nothing would emit.
 *
 * Fix: parser records a presentEmpty marker per side; serializer emits
 * the self-closing form when the marker is set and the populated
 * fields are absent.
 */

import { describe, expect, test } from 'bun:test';
import type { ParagraphFormatting } from '../../types/document';
import { serializeParagraphFormatting } from '../serializer/paragraphSerializer';
import { parseParagraphProperties } from '../paragraphParser';
import { parseXml } from '../xmlParser';
import type { XmlElement } from '../xmlParser';

function findPPr(node: XmlElement): XmlElement | null {
  if (node.name === 'w:pPr') return node;
  for (const c of node.elements ?? []) {
    if (c.type === 'element') {
      const found = findPPr(c);
      if (found) return found;
    }
  }
  return null;
}

function parsePPr(inner: string): ParagraphFormatting | undefined {
  const root = parseXml(
    `<?xml version="1.0"?><w:root xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${inner}</w:root>`
  );
  const pPr = findPPr(root);
  if (!pPr) throw new Error('no pPr');
  return parseParagraphProperties(pPr, null);
}

function emit(formatting: ParagraphFormatting): string {
  return serializeParagraphFormatting(formatting);
}

describe('empty <w:pBdr/> / <w:spacing/> / <w:ind/> / <w:rPr/> round-trip', () => {
  test('parser records presentEmpty.pBdr when source has <w:pBdr/>', () => {
    const fmt = parsePPr('<w:pPr><w:pBdr/></w:pPr>');
    expect(fmt?.presentEmpty?.pBdr).toBe(true);
  });

  test('parser records presentEmpty.spacing when source has <w:spacing/>', () => {
    const fmt = parsePPr('<w:pPr><w:spacing/></w:pPr>');
    expect(fmt?.presentEmpty?.spacing).toBe(true);
  });

  test('parser records presentEmpty.ind when source has <w:ind/>', () => {
    const fmt = parsePPr('<w:pPr><w:ind/></w:pPr>');
    expect(fmt?.presentEmpty?.ind).toBe(true);
  });

  test('parser records presentEmpty.rPr when source has empty <w:rPr/>', () => {
    const fmt = parsePPr('<w:pPr><w:rPr/></w:pPr>');
    expect(fmt?.presentEmpty?.rPr).toBe(true);
  });

  test('parser does NOT set presentEmpty when element has attrs', () => {
    const fmt = parsePPr('<w:pPr><w:spacing w:before="120"/></w:pPr>');
    expect(fmt?.presentEmpty?.spacing).toBeUndefined();
    expect(fmt?.spaceBefore).toBe(120);
  });

  test('serializer emits <w:pBdr/> when presentEmpty.pBdr is set and no borders', () => {
    const xml = emit({ presentEmpty: { pBdr: true } });
    expect(xml).toContain('<w:pBdr/>');
  });

  test('serializer emits <w:spacing/> when presentEmpty.spacing is set and no spacing values', () => {
    const xml = emit({ presentEmpty: { spacing: true } });
    expect(xml).toContain('<w:spacing/>');
  });

  test('serializer emits <w:ind/> when presentEmpty.ind is set and no indent values', () => {
    const xml = emit({ presentEmpty: { ind: true } });
    expect(xml).toContain('<w:ind/>');
  });

  test('serializer emits <w:rPr/> when presentEmpty.rPr is set and no runProperties', () => {
    const xml = emit({ presentEmpty: { rPr: true } });
    expect(xml).toContain('<w:rPr/>');
  });

  test('populated fields take precedence over presentEmpty marker', () => {
    // If both the marker is set AND the field is populated, the full
    // form wins (it captures more information than the self-closing).
    const xml = emit({
      presentEmpty: { spacing: true },
      spaceBefore: 240,
    });
    expect(xml).toContain('<w:spacing');
    expect(xml).toContain('w:before="240"');
    // No standalone self-closing form on top of the populated one.
    expect((xml.match(/<w:spacing/g) ?? []).length).toBe(1);
  });

  test('full parse → serialize loop preserves the empty element', () => {
    const inputXml = '<w:pPr><w:pBdr/><w:spacing/><w:ind/><w:rPr/></w:pPr>';
    const fmt = parsePPr(inputXml);
    expect(fmt).toBeDefined();
    const reEmitted = emit(fmt!);
    expect(reEmitted).toContain('<w:pBdr/>');
    expect(reEmitted).toContain('<w:spacing/>');
    expect(reEmitted).toContain('<w:ind/>');
    expect(reEmitted).toContain('<w:rPr/>');
  });
});
