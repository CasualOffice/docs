#!/usr/bin/env bun
/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Per-fixture round-trip tag audit.
 *
 * For every fixture: parse the DOCX, serialize the parsed model back to
 * document.xml, and tally:
 *   - element-name counts in the *input* document.xml
 *   - element-name counts in the *output* (re-serialized) document.xml
 *
 * Tags that exist in the input but vanish (or drop in count) in the
 * output are silent round-trip losses — they tell us exactly which
 * OOXML constructs we parse-but-don't-write or skip entirely.
 *
 * Usage:  bun run scripts/roundtrip-audit.mjs
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import JSZip from 'jszip';
import { parseDocx } from '../packages/core/src/docx/parser.ts';
import { serializeDocument } from '../packages/core/src/docx/serializer/documentSerializer.ts';

const FIXTURE_DIR = new URL('../e2e/fixtures', import.meta.url).pathname;
const REPORT_PATH = new URL('../roundtrip-audit-report.md', import.meta.url).pathname;

/** Pull every element open-tag from an XML string into a name → count map. */
function countTags(xml) {
  const counts = new Map();
  const re = /<([a-zA-Z][\w:.-]*)/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  }
  return counts;
}

/** Aggregate per-fixture diffs into a global rollup. */
const globalDiff = new Map(); // tag → { fixtures: Set, totalDropped }

const fixtures = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.docx'));
const perFixture = [];

for (const fixture of fixtures) {
  const filePath = join(FIXTURE_DIR, fixture);
  const name = basename(fixture, '.docx');
  let row = { name, error: null, dropped: [] };
  try {
    const buf = readFileSync(filePath);
    const zip = await JSZip.loadAsync(buf);
    const docFile = zip.file('word/document.xml');
    if (!docFile) {
      row.error = 'no word/document.xml';
      perFixture.push(row);
      continue;
    }
    const originalXml = await docFile.async('text');
    const doc = await parseDocx(buf.buffer);
    const outputXml = serializeDocument(doc);

    const inCounts = countTags(originalXml);
    const outCounts = countTags(outputXml);
    // Two signals:
    //   - vanished:  tag present in input, *zero* in output. Almost
    //     certainly a parse-but-drop or never-recognized element.
    //   - reduced:   tag count strictly decreased but not to zero. Often
    //     just consolidation (rPr/r/t collapse identical neighbors), so
    //     these are reported but not in the global rollup.
    const dropped = [];
    for (const [tag, count] of inCounts) {
      const after = outCounts.get(tag) ?? 0;
      if (after < count) {
        const delta = count - after;
        const vanished = after === 0;
        dropped.push({ tag, in: count, out: after, delta, vanished });
        if (vanished) {
          const entry = globalDiff.get(tag) ?? { fixtures: new Set(), totalDelta: 0 };
          entry.fixtures.add(name);
          entry.totalDelta += delta;
          globalDiff.set(tag, entry);
        }
      }
    }
    dropped.sort((a, b) => Number(b.vanished) - Number(a.vanished) || b.delta - a.delta);
    row.dropped = dropped;
  } catch (e) {
    row.error = String(e?.stack ?? e);
  }
  perFixture.push(row);
}

// Emit a human-readable markdown report.
const lines = [];
lines.push('# Per-fixture round-trip tag audit');
lines.push('');
lines.push('For each fixture, every OOXML element name in the input document.xml');
lines.push('is compared to the count in the re-serialized output. Tags with a');
lines.push('strictly lower output count are listed below — these are the');
lines.push('elements we parse-but-drop or never recognize.');
lines.push('');
lines.push('## Global rollup — tags that vanish entirely on round-trip');
lines.push('');
lines.push('Filtered to elements where output count is 0 — i.e. truly');
lines.push('parse-but-drop or never-recognized. Reduced-count noise (e.g. run');
lines.push('consolidation collapsing rPr/r/t neighbors) is excluded.');
lines.push('');
lines.push('| Tag | Total dropped | Fixtures affected |');
lines.push('|-----|---------------|-------------------|');
const rollup = [...globalDiff.entries()]
  .map(([tag, { fixtures, totalDelta }]) => ({ tag, totalDelta, fixtures: fixtures.size }))
  .sort((a, b) => b.totalDelta - a.totalDelta)
  .slice(0, 60);
for (const r of rollup) {
  lines.push(`| \`${r.tag}\` | ${r.totalDelta} | ${r.fixtures} |`);
}

lines.push('');
lines.push('## Per-fixture detail');
lines.push('');
for (const row of perFixture) {
  lines.push(`### ${row.name}`);
  if (row.error) {
    lines.push('');
    lines.push(`\`\`\``);
    lines.push(row.error);
    lines.push(`\`\`\``);
    lines.push('');
    continue;
  }
  if (row.dropped.length === 0) {
    lines.push('');
    lines.push('No round-trip drops.');
    lines.push('');
    continue;
  }
  lines.push('');
  // Only surface *vanished* tags per-fixture so noise stays out.
  const vanished = row.dropped.filter((d) => d.vanished);
  if (vanished.length === 0) {
    lines.push('');
    lines.push('No tags vanished on round-trip.');
    lines.push('');
    continue;
  }
  lines.push('');
  lines.push('| Tag | In | Out |');
  lines.push('|-----|----|-----|');
  for (const d of vanished.slice(0, 30)) {
    lines.push(`| \`${d.tag}\` | ${d.in} | ${d.out} |`);
  }
  if (vanished.length > 30) {
    lines.push(`| _…${vanished.length - 30} more_ | | |`);
  }
  lines.push('');
}

writeFileSync(REPORT_PATH, lines.join('\n'));
console.log(`Wrote ${REPORT_PATH}`);
console.log(`Top 10 dropped tags globally:`);
for (const r of rollup.slice(0, 10)) {
  console.log(`  ${r.tag.padEnd(28)} -${r.totalDelta} (in ${r.fixtures} fixtures)`);
}
