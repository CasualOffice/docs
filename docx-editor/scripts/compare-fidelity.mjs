#!/usr/bin/env bun
/**
 * Three-way fidelity comparison: Casual Editor vs LibreOffice vs OnlyOffice.
 *
 * For each fixture, run each engine's docx → docx round-trip, then diff the
 * resulting document.xml against the original at the tag level. Emit a
 * scorecard showing per-fixture and aggregate retention so we can track our
 * relative position over time.
 *
 * Engines:
 *   - us:         parser + serializer in this repo (always runs)
 *   - libreoffice: requires `soffice` on PATH (or LIBREOFFICE_BIN env)
 *                  install: `brew install --cask libreoffice` (macOS)
 *                           `apt-get install libreoffice` (Debian/Ubuntu)
 *   - onlyoffice: requires `docker` + the `onlyoffice/documentbuilder` image
 *                 (set ONLYOFFICE_DOCBUILDER_IMAGE to override the default
 *                 tag, or set ONLYOFFICE_DOCBUILDER to point at a local bin)
 *
 * Missing engines are skipped without aborting — desktop devs can run
 * us-only as a smoke test, and CI runs all three when the images are warm.
 *
 * Usage:
 *   bun run scripts/compare-fidelity.mjs                  # run all available
 *   bun run scripts/compare-fidelity.mjs --engines=us,libreoffice
 *   bun run scripts/compare-fidelity.mjs --out=report.md  # custom output path
 *   bun run scripts/compare-fidelity.mjs --fixtures=demo,empty
 *
 * Exit codes:
 *   0 — report written
 *   1 — fixture/engine failure aborted before the report was complete
 *   2 — report written but our pristine-fixture share dropped below FLOOR
 */
import {
  readFileSync,
  readdirSync,
  writeFileSync,
  mkdtempSync,
  copyFileSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import JSZip from 'jszip';
import { parseDocx } from '../packages/core/src/docx/parser.ts';
import { serializeDocument } from '../packages/core/src/docx/serializer/documentSerializer.ts';

// ─── Config ────────────────────────────────────────────────────────

const FIXTURE_DIR = new URL('../e2e/fixtures', import.meta.url).pathname;
const DEFAULT_OUT = new URL('../fidelity-compare-report.md', import.meta.url).pathname;
// Pristine-share floor. We promote ourselves as lightweight; we don't need
// to clear OnlyOffice's bar but we won't ship a desktop release below this.
const PRISTINE_FLOOR = Number(process.env.FIDELITY_FLOOR ?? 0.5);
const ONLYOFFICE_IMAGE = process.env.ONLYOFFICE_DOCBUILDER_IMAGE ?? 'onlyoffice/documentbuilder:latest';

// ─── Arg parsing ───────────────────────────────────────────────────

const args = new Map(
  process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    return m ? [m[1], m[2] ?? 'true'] : [a, 'true'];
  })
);
const OUT = args.get('out') ?? DEFAULT_OUT;
const REQUESTED_ENGINES = (args.get('engines') ?? 'us,libreoffice,onlyoffice')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const FIXTURE_FILTER = args.get('fixtures')
  ? new Set(args.get('fixtures').split(',').map((s) => s.trim()))
  : null;

// ─── Tag counting (shared with roundtrip-audit) ────────────────────

function countTags(xml) {
  const counts = new Map();
  const re = /<([a-zA-Z][\w:.-]*)/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  }
  return counts;
}

async function extractDocumentXml(buf) {
  const zip = await JSZip.loadAsync(buf);
  const file = zip.file('word/document.xml');
  if (!file) throw new Error('no word/document.xml in archive');
  return file.async('text');
}

