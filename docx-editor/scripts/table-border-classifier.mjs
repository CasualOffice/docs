#!/usr/bin/env node
/**
 * For every .docx in e2e/fixtures/, walk every <w:tbl> and report the
 * border-defining state that decides whether Word draws a closing line
 * below the last row. The output of this script is the input to deciding
 * what test cases we need to validate against Word / Google Docs /
 * LibreOffice for issue #395.
 *
 * For each table, captures:
 *   • table-level <w:tblBorders> (insideH / bottom presence)
 *   • <w:tblStyle w:val=...> reference and whether that style defines:
 *       - its own <w:tblBorders>
 *       - a <w:tblStylePr w:type="firstRow"> with a bottom border
 *       - a <w:tblStylePr w:type="lastRow"> with a bottom border
 *   • <w:tblLook> firstRow / lastRow flags
 *   • last row's per-cell <w:tcBorders><w:bottom>: present? value="nil"?
 *   • whether body rows carry explicit empty <w:tcBorders/> (clears)
 *
 * Output: a single markdown report at scripts/table-border-classifier.md
 * suitable for ground-truth validation against Word / Google Docs.
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const FIXTURES = resolve(REPO_ROOT, 'e2e/fixtures');
const OUT = resolve(HERE, 'table-border-classifier.md');

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

// Minimal XML walker — we only need element-name + attribute lookup, so
// regex over the well-formed Word XML is enough for an audit script. We
// avoid pulling in xml2js to keep this dependency-free.
function* iterTables(xml) {
  // Yields { outer: '<w:tbl>...</w:tbl>', startIdx } for each top-level table
  let i = 0;
  while (true) {
    const start = xml.indexOf('<w:tbl>', i);
    if (start < 0) return;
    // Match nested </w:tbl> by counting depth
    let depth = 1;
    let j = start + '<w:tbl>'.length;
    while (depth > 0) {
      const nextOpen = xml.indexOf('<w:tbl>', j);
      const nextClose = xml.indexOf('</w:tbl>', j);
      if (nextClose < 0) return;
      if (nextOpen >= 0 && nextOpen < nextClose) {
        depth++;
        j = nextOpen + '<w:tbl>'.length;
      } else {
        depth--;
        j = nextClose + '</w:tbl>'.length;
      }
    }
    yield { outer: xml.slice(start, j), startIdx: start };
    i = j;
  }
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\bw:${name}="([^"]*)"`));
  return m ? m[1] : null;
}

function findFirst(xml, tagName) {
  const m = xml.match(new RegExp(`<w:${tagName}(?:\\s[^>]*)?(?:/>|>)`));
  return m ? m[0] : null;
}

function findAll(xml, tagName) {
  // Returns the opening tags only; we don't need inner content here
  const re = new RegExp(`<w:${tagName}(?:\\s[^>]*)?(?:/>|>)`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(xml))) out.push(m[0]);
  return out;
}

function findTblStylePr(stylesXml, styleId, type) {
  // Returns the inner block of <w:tblStylePr w:type="type"> inside
  // <w:style w:styleId="styleId"> ... </w:style>
  const styleRe = new RegExp(
    `<w:style[^>]*w:styleId="${styleId}"[^>]*>([\\s\\S]*?)</w:style>`
  );
  const sm = stylesXml.match(styleRe);
  if (!sm) return null;
  const styleBody = sm[1];
  const tspRe = new RegExp(
    `<w:tblStylePr[^>]*w:type="${type}"[^>]*>([\\s\\S]*?)</w:tblStylePr>`
  );
  const tspm = styleBody.match(tspRe);
  return tspm ? tspm[1] : null;
}

function tblBordersInside(xml) {
  // Returns the inner block of the FIRST <w:tblBorders> ... </w:tblBorders>
  const m = xml.match(/<w:tblBorders>([\s\S]*?)<\/w:tblBorders>/);
  return m ? m[1] : null;
}

function hasNonNilBorderSide(bordersInner, side) {
  if (!bordersInner) return false;
  const re = new RegExp(`<w:${side}(?:\\s[^>]*)?(?:/>|>)`);
  const m = bordersInner.match(re);
  if (!m) return false;
  const val = attr(m[0], 'val');
  return val && val !== 'nil' && val !== 'none';
}

function summarizeBorderSide(bordersInner, side) {
  if (!bordersInner) return '—';
  const re = new RegExp(`<w:${side}(?:\\s[^>]*)?(?:/>|>)`);
  const m = bordersInner.match(re);
  if (!m) return '—';
  const val = attr(m[0], 'val');
  const sz = attr(m[0], 'sz');
  if (!val) return '<present, no val>';
  if (val === 'nil' || val === 'none') return 'nil';
  return `${val}${sz ? ` sz=${sz}` : ''}`;
}

async function classifyDocx(buf) {
  const zip = await JSZip.loadAsync(buf);
  const docFile = zip.file('word/document.xml');
  if (!docFile) return { tables: [], error: 'no document.xml' };
  const docXml = await docFile.async('string');
  const stylesFile = zip.file('word/styles.xml');
  const stylesXml = stylesFile ? await stylesFile.async('string') : '';

  const tables = [];
  let tableIdx = 0;
  for (const { outer } of iterTables(docXml)) {
    tableIdx++;
    const tblPr = (outer.match(/<w:tblPr>([\s\S]*?)<\/w:tblPr>/) ?? [])[1] ?? '';
    const tblStyleTag = findFirst(tblPr, 'tblStyle');
    const styleId = tblStyleTag ? attr(tblStyleTag, 'val') : null;

    // Inline table borders
    const inlineTblBordersInner = tblBordersInside(tblPr);
    const inlineBottom = summarizeBorderSide(inlineTblBordersInner, 'bottom');
    const inlineInsideH = summarizeBorderSide(inlineTblBordersInner, 'insideH');

    // Style chain (one level — TableNormal inheritance ignored to keep
    // the audit script short; if a fixture needs it we'll surface it)
    let styleBordersBottom = '—';
    let styleBordersInsideH = '—';
    let styleFirstRowBottom = '—';
    let styleLastRowBottom = '—';
    if (styleId && stylesXml) {
      const styleBlockRe = new RegExp(
        `<w:style[^>]*w:styleId="${styleId}"[^>]*>([\\s\\S]*?)</w:style>`
      );
      const sm = stylesXml.match(styleBlockRe);
      if (sm) {
        const styleBody = sm[1];
        const styleTblPr = (styleBody.match(/<w:tblPr>([\s\S]*?)<\/w:tblPr>/) ?? [])[1] ?? '';
        const styleTblBordersInner = tblBordersInside(styleTblPr);
        styleBordersBottom = summarizeBorderSide(styleTblBordersInner, 'bottom');
        styleBordersInsideH = summarizeBorderSide(styleTblBordersInner, 'insideH');
        const firstRowBody = findTblStylePr(stylesXml, styleId, 'firstRow');
        if (firstRowBody) {
          const fbBordersInner = (firstRowBody.match(/<w:tcBorders>([\s\S]*?)<\/w:tcBorders>/) ?? [])[1] ?? '';
          styleFirstRowBottom = summarizeBorderSide(fbBordersInner, 'bottom');
        }
        const lastRowBody = findTblStylePr(stylesXml, styleId, 'lastRow');
        if (lastRowBody) {
          const lbBordersInner = (lastRowBody.match(/<w:tcBorders>([\s\S]*?)<\/w:tcBorders>/) ?? [])[1] ?? '';
          styleLastRowBottom = summarizeBorderSide(lbBordersInner, 'bottom');
        }
      }
    }

    const tblLook = findFirst(tblPr, 'tblLook');
    const lookLastRow = tblLook ? attr(tblLook, 'lastRow') : null;
    const lookFirstRow = tblLook ? attr(tblLook, 'firstRow') : null;

    // Last row's per-cell <w:tcBorders><w:bottom>
    // Find rows by matching <w:tr...>...</w:tr> at the table's depth
    const rowRe = /<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g;
    const rows = outer.match(rowRe) ?? [];
    const lastRow = rows[rows.length - 1] ?? '';
    let lastRowCellBottoms = [];
    let lastRowHasEmptyTcBorders = false;
    let allBodyRowsHaveEmptyTcBorders = true;
    if (rows.length === 0) allBodyRowsHaveEmptyTcBorders = false;
    for (const cellMatch of (lastRow.match(/<w:tcBorders(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/w:tcBorders>)/g) ?? [])) {
      if (/^<w:tcBorders\s*\/>$/.test(cellMatch)) {
        lastRowHasEmptyTcBorders = true;
        lastRowCellBottoms.push('<empty />');
      } else {
        const inner = cellMatch.replace(/^<w:tcBorders[^>]*>|<\/w:tcBorders>$/g, '');
        lastRowCellBottoms.push(summarizeBorderSide(inner, 'bottom'));
      }
    }
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const tcBordersInRow = row.match(/<w:tcBorders(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/w:tcBorders>)/g) ?? [];
      if (tcBordersInRow.length === 0) {
        allBodyRowsHaveEmptyTcBorders = false;
        break;
      }
      if (!tcBordersInRow.every((c) => /^<w:tcBorders\s*\/>$/.test(c))) {
        allBodyRowsHaveEmptyTcBorders = false;
        break;
      }
    }

    tables.push({
      idx: tableIdx,
      rows: rows.length,
      styleId,
      inlineBottom,
      inlineInsideH,
      styleBordersBottom,
      styleBordersInsideH,
      styleFirstRowBottom,
      styleLastRowBottom,
      lookFirstRow,
      lookLastRow,
      lastRowCellBottoms,
      lastRowHasEmptyTcBorders,
      allBodyRowsHaveEmptyTcBorders,
    });
  }
  return { tables };
}

async function main() {
  const files = (await readdir(FIXTURES))
    .filter((f) => f.endsWith('.docx'))
    .sort();
  const lines = [];
  lines.push('# Table border classifier — fixture audit for #395');
  lines.push('');
  lines.push('Per-table classification of border-defining state. The');
  lines.push("`Predicted-bottom?` column is what our renderer should");
  lines.push('produce per ECMA-376 (and what we believe Word also does).');
  lines.push('Use this report to pick fixtures for ground-truth validation');
  lines.push('against Word / Google Docs / LibreOffice.');
  lines.push('');
  lines.push('## Legend');
  lines.push('');
  lines.push('- **inline B / I-H** — `<w:tblBorders>` bottom and insideH on the table itself');
  lines.push('- **style B / I-H** — `<w:tblBorders>` on the referenced `<w:tblStyle>`');
  lines.push('- **first/last B** — bottom border declared by `<w:tblStylePr w:type="firstRow"|"lastRow">`');
  lines.push('- **look fR/lR** — `<w:tblLook w:firstRow w:lastRow>` flags');
  lines.push('- **last-row cells bottom** — each cell\'s `<w:tcBorders><w:bottom>` in the last row');
  lines.push('- **#395-suspect** — true if last row has no non-nil bottom (predicted: open table)');
  lines.push('');
  for (const f of files) {
    const buf = await readFile(join(FIXTURES, f));
    let result;
    try {
      result = await classifyDocx(buf);
    } catch (e) {
      lines.push(`## ${f}`);
      lines.push(`\n_error: ${e.message}_\n`);
      continue;
    }
    if (result.error) {
      lines.push(`## ${f}`);
      lines.push(`\n_${result.error}_\n`);
      continue;
    }
    if (result.tables.length === 0) continue;
    lines.push(`## ${f}`);
    lines.push('');
    for (const t of result.tables) {
      const lastBottoms = t.lastRowCellBottoms.join(' | ') || '—';
      const hasAnyBottom =
        t.inlineBottom !== '—' && t.inlineBottom !== 'nil' ||
        t.styleBordersBottom !== '—' && t.styleBordersBottom !== 'nil' ||
        t.lastRowCellBottoms.some((b) => b !== '—' && b !== 'nil' && b !== '<empty />');
      const suspect = !hasAnyBottom;
      lines.push(
        `### Table ${t.idx} — ${t.rows} rows, style=${t.styleId ?? '(none)'}`
      );
      lines.push('');
      lines.push('| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |');
      lines.push('|---|---|---|---|---|---|---|---|---|');
      lines.push(
        `| ${t.inlineBottom} | ${t.inlineInsideH} | ${t.styleBordersBottom} | ${t.styleBordersInsideH} | ${t.styleFirstRowBottom} | ${t.styleLastRowBottom} | ${t.lookFirstRow ?? '—'}/${t.lookLastRow ?? '—'} | ${lastBottoms} | ${suspect ? '**yes**' : 'no'} |`
      );
      if (t.allBodyRowsHaveEmptyTcBorders) {
        lines.push('');
        lines.push('> _All body rows carry explicit empty `<w:tcBorders/>` (border clear) — pattern from #395._');
      }
      lines.push('');
    }
  }
  await writeFile(OUT, lines.join('\n'));
  // Console summary
  const totalTables = await Promise.all(files.map(async (f) => {
    const buf = await readFile(join(FIXTURES, f));
    try {
      const r = await classifyDocx(buf);
      return r.tables ?? [];
    } catch {
      return [];
    }
  }));
  const all = totalTables.flat();
  const suspects = all.filter((t) => {
    const hasAnyBottom =
      t.inlineBottom !== '—' && t.inlineBottom !== 'nil' ||
      t.styleBordersBottom !== '—' && t.styleBordersBottom !== 'nil' ||
      t.lastRowCellBottoms.some((b) => b !== '—' && b !== 'nil' && b !== '<empty />');
    return !hasAnyBottom;
  });
  console.log(`Wrote ${OUT}`);
  console.log(`${files.length} fixtures, ${all.length} tables total, ${suspects.length} #395-suspect.`);
}

await main();
