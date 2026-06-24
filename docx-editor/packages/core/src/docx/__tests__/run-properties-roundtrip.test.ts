/**
 * Pins three small run-property drops:
 *
 *   <w:highlight w:val="none"/>  — explicit "no highlight" override;
 *       the serializer was skipping it because the consumer guard
 *       (`!== 'none'`) was applied at the wrong layer (it belongs to
 *       render-time, not serialize-time). Two instances in
 *       titlePg-header-footer.docx.
 *
 *   <w:bdr w:val="single" w:sz="4" w:space="0" w:color="auto"/>  — run
 *       border (§17.3.2.4). The TextFormatting model didn't carry it at
 *       all. One instance in demo.docx.
 *
 *   <w:bookmarkEnd w:id="0"/>  — bookmark end anchored as a direct child
 *       of <w:tbl>, after the last <w:tr>. Word writes this when a range
 *       starts inside a cell and closes at the table boundary. parseTable
 *       was iterating <w:tr> only. One instance in
 *       medical-incident-form.docx; preserved via Table.trailingBookmarks.
 */

import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { parseDocx, repackDocx } from '../index';

const FIXTURE_DIR = new URL('../../../../../e2e/fixtures/', import.meta.url).pathname;

async function tagCounts(
  buf: Buffer | Uint8Array,
  tags: string[]
): Promise<Record<string, number>> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml')!.async('string');
  return Object.fromEntries(
    tags.map((t) => [t, (xml.match(new RegExp(`<w:${t}\\b`, 'g')) ?? []).length])
  );
}

async function roundTrip(buf: Buffer): Promise<Buffer> {
  const pkg = await parseDocx(buf as unknown as ArrayBuffer);
  return Buffer.from(await repackDocx(pkg));
}

describe('run-property and table-trailing-bookmark round-trip', () => {
  test('titlePg-header-footer.docx preserves <w:highlight w:val="none"/>', async () => {
    const buf = await readFile(`${FIXTURE_DIR}titlePg-header-footer.docx`);
    const before = await tagCounts(buf, ['highlight']);
    const after = await tagCounts(await roundTrip(buf), ['highlight']);
    expect(after.highlight).toBe(before.highlight);
  });

  test('demo.docx preserves <w:bdr> run border', async () => {
    const buf = await readFile(`${FIXTURE_DIR}demo.docx`);
    const before = await tagCounts(buf, ['bdr']);
    const after = await tagCounts(await roundTrip(buf), ['bdr']);
    expect(after.bdr).toBe(before.bdr);
  });

  test('medical-incident-form.docx preserves <w:bookmarkEnd> at <w:tbl> level', async () => {
    const buf = await readFile(`${FIXTURE_DIR}medical-incident-form.docx`);
    const before = await tagCounts(buf, ['bookmarkStart', 'bookmarkEnd']);
    const after = await tagCounts(await roundTrip(buf), ['bookmarkStart', 'bookmarkEnd']);
    expect(after.bookmarkStart).toBe(before.bookmarkStart);
    expect(after.bookmarkEnd).toBe(before.bookmarkEnd);
  });
});
