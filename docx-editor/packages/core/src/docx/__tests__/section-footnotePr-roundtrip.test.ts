/**
 * Pins `<w:footnotePr>` / `<w:endnotePr>` round-trip for the empty
 * form (titlePg-header-footer.docx).
 *
 * Two bugs: (1) the parser dropped the SectionProperties.footnotePr
 * object when the element was empty, so the serializer never saw it;
 * (2) the serializer emitted nothing when no children landed.
 * Both fixed so an input <w:footnotePr/> / <w:endnotePr/> survives
 * round-trip.
 */

import { describe, expect, test } from 'bun:test';
import type { SectionProperties } from '../../types/document';
import { serializeSectionProperties } from '../serializer/documentSerializer';
import { parseSectionProperties } from '../sectionParser';
import { parseXml } from '../xmlParser';
import type { XmlElement } from '../xmlParser';

function emit(props: SectionProperties): string {
  return serializeSectionProperties(props);
}

function findSectPr(node: XmlElement): XmlElement | null {
  if (node.name === 'w:sectPr' || node.name?.endsWith(':sectPr')) return node;
  for (const child of node.elements ?? []) {
    if (child.type === 'element') {
      const found = findSectPr(child);
      if (found) return found;
    }
  }
  return null;
}

function parseSectPr(xml: string): SectionProperties {
  const root = parseXml(
    `<?xml version="1.0"?><w:root xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${xml}</w:root>`
  );
  const sectPr = findSectPr(root);
  if (!sectPr) throw new Error('no sectPr');
  return parseSectionProperties(sectPr);
}

describe('<w:footnotePr> / <w:endnotePr> round-trip', () => {
  test('empty <w:footnotePr/> survives parse + serialize', () => {
    const inputXml = '<w:sectPr><w:footnotePr/></w:sectPr>';
    const props = parseSectPr(inputXml);
    expect(props.footnotePr).toBeDefined();
    const reEmitted = emit(props);
    expect(reEmitted).toContain('<w:footnotePr/>');
  });

  test('empty <w:endnotePr/> survives parse + serialize', () => {
    const inputXml = '<w:sectPr><w:endnotePr/></w:sectPr>';
    const props = parseSectPr(inputXml);
    expect(props.endnotePr).toBeDefined();
    const reEmitted = emit(props);
    expect(reEmitted).toContain('<w:endnotePr/>');
  });

  test('serializer emits self-closing form when props object is empty', () => {
    expect(emit({ footnotePr: {} })).toContain('<w:footnotePr/>');
    expect(emit({ endnotePr: {} })).toContain('<w:endnotePr/>');
  });

  test('serializer keeps full form when fields are populated', () => {
    const xml = emit({ footnotePr: { numFmt: 'lowerRoman', numStart: 1 } });
    expect(xml).toContain('<w:footnotePr>');
    expect(xml).toContain('<w:numFmt w:val="lowerRoman"/>');
    expect(xml).toContain('<w:numStart w:val="1"/>');
    expect(xml).toContain('</w:footnotePr>');
    // Should NOT collapse to the self-closing form when content exists.
    expect(xml).not.toContain('<w:footnotePr/>');
  });

  test('serializer omits entirely when prop is undefined', () => {
    const xml = emit({});
    expect(xml).not.toContain('<w:footnotePr');
    expect(xml).not.toContain('<w:endnotePr');
  });
});
