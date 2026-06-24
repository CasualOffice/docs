/**
 * OMML (Office Math Markup Language) → MathML.
 *
 * Equations in `.docx` are stored as native OMML (`<m:oMath>` /
 * `<m:oMathPara>`), which the parser preserves verbatim. To render them as
 * real math (instead of the plain-text fallback) we convert OMML to MathML
 * — the web-standard math layout language browsers and math renderers
 * understand.
 *
 * This is a hand-rolled converter for the common OMML structures (runs,
 * fractions, scripts, radicals, delimiters, N-ary operators, functions,
 * matrices, accents, bars). It is intentionally dependency-free and MIT —
 * the established JS converters are either XSLT (awkward to run + test) or
 * LGPL (incompatible with this project's permissive-only posture).
 * Anything it doesn't recognise degrades to its text content inside an
 * `<mrow>`, so the worst case is the same readable fallback we have today.
 *
 * Pure + synchronous: takes the raw OMML XML string, returns a MathML
 * string. No DOM, so it unit-tests under bun.
 */
import { xml2js, type Element as XmlElement } from 'xml-js';

/** Local name without the `m:` (or any) namespace prefix. */
function local(name: string | undefined): string {
  return (name ?? '').replace(/^.*:/, '');
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Children elements (skips text/whitespace nodes). */
function kids(el: XmlElement): XmlElement[] {
  return (el.elements ?? []).filter((c) => c.type === 'element');
}

/** First child whose local name matches. */
function child(el: XmlElement, name: string): XmlElement | undefined {
  return kids(el).find((c) => local(c.name) === name);
}

/** Concatenated text of all descendant `m:t` runs. */
function textOf(el: XmlElement): string {
  let out = '';
  for (const c of el.elements ?? []) {
    if (c.type === 'text' && typeof c.text === 'string') out += c.text;
    else if (c.type === 'element') {
      if (local(c.name) === 't') {
        for (const t of c.elements ?? []) {
          if (t.type === 'text' && typeof t.text === 'string') out += t.text;
        }
      } else {
        out += textOf(c);
      }
    }
  }
  return out;
}

/** Read a property char attribute, e.g. m:naryPr/m:chr/@m:val. */
function propVal(parent: XmlElement, prGroup: string, prop: string): string | undefined {
  const pr = child(parent, prGroup);
  if (!pr) return undefined;
  const p = child(pr, prop);
  if (!p) return undefined;
  const attrs = (p.attributes ?? {}) as Record<string, string>;
  // xml-js keeps attributes with their prefixes (m:val) — find by local name.
  for (const [k, v] of Object.entries(attrs)) {
    if (local(k) === 'val') return v;
  }
  return undefined;
}

/** Classify a run's text into the right MathML token element. */
function tokenForRun(text: string): string {
  const t = text.trim();
  if (t === '') return '';
  if (/^[0-9]+(\.[0-9]+)?$/.test(t)) return `<mn>${escapeXml(text)}</mn>`;
  if (/^[A-Za-z]+$/.test(t)) return `<mi>${escapeXml(text)}</mi>`;
  // Single non-alphanumeric → operator; longer mixed strings → split so
  // each char lands in the right token (keeps "x+1" legible).
  if (t.length === 1) return `<mo>${escapeXml(text)}</mo>`;
  let out = '';
  for (const ch of text) {
    if (/[0-9]/.test(ch)) out += `<mn>${escapeXml(ch)}</mn>`;
    else if (/[A-Za-z]/.test(ch)) out += `<mi>${escapeXml(ch)}</mi>`;
    else if (/\s/.test(ch)) out += '';
    else out += `<mo>${escapeXml(ch)}</mo>`;
  }
  return out;
}

/** Convert the children of a container element, joined. */
function convertChildren(el: XmlElement): string {
  return kids(el).map(convertNode).filter(Boolean).join('');
}

/** Wrap content in an <mrow> when it's not already a single grouped unit. */
function mrow(content: string): string {
  return `<mrow>${content || '<mo>&#x25A1;</mo>'}</mrow>`;
}

function convertNode(el: XmlElement): string {
  switch (local(el.name)) {
    case 'r': // run
      return tokenForRun(textOf(el));
    case 't': // bare text run
      return tokenForRun(textOf(el));
    case 'f': {
      // fraction
      const num = child(el, 'num');
      const den = child(el, 'den');
      return `<mfrac>${mrow(num ? convertChildren(num) : '')}${mrow(den ? convertChildren(den) : '')}</mfrac>`;
    }
    case 'sSup': {
      const base = child(el, 'e');
      const sup = child(el, 'sup');
      return `<msup>${mrow(base ? convertChildren(base) : '')}${mrow(sup ? convertChildren(sup) : '')}</msup>`;
    }
    case 'sSub': {
      const base = child(el, 'e');
      const sub = child(el, 'sub');
      return `<msub>${mrow(base ? convertChildren(base) : '')}${mrow(sub ? convertChildren(sub) : '')}</msub>`;
    }
    case 'sSubSup': {
      const base = child(el, 'e');
      const sub = child(el, 'sub');
      const sup = child(el, 'sup');
      return `<msubsup>${mrow(base ? convertChildren(base) : '')}${mrow(sub ? convertChildren(sub) : '')}${mrow(sup ? convertChildren(sup) : '')}</msubsup>`;
    }
    case 'rad': {
      // radical — m:deg empty → sqrt, else root
      const deg = child(el, 'deg');
      const e = child(el, 'e');
      const body = mrow(e ? convertChildren(e) : '');
      const degContent = deg ? convertChildren(deg) : '';
      return degContent
        ? `<mroot>${body}${mrow(degContent)}</mroot>`
        : `<msqrt>${e ? convertChildren(e) : ''}</msqrt>`;
    }
    case 'd': {
      // delimiter (fences)
      const beg = propVal(el, 'dPr', 'begChr') ?? '(';
      const end = propVal(el, 'dPr', 'endChr') ?? ')';
      const inner = kids(el)
        .filter((c) => local(c.name) === 'e')
        .map(convertChildren)
        .join('<mo>,</mo>');
      return `<mrow><mo>${escapeXml(beg)}</mo>${inner}<mo>${escapeXml(end)}</mo></mrow>`;
    }
    case 'nary': {
      // N-ary operator (sum, integral, product…)
      const chr = propVal(el, 'naryPr', 'chr') ?? '∫';
      const sub = child(el, 'sub');
      const sup = child(el, 'sup');
      const e = child(el, 'e');
      const subC = sub ? convertChildren(sub) : '';
      const supC = sup ? convertChildren(sup) : '';
      let op: string;
      if (subC && supC)
        op = `<msubsup><mo>${escapeXml(chr)}</mo>${mrow(subC)}${mrow(supC)}</msubsup>`;
      else if (subC) op = `<msub><mo>${escapeXml(chr)}</mo>${mrow(subC)}</msub>`;
      else if (supC) op = `<msup><mo>${escapeXml(chr)}</mo>${mrow(supC)}</msup>`;
      else op = `<mo>${escapeXml(chr)}</mo>`;
      return `<mrow>${op}${e ? convertChildren(e) : ''}</mrow>`;
    }
    case 'func': {
      // function apply: fName(e)
      const fName = child(el, 'fName');
      const e = child(el, 'e');
      return `<mrow>${fName ? convertChildren(fName) : ''}<mo>&#x2061;</mo>${e ? convertChildren(e) : ''}</mrow>`;
    }
    case 'acc': {
      // accent over base
      const e = child(el, 'e');
      const chr = propVal(el, 'accPr', 'chr') ?? '^';
      return `<mover>${mrow(e ? convertChildren(e) : '')}<mo>${escapeXml(chr)}</mo></mover>`;
    }
    case 'bar': {
      const e = child(el, 'e');
      return `<menclose notation="top">${e ? convertChildren(e) : ''}</menclose>`;
    }
    case 'm': {
      // matrix
      const rows = kids(el).filter((c) => local(c.name) === 'mr');
      const body = rows
        .map((row) => {
          const cells = kids(row)
            .filter((c) => local(c.name) === 'e')
            .map((c) => `<mtd>${convertChildren(c)}</mtd>`)
            .join('');
          return `<mtr>${cells}</mtr>`;
        })
        .join('');
      return `<mtable>${body}</mtable>`;
    }
    // Containers: descend.
    case 'e':
    case 'num':
    case 'den':
    case 'sup':
    case 'sub':
    case 'deg':
    case 'fName':
    case 'oMath':
    case 'oMathPara':
      return convertChildren(el);
    // Property groups carry no renderable content.
    case 'rPr':
    case 'fPr':
    case 'sSupPr':
    case 'sSubPr':
    case 'sSubSupPr':
    case 'radPr':
    case 'dPr':
    case 'naryPr':
    case 'funcPr':
    case 'accPr':
    case 'barPr':
    case 'mPr':
    case 'ctrlPr':
      return '';
    default:
      // Unknown structure → its text, so nothing silently vanishes.
      return convertChildren(el);
  }
}

export interface OmmlToMathmlOptions {
  /** 'block' → display="block" (own line); 'inline' → inline. */
  display?: 'inline' | 'block';
}

/**
 * Convert a raw OMML XML string (`<m:oMath>…` or `<m:oMathPara>…`) to a
 * MathML string (`<math>…</math>`). Returns null when the input can't be
 * parsed or contains no math — callers fall back to the plain-text render.
 */
export function ommlToMathml(ommlXml: string, options: OmmlToMathmlOptions = {}): string | null {
  if (!ommlXml || !ommlXml.trim()) return null;
  let root: XmlElement | undefined;
  try {
    const parsed = xml2js(ommlXml, { compact: false }) as XmlElement;
    root = (parsed.elements ?? []).find(
      (e) => e.type === 'element' && /(:|^)oMath(Para)?$/.test(e.name ?? '')
    );
    // Tolerate a wrapper or a bare oMath at the top.
    if (!root) {
      root = (parsed.elements ?? []).find((e) => e.type === 'element');
    }
  } catch {
    return null;
  }
  if (!root) return null;
  const body = convertNode(root);
  if (!body || !/[<]/.test(body)) return null;
  const display = options.display ?? (/(:|^)oMathPara$/.test(root.name ?? '') ? 'block' : 'inline');
  return `<math xmlns="http://www.w3.org/1998/Math/MathML" display="${display}">${body}</math>`;
}