// Score a single round-trip output against the original input.
// Returns { totalIn, dropped, retention, pristine, vanishedTags }.
function score(originalXml, roundTrippedXml) {
  const inCounts = countTags(originalXml);
  const outCounts = countTags(roundTrippedXml);
  let totalIn = 0;
  let totalDropped = 0;
  const vanishedTags = [];
  for (const [tag, count] of inCounts) {
    totalIn += count;
    const after = outCounts.get(tag) ?? 0;
    if (after < count) {
      const delta = count - after;
      totalDropped += delta;
      if (after === 0) vanishedTags.push({ tag, delta });
    }
  }
  vanishedTags.sort((a, b) => b.delta - a.delta);
  return {
    totalIn,
    dropped: totalDropped,
    retention: totalIn === 0 ? 1 : 1 - totalDropped / totalIn,
    pristine: totalDropped === 0,
    vanishedTags,
  };
}

// ─── Engine: us (in-process parse → serialize) ─────────────────────

async function roundTripUs(inputBuf) {
  const doc = await parseDocx(inputBuf.buffer.slice(0));
  return serializeDocument(doc);
}

// ─── Engine: LibreOffice (soffice headless convert-to docx) ───────

function libreofficeBin() {
  if (process.env.LIBREOFFICE_BIN) return process.env.LIBREOFFICE_BIN;
  for (const candidate of [
    'soffice',
    'libreoffice',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  ]) {
    const res = spawnSync('command', ['-v', candidate], { encoding: 'utf8' });
    if (res.status === 0 && res.stdout.trim()) return res.stdout.trim();
    if (candidate.startsWith('/') && existsSync(candidate)) return candidate;
  }
  return null;
}

async function roundTripLibreOffice(inputPath, workDir) {
  const bin = libreofficeBin();
  if (!bin) throw new Error('LibreOffice not found');
  const res = spawnSync(
    bin,
    ['--headless', '--norestore', '--convert-to', 'docx', '--outdir', workDir, inputPath],
    { encoding: 'utf8', timeout: 60_000 }
  );
  if (res.status !== 0) {
    throw new Error(`soffice exit ${res.status}: ${res.stderr || res.stdout}`);
  }
  const outPath = join(workDir, basename(inputPath));
  if (!existsSync(outPath)) {
    throw new Error(`soffice produced no output at ${outPath}`);
  }
  return extractDocumentXml(readFileSync(outPath));
}

// ─── Engine: OnlyOffice DocumentBuilder (via Docker) ───────────────
//
// docbuilder consumes a small .docbuilder JS file describing what to do.
// We write a minimal "open → save same path" script per fixture.

const DOCBUILDER_SCRIPT = (inDocker, outDocker) => `\
builder.OpenFile("${inDocker}");
builder.SaveFile("docx", "${outDocker}");
builder.CloseFile();
`;

function hasDocker() {
  const res = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], {
    encoding: 'utf8',
    timeout: 5_000,
  });
  return res.status === 0;
}

async function roundTripOnlyOffice(inputPath, workDir) {
  if (!hasDocker()) throw new Error('docker not available');
  const inName = basename(inputPath);
  const outName = inName;
  const scriptPath = join(workDir, 'script.docbuilder');
  copyFileSync(inputPath, join(workDir, inName));
  writeFileSync(
    scriptPath,
    DOCBUILDER_SCRIPT(`/data/${inName}`, `/data/out-${outName}`)
  );
  const res = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '-v',
      `${workDir}:/data`,
      ONLYOFFICE_IMAGE,
      '/data/script.docbuilder',
    ],
    { encoding: 'utf8', timeout: 120_000 }
  );
  if (res.status !== 0) {
    throw new Error(`docbuilder exit ${res.status}: ${res.stderr || res.stdout}`);
  }
  const outPath = join(workDir, `out-${outName}`);
  if (!existsSync(outPath)) {
    throw new Error(`docbuilder produced no output at ${outPath}`);
  }
  return extractDocumentXml(readFileSync(outPath));
}

// ─── Engine availability ───────────────────────────────────────────

