/**
 * Generate the Casual Docs home-page templates as real .docx files.
 *
 * Outputs go to examples/vite/public/templates/, plus the showcase
 * sample to examples/vite/public/sample.docx (replacing the upstream
 * 'Welcome to DOCX JS Editor' branding with a Casual Docs flavour).
 *
 * Each template is built from a tiny JS DSL (h/p/r/bullet) that
 * lowers to WordprocessingML, then bundled into a minimal .docx via
 * JSZip — same pattern as scripts/make-*-fixture.mjs.
 *
 * Run: bun scripts/make-home-templates.mjs
 */

import JSZip from 'jszip';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, '..');
const TEMPLATE_DIR = join(projectRoot, 'examples/vite/public/templates');
const PUBLIC_DIR = join(projectRoot, 'examples/vite/public');
mkdirSync(TEMPLATE_DIR, { recursive: true });

// ---------- OOXML DSL ----------

/** XML-escape (the strict five entities; OOXML is XML 1.0). */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Run formatting → <w:rPr>. */
function rPr(opts = {}) {
  const parts = [];
  if (opts.bold) parts.push('<w:b/>');
  if (opts.italic) parts.push('<w:i/>');
  if (opts.underline) parts.push('<w:u w:val="single"/>');
  if (opts.color) parts.push(`<w:color w:val="${opts.color}"/>`);
  if (opts.sz) parts.push(`<w:sz w:val="${opts.sz}"/>`); // half-points
  if (opts.font) parts.push(`<w:rFonts w:ascii="${opts.font}" w:hAnsi="${opts.font}"/>`);
  return parts.length ? `<w:rPr>${parts.join('')}</w:rPr>` : '';
}

/** A run: text with optional formatting. */
function r(text, opts = {}) {
  const space = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : '';
  return `<w:r>${rPr(opts)}<w:t${space}>${esc(text)}</w:t></w:r>`;
}

/** Paragraph formatting → <w:pPr>. */
function pPr(opts = {}) {
  const parts = [];
  if (opts.style) parts.push(`<w:pStyle w:val="${opts.style}"/>`);
  if (opts.align) parts.push(`<w:jc w:val="${opts.align}"/>`);
  if (opts.spaceBefore || opts.spaceAfter) {
    const before = opts.spaceBefore ?? 0;
    const after = opts.spaceAfter ?? 0;
    parts.push(`<w:spacing w:before="${before}" w:after="${after}"/>`);
  }
  if (opts.numId !== undefined && opts.ilvl !== undefined) {
    parts.push(
      `<w:numPr><w:ilvl w:val="${opts.ilvl}"/><w:numId w:val="${opts.numId}"/></w:numPr>`
    );
  }
  return parts.length ? `<w:pPr>${parts.join('')}</w:pPr>` : '';
}

/** A paragraph: array of runs + optional pPr opts. */
function p(runs, pOpts = {}) {
  return `<w:p>${pPr(pOpts)}${runs.join('')}</w:p>`;
}

/** Heading sugar. */
function h(text, level = 1, runOpts = {}) {
  return p([r(text, runOpts)], { style: `Heading${level}` });
}

/** Bullet-list item. numId=1 is the bullet list defined in numbering.xml. */
function bullet(runs, level = 0) {
  return p(runs, { style: 'ListBullet', numId: 1, ilvl: level });
}

/** Numbered list item. numId=2 is the decimal numbered list. */
function numbered(runs, level = 0) {
  return p(runs, { style: 'ListNumber', numId: 2, ilvl: level });
}

/** Small table helper — 3 columns wide, simple borders. */
function table(rows) {
  const tbl = [
    '<w:tbl>',
    '<w:tblPr>',
    '<w:tblStyle w:val="TableGrid"/>',
    '<w:tblW w:w="0" w:type="auto"/>',
    '<w:tblBorders>',
    '<w:top w:val="single" w:sz="4" w:color="CBD5E1"/>',
    '<w:left w:val="single" w:sz="4" w:color="CBD5E1"/>',
    '<w:bottom w:val="single" w:sz="4" w:color="CBD5E1"/>',
    '<w:right w:val="single" w:sz="4" w:color="CBD5E1"/>',
    '<w:insideH w:val="single" w:sz="4" w:color="CBD5E1"/>',
    '<w:insideV w:val="single" w:sz="4" w:color="CBD5E1"/>',
    '</w:tblBorders>',
    '</w:tblPr>',
    '<w:tblGrid>',
    ...rows[0].map(() => '<w:gridCol w:w="3120"/>'),
    '</w:tblGrid>',
  ];
  rows.forEach((row, ri) => {
    tbl.push('<w:tr>');
    row.forEach((cellText) => {
      const isHeader = ri === 0;
      const shading = isHeader ? '<w:shd w:val="clear" w:fill="EFF6FF"/>' : '';
      tbl.push(
        `<w:tc><w:tcPr><w:tcW w:w="3120" w:type="dxa"/>${shading}</w:tcPr>${p([
          r(cellText, isHeader ? { bold: true, color: '1E40AF' } : {}),
        ])}</w:tc>`
      );
    });
    tbl.push('</w:tr>');
  });
  tbl.push('</w:tbl>');
  return tbl.join('');
}

