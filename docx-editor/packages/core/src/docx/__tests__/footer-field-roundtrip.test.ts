/**
 * Footer field-code round-trip (P1 #8).
 *
 * The improvement tracker flagged `{NUMPAGES}` / `{PAGE}` fields in
 * footers as exporting as literal text. This suite drives a full
 * round-trip — header/footer XML → parseHeader → headerFooterToProseDoc
 * → proseDocToBlocks → serializeHeaderFooter — and asserts the field
 * is preserved as `<w:fldChar>` + `<w:instrText>` runs at every stage.
 *
 * If the suite passes the bug is closed by coverage (the round-trip
 * machinery is wired correctly). If it fails, the failure pinpoints
 * which boundary drops the field.
 */

import { describe, test, expect } from 'bun:test';
import { parseFooter } from '../headerFooterParser';
import { headerFooterToProseDoc, proseDocToBlocks } from '../../prosemirror/conversion';
import { serializeHeaderFooter } from '../serializer/headerFooterSerializer';
import type { HeaderFooter, ComplexField, Paragraph } from '../../types/document';

const FOOTER_WITH_PAGE_FIELD = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:r><w:t xml:space="preserve">Page </w:t></w:r>
    <w:r><w:fldChar w:fldCharType="begin"/></w:r>
    <w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>
    <w:r><w:fldChar w:fldCharType="separate"/></w:r>
    <w:r><w:t>1</w:t></w:r>
    <w:r><w:fldChar w:fldCharType="end"/></w:r>
    <w:r><w:t xml:space="preserve"> of </w:t></w:r>
    <w:r><w:fldChar w:fldCharType="begin"/></w:r>
    <w:r><w:instrText xml:space="preserve"> NUMPAGES </w:instrText></w:r>
    <w:r><w:fldChar w:fldCharType="separate"/></w:r>
    <w:r><w:t>3</w:t></w:r>
    <w:r><w:fldChar w:fldCharType="end"/></w:r>
  </w:p>
</w:ftr>`;

function getComplexFields(hf: HeaderFooter): ComplexField[] {
  const fields: ComplexField[] = [];
  for (const block of hf.content) {
    if (block.type !== 'paragraph') continue;
    const para = block as Paragraph;
    for (const item of para.content) {
      if (item.type === 'complexField') fields.push(item as ComplexField);
    }
  }
  return fields;
}

describe('Footer field-code round-trip (P1 #8)', () => {
  test('parser preserves PAGE + NUMPAGES as complexField items', () => {
    const hf = parseFooter(FOOTER_WITH_PAGE_FIELD);
    const fields = getComplexFields(hf);

    // PAGE + NUMPAGES = 2 complex fields. The `Page ` / ` of ` literal
    // text runs flow through as plain runs alongside the fields.
    expect(fields).toHaveLength(2);
    expect(fields[0].fieldType).toBe('PAGE');
    expect(fields[1].fieldType).toBe('NUMPAGES');
  });

  test('serializer writes complex fields as fldChar + instrText, not as literal text', () => {
    const hf = parseFooter(FOOTER_WITH_PAGE_FIELD);
    const xml = serializeHeaderFooter(hf);

    // The output must contain the full field tripod for both fields.
    expect(xml).toContain('<w:fldChar w:fldCharType="begin"');
    expect(xml).toContain('<w:fldChar w:fldCharType="separate"');
    expect(xml).toContain('<w:fldChar w:fldCharType="end"');
    expect(xml).toMatch(/<w:instrText[^>]*>\s*PAGE\s*<\/w:instrText>/);
    expect(xml).toMatch(/<w:instrText[^>]*>\s*NUMPAGES\s*<\/w:instrText>/);

    // Anti-regression: the field code MUST NOT appear as plain `{PAGE}`
    // / `{NUMPAGES}` literal text in the serialized footer.
    expect(xml).not.toContain('{PAGE}');
    expect(xml).not.toContain('{NUMPAGES}');
  });

  test('PM round-trip (parse → toProseDoc → proseDocToBlocks → serialize) preserves fields', () => {
    const hf = parseFooter(FOOTER_WITH_PAGE_FIELD);

    // Convert into PM (mimics the InlineHeaderFooterEditor mount path).
    const pmDoc = headerFooterToProseDoc(hf.content);

    // Convert back (mimics handleHeaderFooterSave).
    const blocks = proseDocToBlocks(pmDoc);

    // Walk the round-tripped blocks for surviving fields.
    const rountrippedFields: string[] = [];
    for (const block of blocks) {
      if (block.type !== 'paragraph') continue;
      for (const item of (block as Paragraph).content) {
        if (item.type === 'complexField' || item.type === 'simpleField') {
          rountrippedFields.push(item.fieldType ?? '');
        }
      }
    }

    expect(rountrippedFields).toEqual(['PAGE', 'NUMPAGES']);

    // Now serialize the round-tripped HF and verify field XML survives
    // the full editor flow, not just the parser.
    const updated: HeaderFooter = { ...hf, content: blocks };
    const xml = serializeHeaderFooter(updated);

    expect(xml).toContain('<w:fldChar w:fldCharType="begin"');
    expect(xml).toMatch(/<w:instrText[^>]*>\s*PAGE\s*<\/w:instrText>/);
    expect(xml).toMatch(/<w:instrText[^>]*>\s*NUMPAGES\s*<\/w:instrText>/);
    expect(xml).not.toContain('{PAGE}');
    expect(xml).not.toContain('{NUMPAGES}');
  });

  // Word also writes `<w:fldSimple>` as a single-element form for
  // simple fields. The parser collapses this into `simpleField` items;
  // the serializer always emits the complex-field tripod (which is
  // wider-supported by OOXML consumers — see
  // paragraphSerializer.ts:634-677). Pin that behavior here.
  const FOOTER_WITH_SIMPLE_FIELD = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:fldSimple w:instr=" PAGE ">
      <w:r><w:t>1</w:t></w:r>
    </w:fldSimple>
  </w:p>
</w:ftr>`;

  test('w:fldSimple round-trips as a complex-field tripod (parser + serializer)', () => {
    const hf = parseFooter(FOOTER_WITH_SIMPLE_FIELD);
    const xml = serializeHeaderFooter(hf);

    expect(xml).toContain('<w:fldChar w:fldCharType="begin"');
    expect(xml).toContain('<w:fldChar w:fldCharType="separate"');
    expect(xml).toContain('<w:fldChar w:fldCharType="end"');
    expect(xml).toMatch(/<w:instrText[^>]*>\s*PAGE\s*<\/w:instrText>/);
    expect(xml).not.toContain('{PAGE}');
  });

  test('full PM round-trip on w:fldSimple preserves the field', () => {
    const hf = parseFooter(FOOTER_WITH_SIMPLE_FIELD);
    const pmDoc = headerFooterToProseDoc(hf.content);
    const blocks = proseDocToBlocks(pmDoc);

    const fields: string[] = [];
    for (const block of blocks) {
      if (block.type !== 'paragraph') continue;
      for (const item of (block as Paragraph).content) {
        if (item.type === 'complexField' || item.type === 'simpleField') {
          fields.push(item.fieldType ?? '');
        }
      }
    }
    expect(fields).toEqual(['PAGE']);

    const xml = serializeHeaderFooter({ ...hf, content: blocks });
    expect(xml).toMatch(/<w:instrText[^>]*>\s*PAGE\s*<\/w:instrText>/);
    expect(xml).not.toContain('{PAGE}');
  });
});
