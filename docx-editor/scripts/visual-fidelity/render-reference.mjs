#!/usr/bin/env node
/**
 * Phase 0 visual-fidelity harness — REFERENCE render stage.
 *
 * Renders every fixture .docx to per-page PNGs using LibreOffice headless
 * (soffice → PDF) + PyMuPDF (PDF → PNG). This is the "ground truth" we
 * compare the editor's own render against.
 *
 * Output: <outDir>/reference/<fixture>-p<NN>.png
 *
 * LibreOffice is not Word, but it is a real OOXML layout engine and a far
 * better visual oracle than "the editor's own prior output" (which is all
 * the current visual-regression test compares against). Swapping in Word
 * PDFs later is a drop-in replacement for the reference/ dir.
 */
import { readdirSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FIXTURE_DIR = join(ROOT, 'e2e/fixtures');
const OUT_ROOT = join(ROOT, process.env.VF_OUT ?? 'visual-fidelity-out');
const OUT_DIR = join(OUT_ROOT, 'reference');
const PDF_DIR = join(OUT_ROOT, '_pdf');
const DPI = Number(process.env.VF_DPI ?? 150);
const ONLY = process.env.VF_ONLY?.split(',').map((s) => s.trim()).filter(Boolean);

const SOFFICE = process.env.SOFFICE ?? 'soffice';

rmSync(OUT_DIR, { recursive: true, force: true });
rmSync(PDF_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(PDF_DIR, { recursive: true });

const fixtures = readdirSync(FIXTURE_DIR)
  .filter((f) => f.endsWith('.docx'))
  .filter((f) => !ONLY || ONLY.includes(basename(f, '.docx')));

// 1) DOCX -> PDF (one soffice invocation per file; concurrent soffice is flaky).
for (const fixture of fixtures) {
  const name = basename(fixture, '.docx');
  try {
    execFileSync(
      SOFFICE,
      ['--headless', '--convert-to', 'pdf', '--outdir', PDF_DIR, join(FIXTURE_DIR, fixture)],
      { stdio: 'pipe', timeout: 60000 },
    );
    if (!existsSync(join(PDF_DIR, `${name}.pdf`))) throw new Error('no pdf produced');
    console.log(`[ref] pdf: ${name}`);
  } catch (err) {
    console.error(`[ref] pdf FAILED ${name}: ${String(err).split('\n')[0]}`);
  }
}

// 2) PDF -> per-page PNG via the existing PyMuPDF renderer.
const py = `
import fitz, pathlib, sys
src = pathlib.Path(sys.argv[1]); out = pathlib.Path(sys.argv[2]); dpi = int(sys.argv[3])
for pdf in sorted(src.glob('*.pdf')):
    try:
        doc = fitz.open(pdf)
        n = len(doc)
        for i, pg in enumerate(doc):
            pg.get_pixmap(dpi=dpi).save(out / f"{pdf.stem}-p{i+1:02d}.png")
        doc.close()
        print(f"[ref] png: {pdf.stem} ({n} page(s))")
    except Exception as e:
        print(f"[ref] png FAILED {pdf.stem}: {type(e).__name__}: {e}")
`;
execFileSync('python3', ['-c', py, PDF_DIR, OUT_DIR, String(DPI)], { stdio: 'inherit' });
console.log(`\n[ref] reference PNGs → ${OUT_DIR}`);