// ---------- shared .docx scaffolding ----------

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
        <w:sz w:val="22"/>
        <w:color w:val="1F2937"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:after="120" w:line="288" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="40"/><w:color w:val="0F172A"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:pPr><w:spacing w:before="200" w:after="80"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="28"/><w:color w:val="1E40AF"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:pPr><w:spacing w:before="160" w:after="60"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="334155"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/></w:style>
  <w:style w:type="paragraph" w:styleId="ListNumber"><w:name w:val="List Number"/></w:style>
  <w:style w:type="table" w:styleId="TableGrid">
    <w:name w:val="Table Grid"/>
    <w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="CBD5E1"/></w:tblBorders></w:tblPr>
  </w:style>
</w:styles>`;

const NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol"/></w:rPr></w:lvl>
    <w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/><w:lvlText w:val="◦"/><w:pPr><w:ind w:left="1440" w:hanging="360"/></w:pPr></w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="1">
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;

const SECT_PR = `
  <w:sectPr>
    <w:pgSz w:w="12240" w:h="15840"/>
    <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    <w:docGrid w:linePitch="360"/>
  </w:sectPr>`;

function buildDocument(bodyXml) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
${bodyXml}
${SECT_PR}
  </w:body>
</w:document>`;
}

async function writeDocx(outPath, body) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', RELS);
  zip.file('word/_rels/document.xml.rels', DOC_RELS);
  zip.file('word/document.xml', buildDocument(body));
  zip.file('word/styles.xml', STYLES);
  zip.file('word/numbering.xml', NUMBERING);
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  writeFileSync(outPath, buf);
  console.log(`  ${outPath.replace(projectRoot + '/', '')} (${buf.byteLength} bytes)`);
}

// ---------- templates ----------

const SAMPLE_BODY = [
  h('Welcome to Casual Docs', 1),
  p([
    r(
      'A casual, real-time collaborative .docx editor — built for the browser. Open Word documents, edit them in place, and save them back as .docx.'
    ),
  ]),
  h('What you can do', 2),
  bullet([r('Rich text — bold, italic, underline, strikethrough, colors, highlights')]),
  bullet([r('Headings, alignment, line spacing, indentation')]),
  bullet([r('Tables, borders, shading, merged cells')]),
  bullet([r('Images, hyperlinks, footnotes, headers and footers')]),
  bullet([r('Real-time collaboration (in the Docker build)')]),
  h('Formatting showcase', 2),
  p([
    r('Bold', { bold: true }),
    r(', '),
    r('italic', { italic: true }),
    r(', '),
    r('underline', { underline: true }),
    r(', '),
    r('coloured', { color: '2563EB' }),
    r(', and '),
    r('bold blue', { bold: true, color: '1E40AF' }),
    r('.'),
  ]),
  h('Sample table', 2),
  table([
    ['Feature', 'Status', 'Notes'],
    ['Editing', 'Available', 'WYSIWYG'],
    ['Round-trip save', 'Available', 'Preserves OOXML'],
    ['Real-time co-edit', 'Docker build', 'Yjs over WebSocket'],
  ]),
  p([r('')], {}),
  p([r('Click anywhere and start typing — this entire document is editable.', { italic: true, color: '64748B' })], { align: 'center' }),
].join('\n');

