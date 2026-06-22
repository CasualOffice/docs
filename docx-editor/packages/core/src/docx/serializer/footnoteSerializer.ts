/**
 * Footnote text editing — surgically replaces ONLY the visible `<w:t>` text of
 * an edited footnote inside the original `word/footnotes.xml`, leaving all
 * markup byte-identical: the `<w:footnoteRef/>` number marker, paragraph/run
 * properties, separators, namespaces, `w:footnotePr`, and every untouched
 * footnote.
 *
 * Why text-only (not model regeneration): the parser drops the def-side
 * `<w:footnoteRef/>` element (it keeps only the FootnoteReference run style),
 * so regenerating a footnote block from the model would lose the painted
 * footnote number. Editing the original XML's text in place preserves it.
 *
 * This is opt-in: callers only run `replaceFootnotesInXml` for footnotes that
 * were actually edited. Untouched documents keep footnotes.xml verbatim, so
 * the round-trip-fidelity guarantee is preserved.
 */
import type { Footnote } from '../../types/content';
import { getFootnoteText } from '../footnoteParser';
import { escapeXml } from './xmlUtils';

/**
 * Replace the text of every `<w:t>` inside a single footnote's body markup:
 * the new plain text goes into the FIRST `<w:t>` (forced `xml:space="preserve"`
 * so leading/trailing spaces survive), and any subsequent `<w:t>` is emptied —
 * collapsing the footnote to one text run while keeping its marker + styling.
 */
function setBodyText(bodyXml: string, text: string): string {
  const esc = escapeXml(text);
  let first = true;
  let replaced = false;
  const out = bodyXml.replace(/<w:t\b[^>]*>[\s\S]*?<\/w:t>/g, () => {
    if (first) {
      first = false;
      replaced = true;
      return `<w:t xml:space="preserve">${esc}</w:t>`;
    }
    return `<w:t xml:space="preserve"></w:t>`;
  });
  // Footnote had no text run yet (only the marker): inject one after the first
  // run so the new text is shown.
  if (!replaced) {
    return out.replace(/(<\/w:r>)/, `$1<w:r><w:t xml:space="preserve">${esc}</w:t></w:r>`);
  }
  return out;
}

/**
 * Surgically replace each edited footnote's text inside the original XML.
 * Footnotes don't nest, so a non-greedy match to the next `</w:footnote>` is
 * exact. The new text is the footnote model's current plain text.
 */
export function replaceFootnotesInXml(originalXml: string, edited: Footnote[]): string {
  let xml = originalXml;
  for (const fn of edited) {
    const re = new RegExp(
      `(<w:footnote\\b[^>]*\\bw:id="${fn.id}"[^>]*>)([\\s\\S]*?)(</w:footnote>)`
    );
    xml = xml.replace(re, (_m, open: string, body: string, close: string) => {
      return open + setBodyText(body, getFootnoteText(fn)) + close;
    });
  }
  return xml;
}

/**
 * Replace a footnote's plain text in the MODEL (so the rendered footnote area
 * re-paints immediately). Mirrors what `setBodyText` will write on save: the
 * marker run is kept, the body collapses to a single text run.
 */
export function setFootnotePlainText(fn: Footnote, text: string): void {
  const para = fn.content.find((b) => b.type === 'paragraph');
  if (!para || para.type !== 'paragraph') {
    fn.content = [
      { type: 'paragraph', content: [{ type: 'run', content: [{ type: 'text', text }] }] },
    ];
    return;
  }
  const kept: typeof para.content = [];
  let markerFormatting: import('../../types/formatting').TextFormatting | undefined;
  for (const c of para.content) {
    if (c.type === 'run') {
      const markers = c.content.filter((rc) => rc.type !== 'text');
      if (markers.length > 0) {
        kept.push({ ...c, content: markers });
        if (!markerFormatting) markerFormatting = c.formatting;
      }
    } else {
      kept.push(c);
    }
  }
  kept.push({ type: 'run', formatting: markerFormatting, content: [{ type: 'text', text }] });
  para.content = kept;
}
