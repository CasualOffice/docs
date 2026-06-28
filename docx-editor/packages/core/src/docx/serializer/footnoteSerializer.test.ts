/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import JSZip from 'jszip';
import { parseFootnotes, getFootnoteText } from '../footnoteParser';
import { setFootnotePlainText, replaceFootnotesInXml } from './footnoteSerializer';

const FIXTURE = join(__dirname, '../../../../../e2e/fixtures/demo.docx');

async function loadFootnotesXml(): Promise<string> {
  const zip = await JSZip.loadAsync(readFileSync(FIXTURE));
  const f = zip.file('word/footnotes.xml');
  return f ? await f.async('text') : '';
}

function blockOf(xml: string, id: number): string {
  return new RegExp(`<w:footnote\\b[^>]*\\bw:id="${id}"[^>]*>[\\s\\S]*?</w:footnote>`).exec(
    xml
  )![0];
}

describe('footnoteSerializer (text-surgery, opt-in)', () => {
  test('replaces only the edited footnote text; marker + other footnotes byte-identical', async () => {
    const xml = await loadFootnotesXml();
    expect(xml).toContain('<w:footnote');
    const map = parseFootnotes(xml);
    const edited = map.footnotes.find(
      (f) => (f.noteType ?? 'normal') === 'normal' && getFootnoteText(f).trim().length > 0
    )!;
    expect(edited).toBeTruthy();
    const other = map.footnotes.find((f) => f.id !== edited.id);

    setFootnotePlainText(edited, 'UNIQUE_EDITED_MARKER_42');
    const out = replaceFootnotesInXml(xml, [edited]);

    // new text present, old text gone from that block
    const newBlock = blockOf(out, edited.id);
    expect(newBlock).toContain('UNIQUE_EDITED_MARKER_42');
    // the number marker survives (it paints the footnote number)
    expect(newBlock).toContain('<w:footnoteRef');
    // an untouched footnote's block is byte-identical
    if (other) expect(out).toContain(blockOf(xml, other.id));
    // the separator footnote is never touched
    expect(out).toContain('<w:separator/>');

    // re-parsing the edited XML yields the new text
    const reMap = parseFootnotes(out);
    expect(getFootnoteText(reMap.byId.get(edited.id)!)).toBe('UNIQUE_EDITED_MARKER_42');
  });

  test('no edited footnotes → XML returned untouched (verbatim guarantee)', async () => {
    const xml = await loadFootnotesXml();
    expect(replaceFootnotesInXml(xml, [])).toBe(xml);
  });

  test('setFootnotePlainText updates the model text for live re-render', async () => {
    const xml = await loadFootnotesXml();
    const fn = parseFootnotes(xml).footnotes.find(
      (f) => (f.noteType ?? 'normal') === 'normal' && getFootnoteText(f).trim().length > 0
    )!;
    setFootnotePlainText(fn, 'Edited body XYZ');
    expect(getFootnoteText(fn)).toBe('Edited body XYZ');
  });
});