const RESUME_BODY = [
  p([r('Alex Morgan', { bold: true, sz: 56, color: '0F172A' })], { align: 'center' }),
  p(
    [r('Software Engineer · alex@example.com · (555) 123-4567 · linkedin.com/in/alexmorgan', { color: '64748B' })],
    { align: 'center' }
  ),
  h('Summary', 2),
  p([
    r(
      'Engineer with 7 years of experience building reliable web applications. Comfortable across the stack — TypeScript, Go, and React — with a particular interest in editor tooling and real-time collaboration.'
    ),
  ]),
  h('Experience', 2),
  p([r('Senior Software Engineer · Acme Corp', { bold: true })]),
  p([r('Jan 2022 – Present · Remote', { color: '64748B', italic: true })]),
  bullet([r('Led the migration from REST to GraphQL across 12 services; reduced p99 latency by 40%.')]),
  bullet([r('Built an offline-first sync layer used by 200k+ daily users.')]),
  bullet([r('Mentored two junior engineers through their first production launches.')]),
  p([r('')]),
  p([r('Software Engineer · BluePeak', { bold: true })]),
  p([r('Mar 2019 – Dec 2021 · San Francisco, CA', { color: '64748B', italic: true })]),
  bullet([r('Owned the document-sharing pipeline; took the on-call burn-down from 12 pages/week to under 2.')]),
  bullet([r('Shipped the customer-facing audit-log feature requested by enterprise tier customers.')]),
  h('Education', 2),
  p([r('B.S. Computer Science · State University · 2018', { bold: true })]),
  h('Skills', 2),
  p([
    r('TypeScript · React · Go · PostgreSQL · Redis · AWS · GitHub Actions · OpenTelemetry'),
  ]),
].join('\n');

const LETTER_BODY = [
  p([r('Alex Morgan')], { align: 'right' }),
  p([r('123 Example Lane')], { align: 'right' }),
  p([r('San Francisco, CA 94110')], { align: 'right' }),
  p([r('alex@example.com')], { align: 'right' }),
  p([r('')]),
  p([r('March 5, 2026')]),
  p([r('')]),
  p([r('Hiring Manager', { bold: true })]),
  p([r('Northern Light Studio')]),
  p([r('456 Market Street')]),
  p([r('San Francisco, CA 94103')]),
  p([r('')]),
  p([r('Dear Hiring Manager,', { bold: true })]),
  p([r('')]),
  p([
    r(
      'I am writing to express my interest in the Senior Engineer role at Northern Light Studio. With seven years of experience building collaborative web tools, I am especially drawn to your team’s focus on real-time editor experiences.'
    ),
  ]),
  p([
    r(
      'In my current role at Acme Corp, I led the migration of our document-sharing pipeline to a CRDT-based sync model. The new design cut conflict-resolution bugs by 70% and enabled features that simply weren’t possible with the locking-based approach we had inherited. I would love the chance to bring that same engineering judgment to your team.'
    ),
  ]),
  p([
    r(
      'I have attached my résumé and would welcome the opportunity to discuss how my background fits the role. Thank you for your time and consideration.'
    ),
  ]),
  p([r('')]),
  p([r('Sincerely,')]),
  p([r('')]),
  p([r('Alex Morgan')]),
].join('\n');

const MEETING_BODY = [
  h('Weekly Sync — March 5, 2026', 1),
  p([r('Attendees: ', { bold: true }), r('Alex Morgan, Priya Patel, Jordan Lee, Sam Rivera')]),
  p([
    r('Apologies: ', { bold: true }),
    r('Casey Kim (PTO)'),
  ]),
  h('Agenda', 2),
  numbered([r('Review last week’s action items')]),
  numbered([r('Document service M1 update')]),
  numbered([r('Open questions on WOPI integration')]),
  numbered([r('Demo: home-page template gallery')]),
  numbered([r('Round-table')]),
  h('Discussion', 2),
  p([r('M1 status', { bold: true })]),
  p([
    r(
      'Two-browser Yjs round-trip is wired locally. Alex is finishing the Go gateway scaffolding; Priya offered to pair on the snapshot worker on Thursday.'
    ),
  ]),
  p([r('Template gallery', { bold: true })]),
  p([
    r(
      'Home page lands first instead of an auto-blank doc. Initial templates are Blank, Sample, Form, plus three placeholder cards that turn live once we drop .docx files into the templates directory.'
    ),
  ]),
  h('Action items', 2),
  bullet([r('Alex — finish Go WS gateway scaffold by Thursday EOD')]),
  bullet([r('Priya — pair on snapshot worker design')]),
  bullet([r('Jordan — draft WOPI integration RFC; circulate Friday')]),
  bullet([r('Sam — author résumé + letter templates for the home gallery')]),
  h('Next meeting', 2),
  p([r('Thursday, March 12 · 10:00 AM PT · same Zoom link')]),
].join('\n');

