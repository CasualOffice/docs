import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import JSZip from 'jszip';
import { parseEndnotes, getEndnoteText } from '../footnoteParser';
import { setEndnotePlainText, replaceEndnotesInXml } from './footnoteSerializer';

const FIXTURE = join(__dirname, '../../../../../e2e/fixtures/demo.docx');

async function loadEndnotesXml(): Promise<string> {
  const zip = await JSZip.loadAsync(readFileSync(FIXTURE));
  const f = zip.file('word/endnotes.xml');
  return f ? await f.async('text') : '';
}

const blockOf = (xml: string, id: number) =>
  new RegExp(`<w:endnote\\b[^>]*\\bw:id="${id}"[^>]*>[\\s\\S]*?</w:endnote>`).exec(xml)![0];

describe('endnoteSerializer (text-surgery, opt-in)', () => {
  test('replaces only the edited endnote text; marker + others byte-identical', async () => {
    const xml = await loadEndnotesXml();
    expect(xml).toContain('<w:endnote');
    const map = parseEndnotes(xml);
    const edited = map.endnotes.find(
      (e) => (e.noteType ?? 'normal') === 'normal' && getEndnoteText(e).trim().length > 0
    )!;
    expect(edited).toBeTruthy();
    const other = map.endnotes.find((e) => e.id !== edited.id);

    setEndnotePlainText(edited, 'UNIQUE_ENDNOTE_EDIT_99');
    const out = replaceEndnotesInXml(xml, [edited]);

    const newBlock = blockOf(out, edited.id);
    expect(newBlock).toContain('UNIQUE_ENDNOTE_EDIT_99');
    expect(newBlock).toContain('<w:endnoteRef');
    if (other) expect(out).toContain(blockOf(xml, other.id));
    expect(out).toContain('<w:separator/>');

    expect(getEndnoteText(parseEndnotes(out).byId.get(edited.id)!)).toBe('UNIQUE_ENDNOTE_EDIT_99');
  });

  test('no edited endnotes → XML returned untouched', async () => {
    const xml = await loadEndnotesXml();
    expect(replaceEndnotesInXml(xml, [])).toBe(xml);
  });
});