function probeEngines() {
  const available = ['us'];
  const skipped = [];
  if (REQUESTED_ENGINES.includes('libreoffice')) {
    if (libreofficeBin()) available.push('libreoffice');
    else skipped.push(['libreoffice', 'soffice not on PATH']);
  }
  if (REQUESTED_ENGINES.includes('onlyoffice')) {
    if (hasDocker()) available.push('onlyoffice');
    else skipped.push(['onlyoffice', 'docker not available']);
  }
  return { available, skipped };
}

// ─── Per-fixture run ───────────────────────────────────────────────

async function runFixture(fixturePath, name, engines, workRoot) {
  const inputBuf = readFileSync(fixturePath);
  const originalXml = await extractDocumentXml(inputBuf);
  const totalIn = [...countTags(originalXml).values()].reduce((a, b) => a + b, 0);
  const row = { name, totalIn, results: {} };
  for (const engine of engines) {
    const workDir = mkdtempSync(join(workRoot, `${engine}-${name}-`));
    try {
      let outXml;
      switch (engine) {
        case 'us':
          outXml = await roundTripUs(inputBuf);
          break;
        case 'libreoffice':
          outXml = await roundTripLibreOffice(fixturePath, workDir);
          break;
        case 'onlyoffice':
          outXml = await roundTripOnlyOffice(fixturePath, workDir);
          break;
        default:
          throw new Error(`unknown engine ${engine}`);
      }
      row.results[engine] = score(originalXml, outXml);
    } catch (err) {
      row.results[engine] = { error: String(err?.message ?? err) };
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  }
  return row;
}

// ─── Aggregate + render ────────────────────────────────────────────

function aggregate(rows, engines) {
  const totals = Object.fromEntries(
    engines.map((e) => [e, { fixtures: 0, errors: 0, pristine: 0, totalIn: 0, dropped: 0 }])
  );
  for (const row of rows) {
    for (const engine of engines) {
      const r = row.results[engine];
      const t = totals[engine];
      t.fixtures += 1;
      if (!r || r.error) {
        t.errors += 1;
        continue;
      }
      t.totalIn += r.totalIn ?? row.totalIn;
      t.dropped += r.dropped;
      if (r.pristine) t.pristine += 1;
    }
  }
  return totals;
}

function pct(n, d) {
  if (!d) return '–';
  return `${((n / d) * 100).toFixed(1)}%`;
}

function fmtRetention(r) {
  if (!r) return '–';
  if (r.error) return `❌ err`;
  if (r.pristine) return `✅ 100%`;
  return `${(r.retention * 100).toFixed(1)}%`;
}

function renderReport(rows, engines, totals, skipped) {
  const lines = [];
  lines.push('# Fidelity comparison — Casual Editor vs reference engines');
  lines.push('');
  lines.push(
    'Each fixture is round-tripped through every available engine (open → save'
  );
  lines.push(
    'as `.docx`); the resulting `document.xml` is compared against the input at'
  );
  lines.push(
    'the tag-count level. **Retention** = `1 - (sum dropped tags / sum input tags)`.'
  );
  lines.push(
    'A fixture is **pristine** when no input tag count drops in the output.'
  );
  lines.push('');
  lines.push('Tag-count retention is an imperfect signal — engines may emit');
  lines.push('semantically-equivalent XML with different element splits (runs');
  lines.push('consolidating, e.g.), which shows up as a "drop" even though the');
  lines.push('content is unchanged. Use the pristine count as the strict bar,');
  lines.push('and retention as the gradient.');
  lines.push('');
  if (skipped.length) {
    lines.push('### Engines skipped this run');
    lines.push('');
    for (const [engine, reason] of skipped) {
      lines.push(`- **${engine}**: ${reason}`);
    }
    lines.push('');
  }
  lines.push('## Aggregate');
  lines.push('');
  lines.push('| Engine | Fixtures | Pristine | Mean tag retention | Errors |');
  lines.push('|--------|---------:|---------:|-------------------:|-------:|');
  for (const engine of engines) {
    const t = totals[engine];
    const retention = t.totalIn ? 1 - t.dropped / t.totalIn : 1;
    lines.push(
      `| **${engine}** | ${t.fixtures} | ${t.pristine}/${t.fixtures} (${pct(
        t.pristine,
        t.fixtures
      )}) | ${(retention * 100).toFixed(2)}% | ${t.errors} |`
    );
  }
  lines.push('');
  lines.push('## Per-fixture');
  lines.push('');
  const header = ['Fixture', 'Tags in', ...engines];
  lines.push('| ' + header.join(' | ') + ' |');
  lines.push('|' + header.map(() => '---').join('|') + '|');
  for (const row of rows.slice().sort((a, b) => a.name.localeCompare(b.name))) {
    const cells = [
      row.name,
      String(row.totalIn),
      ...engines.map((e) => fmtRetention(row.results[e])),
    ];
    lines.push('| ' + cells.join(' | ') + ' |');
  }
  lines.push('');
  lines.push('## Top dropped tags — our engine');
  lines.push('');
  const ourDrops = new Map();
  for (const row of rows) {
    const r = row.results.us;
    if (!r || r.error || !r.vanishedTags) continue;
    for (const v of r.vanishedTags) {
      const e = ourDrops.get(v.tag) ?? { total: 0, fixtures: 0 };
      e.total += v.delta;
      e.fixtures += 1;
      ourDrops.set(v.tag, e);
    }
  }
  if (ourDrops.size === 0) {
    lines.push('No tags vanished in any fixture — full coverage on this set.');
  } else {
    lines.push('| Tag | Total dropped | Fixtures |');
    lines.push('|-----|--------------:|---------:|');
    [...ourDrops.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 30)
      .forEach(([tag, { total, fixtures }]) => {
        lines.push(`| \`${tag}\` | ${total} | ${fixtures} |`);
      });
  }
  lines.push('');
  return lines.join('\n');
}

// ─── Main ──────────────────────────────────────────────────────────

(async () => {
  const { available, skipped } = probeEngines();
  console.log(`Engines: ${available.join(', ')}`);
  if (skipped.length) {
    for (const [e, reason] of skipped) console.log(`  skipped ${e}: ${reason}`);
  }

  let fixtures = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.docx'));
  if (FIXTURE_FILTER) {
    fixtures = fixtures.filter((f) =>
      FIXTURE_FILTER.has(basename(f, '.docx'))
    );
  }

  const workRoot = mkdtempSync(join(tmpdir(), 'fidelity-compare-'));
  const rows = [];
  for (const fixture of fixtures) {
    const name = basename(fixture, '.docx');
    process.stdout.write(`  ${name} … `);
    const row = await runFixture(join(FIXTURE_DIR, fixture), name, available, workRoot);
    rows.push(row);
    const summary = available
      .map((e) => `${e}=${fmtRetention(row.results[e])}`)
      .join('  ');
    console.log(summary);
  }
  rmSync(workRoot, { recursive: true, force: true });

  const totals = aggregate(rows, available);
  const md = renderReport(rows, available, totals, skipped);
  writeFileSync(OUT, md);
  console.log(`\nWrote ${OUT}`);

  // Floor check — fail the run if our pristine share dropped below the
  // configured floor. Lets CI gate releases on regressions.
  const us = totals.us;
  const share = us.fixtures ? us.pristine / us.fixtures : 0;
  console.log(
    `our pristine share: ${us.pristine}/${us.fixtures} = ${(share * 100).toFixed(1)}%  (floor=${(PRISTINE_FLOOR * 100).toFixed(0)}%)`
  );
  if (share < PRISTINE_FLOOR) {
    console.error(
      `\n✗ FAIL: pristine share ${(share * 100).toFixed(1)}% < floor ${(PRISTINE_FLOOR * 100).toFixed(0)}%`
    );
    process.exit(2);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