const PROPOSAL_BODY = [
  p([r('Project Proposal', { bold: true, sz: 56, color: '0F172A' })], { align: 'center' }),
  p([r('Real-Time Document Collaboration Service', { color: '475569', sz: 28 })], {
    align: 'center',
  }),
  p([r('')]),
  h('Executive summary', 2),
  p([
    r(
      'We propose to build a real-time collaborative .docx editor service that lets multiple users edit the same Word document in the browser. The service will round-trip Microsoft Word files with high fidelity and integrate with existing document hosts via the WOPI protocol.'
    ),
  ]),
  h('Objectives', 2),
  bullet([r('Ship a single-user .docx editor with end-to-end round-trip fidelity ≥ 90%')]),
  bullet([r('Support two-or-more concurrent editors per document with sub-second sync')]),
  bullet([r('Integrate with at least one WOPI-compatible host (Nextcloud first)')]),
  bullet([r('Stay storage-less in our own service — host owns the file')]),
  h('Approach', 2),
  p([
    r(
      'Browser side, we extend an existing OOXML-preserving ProseMirror editor (MIT licensed) with the y-prosemirror Yjs plugin for CRDT-backed editing. Server side, a stateless Go gateway handles the y-websocket protocol, holds the in-memory Y.Doc per active room, and delegates persistence to the host via WOPI.'
    ),
  ]),
  h('Milestones', 2),
  table([
    ['Milestone', 'Target', 'Outcome'],
    ['M1 · Yjs round-trip', 'Apr 2026', 'Two browsers edit one document locally'],
    ['M2 · Go gateway v0', 'May 2026', 'Self-contained Docker image with upload + share link'],
    ['M3 · WOPI integration', 'Jul 2026', 'Real host (Nextcloud) reads and writes documents'],
    ['M4 · Public preview', 'Aug 2026', 'Stable release, fidelity score above 90%'],
  ]),
  p([r('')]),
  h('Open questions', 2),
  bullet([r('Cross-node fanout: sticky routing per docId, or Redis pubsub?')]),
  bullet([r('Tauri desktop build: ship alongside the web build, or separate cadence?')]),
  bullet([r('Pricing model for the hosted Docker distribution.')]),
].join('\n');

// ---------- Career: cover letter ----------

const COVER_LETTER_BODY = [
  p([r('Alex Morgan')], { align: 'right' }),
  p([r('alex@example.com · (555) 123-4567')], { align: 'right' }),
  p([r('')]),
  p([r('March 5, 2026')]),
  p([r('')]),
  p([r('Northern Light Studio')]),
  p([r('Attn: Engineering Recruiting')]),
  p([r('456 Market Street, San Francisco, CA 94103')]),
  p([r('')]),
  p([r('Dear Hiring Team,', { bold: true })]),
  p([r('')]),
  p([
    r(
      'I am writing to apply for the Senior Engineer role on the Editor team. After seven years building collaborative document tools — most recently leading the CRDT migration at Acme Corp — I was thrilled to see Northern Light hiring for exactly this work.'
    ),
  ]),
  p([
    r(
      'What draws me to Northern Light specifically is the willingness to commit to real OOXML round-trip fidelity. Most editor projects treat .docx as an export format; you treat it as the source of truth. That maps to how I think about the problem.'
    ),
  ]),
  p([
    r(
      'A few things from my background that feel relevant: (1) shipped a Yjs-backed sync layer used by 200k+ daily users with zero data-loss incidents; (2) lowered our editor’s p99 keystroke latency from 180 ms to 24 ms on large documents; (3) mentored two engineers through their first production launches.'
    ),
  ]),
  p([
    r(
      'I would welcome the chance to talk further. My résumé is attached, and I can share code samples or production write-ups on request. Thank you for your time.'
    ),
  ]),
  p([r('')]),
  p([r('Warmly,')]),
  p([r('')]),
  p([r('Alex Morgan')]),
].join('\n');

// ---------- Personal: travel itinerary ----------

