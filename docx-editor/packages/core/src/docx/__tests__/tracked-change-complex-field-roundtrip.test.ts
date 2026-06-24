/**
 * Pins the field-cluster drop in issue-319-sections.docx (and any other
 * fixture with a tracked-edit hyperlink field).
 *
 * Word writes tracked-edit hyperlinks as:
 *
 *   <w:del>                                  (or <w:ins>)
 *     <w:r><w:fldChar w:fldCharType="begin"/></w:r>
 *     <w:r><w:delInstrText>HYPERLINK "..."</w:delInstrText></w:r>
 *     <w:r><w:fldChar w:fldCharType="separate"/></w:r>
 *     <w:r><w:rPr><w:rStyle w:val="Hyperlink"/>...</w:rPr>
 *           <w:delText>label</w:delText></w:r>
 *     <w:r><w:fldChar w:fldCharType="end"/></w:r>
 *   </w:del>
 *
 * The previous bug:
 *   1. parseParagraphContents coalesced these begin/instr/sep/result/end
 *      runs into a single ComplexField item.
 *   2. The surrounding Insertion / Deletion filter only accepts
 *      Run | Hyperlink — ComplexField got dropped, taking every fldChar,
 *      rStyle, instrText, and delInstrText inside it.
 *
 * Fix: inside tracked context (insertion or deletion), keep runs raw.
 * The run serializer already rewrites w:t → w:delText and w:instrText →
 * w:delInstrText when emitting inside <w:del>.
 */

import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { parseDocx } from '../index';
import { repackDocx } from '../index';

const FIXTURE = new URL('../../../../../e2e/fixtures/issue-319-sections.docx', import.meta.url)
  .pathname;

async function tagCounts(buf: Buffer): Promise<Record<string, number>> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml')!.async('string');
  return {
    fldChar: (xml.match(/<w:fldChar/g) ?? []).length,
    rStyle: (xml.match(/<w:rStyle/g) ?? []).length,
    delInstrText: (xml.match(/<w:delInstrText/g) ?? []).length,
    instrText: (xml.match(/<w:instrText\b/g) ?? []).length,
  };
}

describe('tracked-change complex field round-trip', () => {
  test('issue-319-sections.docx preserves fldChar/rStyle/instrText counts', async () => {
    const buf = await readFile(FIXTURE);
    const before = await tagCounts(buf);

    const pkg = await parseDocx(buf as unknown as ArrayBuffer);
    const out = await repackDocx(pkg);
    const after = await tagCounts(Buffer.from(out));

    expect(after.fldChar).toBe(before.fldChar);
    expect(after.rStyle).toBe(before.rStyle);
    expect(after.delInstrText).toBe(before.delInstrText);
    expect(after.instrText).toBe(before.instrText);
  });
});
