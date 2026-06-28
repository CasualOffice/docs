/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * MathML → OMML (Office Math Markup Language).
 *
 * The inverse of `ommlToMathml`. When the user AUTHORS an equation, the
 * editor renders LaTeX → MathML (via Temml, in the React layer) and stores
 * the MathML on the math node. On save we convert that MathML to native
 * OMML (`<m:oMath>` / `<m:oMathPara>`) so the equation round-trips into the
 * `.docx` as real math — editable in Word / OnlyOffice / LibreOffice —
 * never an image.
 *
 * Hand-rolled + dependency-free (MIT). Covers the common MathML structures
 * Temml emits for typical equations (tokens, rows, fractions, scripts,
 * radicals, matrices, accents). Unknown elements degrade to their text
 * content as a run, so nothing is silently dropped.
 *
 * Pure + synchronous: MathML string in, OMML string out. No DOM — unit-
 * tests under bun.
 */
import { xml2js, type Element as XmlElement } from 'xml-js';

function local(name: string | undefined): string {
  return (name ?? '').replace(/^.*:/, '').toLowerCase();
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function kids(el: XmlElement): XmlElement[] {
  return (el.elements ?? []).filter((c) => c.type === 'element');
}

function textOf(el: XmlElement): string {
  let out = '';
  for (const c of el.elements ?? []) {
    if (c.type === 'text' && typeof c.text === 'string') out += c.text;
    else if (c.type === 'element') out += textOf(c);
  }
  return out;
}

/** An OMML text run. */
function run(text: string): string {
  const t = text.trim();
  if (!t) return '';
  return `<m:r><m:t>${escapeXml(text)}</m:t></m:r>`;
}

/** Convert children, joined. */
function convertChildren(el: XmlElement): string {
  return kids(el).map(convertNode).filter(Boolean).join('');
}

/** A `<m:e>`/`<m:num>`/etc. element wrapping a single converted MathML
 *  child. Uses `convertNode` (not `convertChildren`) so a token child like
 *  `<mi>y</mi>` — which has text, not element children — isn't dropped. */
function wrap(tag: string, el: XmlElement | undefined): string {
  return `<m:${tag}>${el ? convertNode(el) : ''}</m:${tag}>`;
}

function convertNode(el: XmlElement): string {
  const name = local(el.name);
  switch (name) {
    case 'mi':
    case 'mn':
    case 'mo':
    case 'mtext':
    case 'ms':
      return run(textOf(el));
    case 'mrow':
    case 'mstyle':
    case 'mpadded':
    case 'menclose':
    case 'mphantom':
      return convertChildren(el);
    case 'mfrac': {
      const [num, den] = kids(el);
      return `<m:f><m:fPr><m:ctrlPr/></m:fPr>${wrap('num', num)}${wrap('den', den)}</m:f>`;
    }
    case 'msup': {
      const [base, sup] = kids(el);
      return `<m:sSup>${wrap('e', base)}${wrap('sup', sup)}</m:sSup>`;
    }
    case 'msub': {
      const [base, sub] = kids(el);
      return `<m:sSub>${wrap('e', base)}${wrap('sub', sub)}</m:sSub>`;
    }
    case 'msubsup': {
      const [base, sub, sup] = kids(el);
      return `<m:sSubSup>${wrap('e', base)}${wrap('sub', sub)}${wrap('sup', sup)}</m:sSubSup>`;
    }
    case 'msqrt':
      // Square root — empty degree marks it as a radical (no index).
      return `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${convertChildren(el)}</m:e></m:rad>`;
    case 'mroot': {
      const [base, deg] = kids(el);
      return `<m:rad>${wrap('deg', deg)}${wrap('e', base)}</m:rad>`;
    }
    case 'mover': {
      const [base, acc] = kids(el);
      const chr = acc ? textOf(acc) : '';
      return `<m:acc><m:accPr><m:chr m:val="${escapeXml(chr)}"/></m:accPr>${wrap('e', base)}</m:acc>`;
    }
    case 'munderover': {
      // N-ary-ish: operator with under + over → sSubSup over the operator.
      const [base, sub, sup] = kids(el);
      return `<m:sSubSup>${wrap('e', base)}${wrap('sub', sub)}${wrap('sup', sup)}</m:sSubSup>`;
    }
    case 'munder': {
      const [base, sub] = kids(el);
      return `<m:sSub>${wrap('e', base)}${wrap('sub', sub)}</m:sSub>`;
    }
    case 'mtable': {
      const rows = kids(el).filter((c) => local(c.name) === 'mtr');
      const body = rows
        .map((r) => {
          const cells = kids(r)
            .filter((c) => local(c.name) === 'mtd')
            .map((c) => `<m:e>${convertChildren(c)}</m:e>`)
            .join('');
          return `<m:mr>${cells}</m:mr>`;
        })
        .join('');
      return `<m:m>${body}</m:m>`;
    }
    case 'semantics': {
      // KaTeX wraps the presentation MathML in <semantics> alongside an
      // <annotation> carrying the LaTeX source — convert the presentation
      // child, drop the annotation.
      const pres = kids(el).find((c) => local(c.name) !== 'annotation');
      return pres ? convertNode(pres) : '';
    }
    case 'annotation':
      return '';
    case 'math':
      return convertChildren(el);
    default:
      return convertChildren(el);
  }
}

const OMML_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math';

export interface MathmlToOmmlOptions {
  /** Force block (`<m:oMathPara>`) or inline (`<m:oMath>`). Defaults to the
   *  MathML root's `display` attribute. */
  display?: 'inline' | 'block';
}

/**
 * Convert a MathML string (`<math>…</math>`) to an OMML string. Returns
 * null when the input can't be parsed or yields no math.
 */
export function mathmlToOmml(mathml: string, options: MathmlToOmmlOptions = {}): string | null {
  if (!mathml || !mathml.trim()) return null;
  let root: XmlElement | undefined;
  try {
    const parsed = xml2js(mathml, { compact: false }) as XmlElement;
    root = (parsed.elements ?? []).find((e) => e.type === 'element' && local(e.name) === 'math');
    if (!root) root = (parsed.elements ?? []).find((e) => e.type === 'element');
  } catch {
    return null;
  }
  if (!root) return null;

  const body = convertNode(root);
  if (!body || !/[<]/.test(body)) return null;

  const rootDisplay =
    (root.attributes && (root.attributes['display'] as string | undefined)) || 'inline';
  const display = options.display ?? (rootDisplay === 'block' ? 'block' : 'inline');

  const oMath = `<m:oMath xmlns:m="${OMML_NS}">${body}</m:oMath>`;
  return display === 'block' ? `<m:oMathPara xmlns:m="${OMML_NS}">${oMath}</m:oMathPara>` : oMath;
}