const TRAVEL_BODY = [
  p([r('Tokyo + Kyoto — Spring 2026', { bold: true, sz: 52, color: '0F172A' })], {
    align: 'center',
  }),
  p([r('May 30 – June 8 · two travellers', { color: '64748B', italic: true })], {
    align: 'center',
  }),
  h('Overview', 2),
  p([
    r(
      'Ten-day trip — five nights Tokyo, two nights Hakone, three nights Kyoto. Flights pre-booked; everything else flexible. Budget cap $4,200/person.'
    ),
  ]),
  h('Day-by-day', 2),
  p([r('Day 1 · Fri May 30 · Tokyo', { bold: true })]),
  bullet([r('Land Haneda 14:20 · IC card + Suica top-up at airport')]),
  bullet([r('Check in Shibuya · early dinner Ichiran ramen · light walk')]),
  p([r('Day 2 · Sat May 31 · Tokyo', { bold: true })]),
  bullet([r('Tsukiji outer market breakfast · Ueno park · Asakusa evening')]),
  bullet([r('Reservation: Sushi Saito 18:30 (book 3 months out!)')]),
  p([r('Day 4 · Mon Jun 2 · Hakone', { bold: true })]),
  bullet([r('Romancecar 09:00 from Shinjuku · check in Gora Kadan')]),
  bullet([r('Onsen, kaiseki dinner, early sleep')]),
  p([r('Day 6 · Wed Jun 4 · Kyoto', { bold: true })]),
  bullet([r('Hikari shinkansen 09:11 · arrive Kyoto 11:42')]),
  bullet([r('Fushimi Inari at dusk (less crowded after 17:00)')]),
  h('Reservations', 2),
  table([
    ['Date', 'What', 'Confirmation'],
    ['May 31', 'Sushi Saito', 'TY-7142'],
    ['Jun 2', 'Gora Kadan ryokan', 'HK-22918'],
    ['Jun 5', 'Bamboo grove tour', 'KY-553'],
    ['Jun 7', 'Tea ceremony, Camellia', 'CM-91'],
  ]),
  h('Packing checklist', 2),
  bullet([r('Passports, JR Pass vouchers, IC cards')]),
  bullet([r('Light layers — humidity high, but A/C cold')]),
  bullet([r('Universal adapter (Type A, 100V)')]),
  bullet([r('Cash — many shrines and small shops are cash-only')]),
].join('\n');

// ---------- Personal: recipe ----------

const RECIPE_BODY = [
  p([r('Brown-Butter Chocolate Chip Cookies', { bold: true, sz: 48, color: '7C2D12' })], {
    align: 'center',
  }),
  p([
    r('Makes 18 cookies · 35 min active · rest 2 h preferred', { italic: true, color: '64748B' }),
  ], { align: 'center' }),
  h('Ingredients', 2),
  bullet([r('200 g unsalted butter')]),
  bullet([r('180 g light brown sugar, packed')]),
  bullet([r('100 g granulated sugar')]),
  bullet([r('2 large eggs, room temperature')]),
  bullet([r('1 tsp vanilla extract')]),
  bullet([r('250 g all-purpose flour')]),
  bullet([r('1 tsp baking soda')]),
  bullet([r('1 tsp fine sea salt')]),
  bullet([r('300 g dark chocolate, chopped (or chips)')]),
  bullet([r('Flaky sea salt, to finish')]),
  h('Method', 2),
  numbered([
    r(
      'Brown the butter. Melt in a light-coloured pan over medium heat. Swirl until it foams, smells nutty, and the milk solids turn deep amber — about 5 min. Transfer to a bowl and cool 15 min.'
    ),
  ]),
  numbered([
    r(
      'Whisk both sugars into the cooled butter for 1 minute. Add eggs and vanilla; whisk until glossy and slightly thickened.'
    ),
  ]),
  numbered([r('Sift in flour, baking soda, and salt. Fold gently until just combined.')]),
  numbered([r('Fold in the chocolate. Cover and rest in the fridge for at least 2 hours (overnight is better).')]),
  numbered([r('Heat oven to 180 °C / 350 °F. Scoop 45 g balls onto a lined sheet, well spaced.')]),
  numbered([r('Bake 11–12 min — edges set, centres still soft. Finish with flaky salt.')]),
  p([r('Notes', { bold: true, color: '7C2D12' })]),
  p([
    r(
      'The fridge rest is the single biggest flavour upgrade — the dough hydrates and the brown butter mellows into something close to toffee.'
    ),
  ]),
].join('\n');

// ---------- Work: memo ----------

