/**
 * Regression test for #387 — opening and saving a DOCX where the run uses
 * a paragraph style (Heading1) that explicitly sets `ascii="Arial"` while
 * the document defaults supply `asciiTheme="minorHAnsi"` must not silently
 * reset the visible font to Calibri (the theme's minorFont) on save.
 *
 * Pre-fix the round-tripped run carried both `ascii="Arial"` AND
 * `asciiTheme="minorHAnsi"` — the theme attr wins at the OOXML render
 * layer and the user saw their Arial heading become Calibri.
 */
import { describe, test, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { parseDocx } from './parser';
import { toProseDoc, fromProseDoc } from '../prosemirror/conversion';
import { repackDocx } from './rezip';

const FIXTURE = path.resolve(
  __dirname,
  '../../../../e2e/fixtures/issue-387-font-theme-override.docx'
);

describe('Issue #387 — font theme/explicit pair must not leak across cascade', () => {
  test('round-tripping a Heading1 run preserves Arial (no asciiTheme leak)', async () => {
    const buf = fs.readFileSync(FIXTURE);
    const pkg = await parseDocx(buf);
    const doc = pkg.package.document;
    expect(doc).toBeDefined();

    // Round-trip the doc through PM and put the rebuilt content back into pkg.
    const pmDoc = toProseDoc(pkg, { styles: pkg.package.styles });
    const rebuilt = fromProseDoc(pmDoc, pkg);
    pkg.package.document.content = rebuilt.package.document.content;

    const out = await repackDocx(pkg);
    const xml = await readZipFile(out, 'word/document.xml');

    // Locate the rPr block belonging to the first 'Cláusula Décima Sexta' run.
    const idx = xml.indexOf('Cláusula Décima Sexta');
    expect(idx).toBeGreaterThan(0);
    const runStart = xml.lastIndexOf('<w:r>', idx);
    const runEnd = xml.indexOf('</w:r>', idx) + '</w:r>'.length;
    const runXml = xml.slice(runStart, runEnd);

    // After the fix the explicit ascii from the Heading1 style stands alone —
    // no `asciiTheme` attr leaks through from docDefaults to override it.
    expect(runXml).toContain('w:ascii="Arial"');
    expect(runXml).not.toContain('w:asciiTheme=');
    expect(runXml).not.toContain('w:hAnsiTheme=');
  });
});

async function readZipFile(buf: ArrayBuffer, filename: string): Promise<string> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buf);
  const file = zip.file(filename);
  if (!file) throw new Error(`Missing ${filename}`);
  return file.async('string');
}
