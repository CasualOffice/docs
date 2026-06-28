/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Render real first-page PNG thumbnails for every home-page template.
 *
 * Pipeline: each .docx → LibreOffice headless → PNG → resized via
 * sharp-via-bun (canvas fallback if sharp not installed) → write to
 * examples/vite/public/templates/thumbs/<id>.png at ~480×620.
 *
 * Why LibreOffice rather than our own renderer? It runs without a
 * browser, ships in the existing fidelity-comparison harness, and
 * produces a recognizable preview that maps well to user expectation
 * — the same engine that powers the comparison report at
 * scripts/compare-fidelity.mjs.
 *
 * Run: bun scripts/make-template-thumbs.mjs
 * Requires: LibreOffice (`brew install --cask libreoffice` on macOS).
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOFFICE_CANDIDATES = [
  '/opt/homebrew/bin/soffice',
  '/usr/local/bin/soffice',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  '/usr/bin/soffice',
  '/usr/bin/libreoffice',
];
const soffice = SOFFICE_CANDIDATES.find((p) => existsSync(p));
if (!soffice) {
  console.error('LibreOffice not found. Install with: brew install --cask libreoffice');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, '..');
const TEMPLATE_DIR = join(projectRoot, 'examples/vite/public/templates');
const PUBLIC_DIR = join(projectRoot, 'examples/vite/public');
const THUMBS_DIR = join(TEMPLATE_DIR, 'thumbs');
mkdirSync(THUMBS_DIR, { recursive: true });

const tmp = mkdtempSync(join(tmpdir(), 'casual-thumbs-'));

/** Render a single .docx to PNG (first page) via LibreOffice headless. */
function renderDocx(docxPath, outName) {
  // LibreOffice writes <basename>.png in --outdir; pick that up + rename.
  execSync(
    `${JSON.stringify(soffice)} --headless --convert-to png --outdir ${JSON.stringify(tmp)} ${JSON.stringify(docxPath)}`,
    { stdio: ['ignore', 'ignore', 'inherit'] }
  );
  const base = basename(docxPath, '.docx');
  const fromPath = join(tmp, `${base}.png`);
  if (!existsSync(fromPath)) {
    console.error(`  ! LibreOffice produced no PNG for ${docxPath}`);
    return null;
  }
  const toPath = join(THUMBS_DIR, outName);
  copyFileSync(fromPath, toPath);
  return toPath;
}

const jobs = [];

// sample.docx lives at public/ root, not under templates/
if (existsSync(join(PUBLIC_DIR, 'sample.docx'))) {
  jobs.push({ docx: join(PUBLIC_DIR, 'sample.docx'), name: 'sample.png' });
}

for (const f of readdirSync(TEMPLATE_DIR)) {
  if (!f.endsWith('.docx')) continue;
  jobs.push({ docx: join(TEMPLATE_DIR, f), name: f.replace('.docx', '.png') });
}

console.log(`Rendering ${jobs.length} template thumbnails via LibreOffice…`);
for (const job of jobs) {
  const out = renderDocx(job.docx, job.name);
  if (out) {
    console.log(`  ${out.replace(projectRoot + '/', '')}`);
  }
}

// Blank-document thumbnail: hand-drawn SVG (no docx to render).
// Already exists as thumbs/blank.svg from the prior commit; keep it.
console.log('  (blank uses the hand-drawn SVG — keep thumbs/blank.svg)');

rmSync(tmp, { recursive: true, force: true });
console.log('done.');