const MEMO_BODY = [
  p([r('MEMORANDUM', { bold: true, sz: 36, color: '0F172A' })], { align: 'center' }),
  p([r('')]),
  table([
    ['TO:', 'Engineering Org', ''],
    ['FROM:', 'Alex Morgan, VP Engineering', ''],
    ['DATE:', 'March 5, 2026', ''],
    ['RE:', 'Q2 engineering priorities', ''],
  ]),
  p([r('')]),
  h('Summary', 2),
  p([
    r(
      'Q2 has three engineering priorities, in order: ship the collab beta, fix the document-load p99, and pay down the schema migration backlog.'
    ),
  ]),
  h('Priority 1 — Collab beta', 2),
  p([
    r(
      'The Document service M3 milestone (WOPI integration) is on the critical path. Two-engineer team led by Priya, target end of Q2 for opt-in beta with five design-partner customers.'
    ),
  ]),
  h('Priority 2 — Editor p99 latency', 2),
  p([
    r(
      'Documents > 100 pages still take >5 s to load on cold cache. Aria will own the rendering profile sprint; expect a design doc by April 15.'
    ),
  ]),
  h('Priority 3 — Migration backlog', 2),
  p([
    r(
      'Six migrations from the 2025 schema rework are still gated on Q1 customer-data freezes. Sam will batch them into a single rollout window in early May.'
    ),
  ]),
  h('Asks', 2),
  bullet([r('Each team lead: confirm Q2 staffing by EOD Friday')]),
  bullet([r('Product: lock the design-partner list by end of next week')]),
  bullet([r('Open questions / pushback: reply on this thread or grab time directly')]),
].join('\n');

// ---------- Work: weekly status report ----------

const STATUS_BODY = [
  h('Weekly status — Week of March 3', 1),
  p([r('Alex Morgan · Engineering · sent Friday EOD', { color: '64748B', italic: true })]),
  h('Shipped this week', 2),
  bullet([r('Document home-page template gallery (PR #214 merged)')]),
  bullet([r('CI green-up: six stale-selector fixes across e2e suite')]),
  bullet([r('Word-compat closing-border heuristic behind off-by-default flag (#395)')]),
  h('In flight', 2),
  bullet([r('Go gateway scaffolding — WS frame parser landing Monday')]),
  bullet([r('Real Sample / Resume / Letter / Meeting / Proposal templates authored')]),
  bullet([r('Demo Pages deploy now points at doc.schnsrw.live (DNS propagated)')]),
  h('Blockers', 2),
  bullet([
    r(
      'WOPI mock host design — need a 30-min sync with Priya on protocol coverage. Booked for Tuesday.'
    ),
  ]),
  h('Next week', 2),
  bullet([r('Land Go gateway v0 — accept WS, hold one Y.Doc per room, drop on idle')]),
  bullet([r('Stand up the WOPI mock as a Docker service alongside the editor')]),
  bullet([r('Start the M3 integration spec')]),
  h('Metrics', 2),
  table([
    ['Metric', 'This week', 'Trend'],
    ['CI green rate', '92%', '↑ from 71%'],
    ['Open P0 bugs', '0', '— flat'],
    ['Round-trip fidelity (pristine)', '59% (23/39)', '— flat'],
  ]),
].join('\n');

// ---------- Work: press release ----------

const PRESS_BODY = [
  p([r('FOR IMMEDIATE RELEASE', { bold: true, color: '64748B' })], {}),
  p([r('Contact: press@example.com · (555) 901-2030', { color: '64748B' })]),
  p([r('')]),
  p(
    [r('Casual Docs Launches Real-Time .docx Collaboration in the Browser', { bold: true, sz: 36 })],
    { align: 'center' }
  ),
  p([
    r(
      'Open-source project ships first preview of stateless collaborative Word document editor', {
        italic: true,
        color: '475569',
      }
    ),
  ], { align: 'center' }),
  p([r('')]),
  p([
    r('SAN FRANCISCO — March 5, 2026', { bold: true }),
    r(
      ' — Casual Docs today released the first public preview of its real-time collaborative .docx editor. The web-based tool lets multiple users edit the same Microsoft Word document simultaneously, with full round-trip fidelity to the original OOXML format.'
    ),
  ]),
  p([
    r(
      'Unlike traditional document services, Casual Docs delegates persistence entirely to the host. The runtime keeps document state in memory only for the duration of an active editing session, then snapshots back to the host on the last disconnect. There is no database, no on-disk update log, and no vendor lock-in.'
    ),
  ]),
  p([
    r('“We wanted to prove that real-time collaboration doesn’t have to mean handing over your files,” said Alex Morgan, the project lead. ', { italic: true }),
    r('“The host owns the file. We just orchestrate the editing.”', { italic: true }),
  ]),
  h('Availability', 2),
  p([
    r(
      'Casual Docs is available immediately as a hosted demo at doc.schnsrw.live and as a Docker image bundling the editor with the real-time gateway. The project is MIT-licensed and developed openly on GitHub.'
    ),
  ]),
  h('About Casual Docs', 2),
  p([
    r(
      'Casual Docs is an open-source initiative focused on bringing Microsoft Word fidelity to the web. The project builds on the eigenpal/docx-editor codebase and ships under the MIT license.'
    ),
  ]),
  p([r('# # #', { color: '64748B' })], { align: 'center' }),
].join('\n');

