/**
 * Theme text color roundtrip — openspec `ooxml-roundtrip-fidelity` Problem #2.
 *
 * `<w:color>` can mix three independent ideas:
 *   - `w:val` — resolved RGB hex (or "auto")
 *   - `w:themeColor` — slot reference like "dark1", "accent1"
 *   - `w:themeTint` / `w:themeShade` — modifiers on the slot
 *
 * Word writes all three together for theme-resolved text (e.g. a table
 * header that reads as black: `<w:color w:val="000000" w:themeColor="dk1"/>`).
 * If the editor loses any one of them on round-trip — most importantly the
 * theme slot — Word may resolve the color against a different theme on
 * re-open and produce a visibly wrong color (black → white in table
 * headers was the reported symptom).
 *
 * The XML→model→XML layer already preserves all three (see
 * `color-roundtrip.test.ts`). This file pins the gaps that show up when
 * the run also passes through the ProseMirror conversion in either
 * direction — including the `auto` + `themeColor` shape that drops out
 * entirely today.
 */

import { afterAll, beforeAll, describe, test, expect } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { parseRunProperties } from '../runParser';
import { serializeTextFormatting } from '../serializer/runSerializer';
import { parseXml, type XmlElement } from '../xmlParser';
import { toProseDoc } from '../../prosemirror/conversion/toProseDoc';
import { fromProseDoc } from '../../prosemirror/conversion/fromProseDoc';
import type { Document, Paragraph, Run, Theme, TextFormatting } from '../../types/document';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

const OFFICE_THEME: Theme = {
  colorScheme: {
    dk1: '000000',
    lt1: 'FFFFFF',
    dk2: '44546A',
    lt2: 'E7E6E6',
    accent1: '4472C4',
    accent2: 'ED7D31',
    accent3: 'A5A5A5',
    accent4: 'FFC000',
    accent5: '5B9BD5',
    accent6: '70AD47',
    hlink: '0563C1',
    folHlink: '954F72',
  },
};

function parseRPr(innerXml: string): XmlElement {
  const doc = parseXml(
    `<w:rPr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${innerXml}</w:rPr>`
  );
  return (doc.elements as XmlElement[])[0];
}

function makeRun(formatting: TextFormatting): Run {
  return {
    type: 'run',
    content: [{ type: 'text', text: 'Header' }],
    formatting,
  };
}

function makeParagraph(run: Run): Paragraph {
  return { type: 'paragraph', content: [run] };
}

function makeDocument(paragraph: Paragraph): Document {
  return {
    package: {
      document: { content: [paragraph] },
      theme: OFFICE_THEME,
    },
  };
}

function firstRunFormatting(doc: Document): TextFormatting | undefined {
  const para = doc.package.document.content[0] as Paragraph | undefined;
  const run = para?.content?.[0] as Run | undefined;
  return run?.formatting;
}

// ============================================================================
// XML-level: parse → serialize
// ============================================================================

describe('Theme text color XML round-trip — auto + themeColor', () => {
  test('parser captures both auto and themeColor', () => {
    const rPr = parseRPr('<w:color w:val="auto" w:themeColor="dk1"/>');
    const parsed = parseRunProperties(rPr, null);
    expect(parsed?.color?.auto).toBe(true);
    expect(parsed?.color?.themeColor).toBe('dk1');
  });

  test('serializer writes both auto and themeColor back', () => {
    const serialized = serializeTextFormatting({
      color: { auto: true, themeColor: 'dk1' },
    } as TextFormatting);
    expect(serialized).toContain('<w:color');
    expect(serialized).toContain('w:val="auto"');
    expect(serialized).toContain('w:themeColor="dk1"');
  });
});