// ---------- Education: essay / research paper ----------

const ESSAY_BODY = [
  p([r('The Quiet Revolution in Collaborative Editing', { bold: true, sz: 44, color: '0F172A' })], {
    align: 'center',
  }),
  p([r('Alex Morgan · State University · ENG 301', { color: '64748B', italic: true })], {
    align: 'center',
  }),
  p([r('March 5, 2026', { color: '64748B' })], { align: 'center' }),
  h('Abstract', 2),
  p([
    r(
      'This paper traces the development of conflict-free replicated data types (CRDTs) from theoretical curiosity in the late 2000s to production deployment underpinning much of contemporary collaborative editing. We argue that the field’s pragmatic turn — away from operational-transform–centric designs — was driven less by theoretical superiority than by deployment ergonomics.'
    ),
  ]),
  h('1. Introduction', 2),
  p([
    r(
      'When Google Docs launched in 2006, simultaneous editing felt like a magic trick. The underlying machinery, however, was a careful application of Operational Transform (OT), a technique with roots in the 1980s. For more than a decade, OT was the only practical answer for low-latency multi-writer text editing.'
    ),
  ]),
  p([
    r(
      'The quiet revolution of the 2010s and 2020s was the displacement of OT by CRDTs in production systems. This paper explores what changed.'
    ),
  ]),
  h('2. The deployment problem', 2),
  p([
    r(
      'Operational Transform requires a central server to linearise concurrent operations. CRDTs, by construction, do not. This single property — convergence without coordination — is what made CRDTs win, not their theoretical properties.'
    ),
  ]),
  h('3. Case study: Yjs in the wild', 2),
  p([
    r(
      'Yjs has emerged as the canonical implementation. Its success owes much to a set of pragmatic design decisions — small wire format, efficient garbage collection of tombstones, language bindings that match where editors actually run.'
    ),
  ]),
  h('4. Conclusion', 2),
  p([
    r(
      'Editor architecture is downstream of operational concerns. CRDTs won the editing wars not because their theory was prettier but because their deployment was cleaner. That observation has implications well beyond editors.'
    ),
  ]),
  h('References', 2),
  p([r('Shapiro, M., et al. (2011). Conflict-free Replicated Data Types. INRIA RR-7506.', { color: '475569' })]),
  p([r('Jahns, K. (2019). Yjs — A CRDT Framework. https://yjs.dev', { color: '475569' })]),
].join('\n');

// ---------- Education: lab report ----------

const LAB_BODY = [
  p([r('Lab Report: Pendulum Period vs. Length', { bold: true, sz: 40, color: '0F172A' })], {
    align: 'center',
  }),
  p([r('PHYS 201 · Section B · Bench 4', { color: '64748B', italic: true })], { align: 'center' }),
  p([r('Author: Alex Morgan · Partner: Jordan Lee · Date: March 5, 2026', { color: '64748B' })], {
    align: 'center',
  }),
  h('Objective', 2),
  p([
    r(
      'Verify the theoretical relationship T = 2π√(L/g) by measuring the period of a simple pendulum at five lengths and comparing T² to L.'
    ),
  ]),
  h('Apparatus', 2),
  bullet([r('Bob: 50 g brass · Length: variable string · Stopwatch: ±0.01 s')]),
  bullet([r('Meter stick: ±1 mm · Protractor for fixed 10° release angle')]),
  h('Procedure', 2),
  numbered([r('Set string length L and measure with meter stick.')]),
  numbered([r('Release bob from 10° displacement; measure time for 20 complete swings.')]),
  numbered([r('Compute T = (time for 20) / 20. Repeat 3 trials per length.')]),
  numbered([r('Tabulate L vs. mean T and compute T².')]),
  h('Data', 2),
  table([
    ['L (m)', 'T (s)', 'T² (s²)'],
    ['0.20', '0.90', '0.81'],
    ['0.40', '1.27', '1.61'],
    ['0.60', '1.55', '2.40'],
    ['0.80', '1.79', '3.20'],
    ['1.00', '2.01', '4.04'],
  ]),
  h('Analysis', 2),
  p([
    r(
      'A linear fit of T² vs. L gives slope 4.02 s²/m with r² = 0.998. The theoretical slope is 4π²/g = 4.025 s²/m for g = 9.81 m/s². Measured slope is within 0.1% of the predicted value.'
    ),
  ]),
  h('Sources of uncertainty', 2),
  bullet([r('Stopwatch reaction time (~0.2 s; mitigated by 20-swing averaging)')]),
  bullet([r('Release-angle inconsistency (small-angle approximation breaks above ~15°)')]),
  bullet([r('Air resistance — negligible for this bob mass and swing length')]),
  h('Conclusion', 2),
  p([
    r(
      'The pendulum’s period scales as √L, as predicted by the small-angle solution to the pendulum equation. Measured g (back-calculated from slope) is 9.82 m/s², in excellent agreement with the accepted local value.'
    ),
  ]),
].join('\n');

// ---------- Education: course syllabus ----------

const SYLLABUS_BODY = [
  p([r('CS 250 — Distributed Systems', { bold: true, sz: 44, color: '0F172A' })], {
    align: 'center',
  }),
  p([r('Spring 2026 · Dr. Priya Patel · MW 13:00–14:20 · Engineering 312', { color: '64748B' })], {
    align: 'center',
  }),
  h('Course description', 2),
  p([
    r(
      'Foundations of distributed systems. Topics: time and ordering, fault tolerance, consensus protocols, replication, consistency models, and the practical engineering of large-scale systems. Substantial programming required.'
    ),
  ]),
  h('Learning outcomes', 2),
  bullet([r('Reason about clocks, ordering, and consistency in the presence of partial failure.')]),
  bullet([r('Implement and reason about consensus protocols (Paxos, Raft).')]),
  bullet([r('Apply CRDTs and OT to collaborative-editing problems.')]),
  bullet([r('Design and critique production-grade distributed-systems architectures.')]),
  h('Schedule', 2),
  table([
    ['Week', 'Topic', 'Reading'],
    ['1', 'Time, clocks, ordering', 'Lamport 1978'],
    ['3', 'Failure detectors', 'Chandra & Toueg 1996'],
    ['5', 'Paxos', 'Lamport 1998'],
    ['7', 'Raft', 'Ongaro & Ousterhout 2014'],
    ['9', 'CRDTs', 'Shapiro et al. 2011'],
    ['11', 'Storage replication', 'Dynamo, Spanner papers'],
  ]),
  h('Grading', 2),
  bullet([r('Programming projects (4): 60%')]),
  bullet([r('Midterm: 15%')]),
  bullet([r('Final: 20%')]),
  bullet([r('Class participation: 5%')]),
  h('Policies', 2),
  p([
    r('Late work: ', { bold: true }),
    r('Up to 48 hours late at 75% credit, beyond that 0. Two no-questions extensions per semester.'),
  ]),
  p([
    r('Academic integrity: ', { bold: true }),
    r(
      'You may discuss approaches with peers, but submitted code and writing must be your own. AI assistants permitted with attribution; flag generated portions.'
    ),
  ]),
].join('\n');

// ---------- run ----------

console.log('Writing Casual Docs templates:');
await writeDocx(join(PUBLIC_DIR, 'sample.docx'), SAMPLE_BODY);
await writeDocx(join(TEMPLATE_DIR, 'resume.docx'), RESUME_BODY);
await writeDocx(join(TEMPLATE_DIR, 'cover-letter.docx'), COVER_LETTER_BODY);
await writeDocx(join(TEMPLATE_DIR, 'letter.docx'), LETTER_BODY);
await writeDocx(join(TEMPLATE_DIR, 'travel-itinerary.docx'), TRAVEL_BODY);
await writeDocx(join(TEMPLATE_DIR, 'recipe.docx'), RECIPE_BODY);
await writeDocx(join(TEMPLATE_DIR, 'meeting-notes.docx'), MEETING_BODY);
await writeDocx(join(TEMPLATE_DIR, 'project-proposal.docx'), PROPOSAL_BODY);
await writeDocx(join(TEMPLATE_DIR, 'memo.docx'), MEMO_BODY);
await writeDocx(join(TEMPLATE_DIR, 'weekly-status.docx'), STATUS_BODY);
await writeDocx(join(TEMPLATE_DIR, 'press-release.docx'), PRESS_BODY);
await writeDocx(join(TEMPLATE_DIR, 'essay.docx'), ESSAY_BODY);
await writeDocx(join(TEMPLATE_DIR, 'lab-report.docx'), LAB_BODY);
await writeDocx(join(TEMPLATE_DIR, 'syllabus.docx'), SYLLABUS_BODY);
console.log('done.');