describe('Theme text color XML round-trip — themeColor only (no rgb hint)', () => {
  test('parser captures themeColor with no rgb', () => {
    const rPr = parseRPr('<w:color w:themeColor="accent1"/>');
    const parsed = parseRunProperties(rPr, null);
    expect(parsed?.color?.themeColor).toBe('accent1');
    expect(parsed?.color?.rgb).toBeUndefined();
    expect(parsed?.color?.auto).toBeUndefined();
  });

  test('serializer writes themeColor without w:val', () => {
    const serialized = serializeTextFormatting({
      color: { themeColor: 'accent1' },
    } as TextFormatting);
    expect(serialized).toContain('<w:color');
    expect(serialized).toContain('w:themeColor="accent1"');
    expect(serialized).not.toContain('w:val=');
  });
});

// ============================================================================
// PM round-trip — parsed model → toProseDoc → fromProseDoc → model
// ============================================================================

describe('Theme text color PM round-trip preserves theme attrs', () => {
  test('rgb + themeColor + themeShade (table-header style)', () => {
    const inDoc = makeDocument(
      makeParagraph(
        makeRun({
          color: {
            rgb: '000000',
            themeColor: 'dk1',
          },
        } as TextFormatting)
      )
    );

    const out = fromProseDoc(toProseDoc(inDoc), inDoc);
    const fmt = firstRunFormatting(out);
    expect(fmt?.color?.rgb).toBe('000000');
    expect(fmt?.color?.themeColor).toBe('dk1');
  });

  test('themeColor with tint survives PM round-trip', () => {
    const inDoc = makeDocument(
      makeParagraph(
        makeRun({
          color: { rgb: 'B4C6E7', themeColor: 'accent1', themeTint: '66' },
        } as TextFormatting)
      )
    );

    const out = fromProseDoc(toProseDoc(inDoc), inDoc);
    const fmt = firstRunFormatting(out);
    expect(fmt?.color?.themeColor).toBe('accent1');
    expect(fmt?.color?.themeTint).toBe('66');
    expect(fmt?.color?.rgb).toBe('B4C6E7');
  });

  test('themeColor with shade survives PM round-trip', () => {
    const inDoc = makeDocument(
      makeParagraph(
        makeRun({
          color: { rgb: '2F5496', themeColor: 'accent1', themeShade: 'BF' },
        } as TextFormatting)
      )
    );

    const out = fromProseDoc(toProseDoc(inDoc), inDoc);
    const fmt = firstRunFormatting(out);
    expect(fmt?.color?.themeColor).toBe('accent1');
    expect(fmt?.color?.themeShade).toBe('BF');
    expect(fmt?.color?.rgb).toBe('2F5496');
  });

  // Regression: `auto + themeColor` previously dropped at the toProseDoc
  // boundary (the gate was `!formatting.color.auto`), so the theme slot
  // reference vanished on export and Word fell back to a different
  // color. The gate is now `!auto || themeColor`, and `auto` is
  // forwarded into the textColor mark attrs so fromProseDoc can emit
  // `<w:color w:val="auto" w:themeColor="..."/>` again.
  test('auto + themeColor — theme slot must survive PM round-trip', () => {
    const inDoc = makeDocument(
      makeParagraph(
        makeRun({
          color: { auto: true, themeColor: 'dk1' },
        } as TextFormatting)
      )
    );

    const out = fromProseDoc(toProseDoc(inDoc), inDoc);
    const fmt = firstRunFormatting(out);
    expect(fmt?.color?.themeColor).toBe('dk1');
    // `auto` flag is the second half of the contract — Word wrote both
    // and on re-open expects both back.
    expect(fmt?.color?.auto).toBe(true);
  });

  test('themeColor without rgb hint survives PM round-trip', () => {
    const inDoc = makeDocument(
      makeParagraph(
        makeRun({
          color: { themeColor: 'accent2' },
        } as TextFormatting)
      )
    );

    const out = fromProseDoc(toProseDoc(inDoc), inDoc);
    const fmt = firstRunFormatting(out);
    expect(fmt?.color?.themeColor).toBe('accent2');
  });
});
