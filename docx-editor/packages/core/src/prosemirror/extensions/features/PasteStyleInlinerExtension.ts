/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Paste Style Inliner Extension
 *
 * When pasting from apps like Google Docs that use class-based CSS
 * (e.g. `<style>.c5 { margin-top: 12pt }</style>`) instead of inline styles,
 * ProseMirror's parseDOM can't read the styles because elements aren't attached
 * to the live document during parsing.
 *
 * This extension provides a `transformPastedHTML` hook that:
 * 1. Parses the pasted HTML string
 * 2. Extracts all `<style>` rules
 * 3. Inlines them onto matching elements
 * 4. Returns the modified HTML so parseDOM can read inline styles
 */

import { Plugin } from 'prosemirror-state';
import { Slice } from 'prosemirror-model';
import { createExtension } from '../create';
import type { ExtensionRuntime } from '../types';
import { Priority } from '../types';

/**
 * Parse a CSS rule's style declarations into a Record<property, value>.
 */
function parseStyleDeclarations(cssText: string): Record<string, string> {
  const result: Record<string, string> = {};
  // Split on semicolons, handling edge cases
  const declarations = cssText.split(';');
  for (const decl of declarations) {
    const trimmed = decl.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx < 0) continue;
    const prop = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();
    if (prop && value) {
      result[prop] = value;
    }
  }
  return result;
}

/**
 * Merge style declarations onto an element's existing inline style.
 * Existing inline styles take precedence (they were explicitly set by the app).
 */
function mergeStylesOntoElement(element: HTMLElement, declarations: Record<string, string>): void {
  const existingStyle = element.getAttribute('style') || '';
  const existingDeclarations = parseStyleDeclarations(existingStyle);

  // Only add properties that aren't already inline
  for (const [prop, value] of Object.entries(declarations)) {
    if (!(prop in existingDeclarations)) {
      element.style.setProperty(prop, value);
    }
  }
}

/**
 * Extract CSS rules from `<style>` elements and inline them onto matching elements.
 *
 * Uses the browser's CSSStyleSheet API to properly parse CSS rules,
 * handling complex selectors, specificity, etc.
 */
function inlineStylesFromStyleBlocks(doc: Document): void {
  const styleElements = doc.querySelectorAll('style');
  if (styleElements.length === 0) return;

  // Collect all CSS rules from all <style> blocks
  const rulesWithSelectors: Array<{
    selector: string;
    declarations: Record<string, string>;
  }> = [];

  for (const styleEl of styleElements) {
    const cssText = styleEl.textContent || '';
    if (!cssText.trim()) continue;

    // Use a temporary style sheet to parse CSS properly
    // This handles complex selectors, media queries, etc.
    try {
      const tempStyle = doc.createElement('style');
      tempStyle.textContent = cssText;
      doc.head.appendChild(tempStyle);

      const sheet = tempStyle.sheet;
      if (sheet) {
        for (let i = 0; i < sheet.cssRules.length; i++) {
          const rule = sheet.cssRules[i];
          if (rule instanceof CSSStyleRule) {
            const declarations: Record<string, string> = {};
            const style = rule.style;
            for (let j = 0; j < style.length; j++) {
              const prop = style[j];
              declarations[prop] = style.getPropertyValue(prop);
            }
            if (Object.keys(declarations).length > 0) {
              rulesWithSelectors.push({
                selector: rule.selectorText,
                declarations,
              });
            }
          }
        }
      }

      doc.head.removeChild(tempStyle);
    } catch {
      // If CSSStyleSheet parsing fails, fall back to regex-based parsing
      const ruleRegex = /([^{]+)\{([^}]+)\}/g;
      let match;
      while ((match = ruleRegex.exec(cssText)) !== null) {
        const selector = match[1].trim();
        const declarations = parseStyleDeclarations(match[2]);
        if (Object.keys(declarations).length > 0) {
          rulesWithSelectors.push({ selector, declarations });
        }
      }
    }
  }

  if (rulesWithSelectors.length === 0) return;

  // Apply each rule to matching elements in the document
  for (const { selector, declarations } of rulesWithSelectors) {
    try {
      const matchingElements = doc.body.querySelectorAll(selector);
      for (const el of matchingElements) {
        mergeStylesOntoElement(el as HTMLElement, declarations);
      }
    } catch {
      // Invalid selector — skip silently
    }
  }
}

/**
 * Google Docs wraps ALL clipboard content in a structural <b> tag:
 *   <b id="docs-internal-guid-XXXXX" style="font-weight:normal;">...content...</b>
 *
 * This is NOT a bold formatting tag — it is a container for Google Docs' internal
 * tracking GUID. The actual bold status is on <span> elements via font-weight CSS.
 *
 * This function detects such wrappers and replaces them with their child nodes,
 * preventing ProseMirror's BoldExtension parseDOM from applying bold to all content.
 */
function unwrapGoogleDocsStructuralB(doc: Document): void {
  const structuralBs = doc.body.querySelectorAll('b[id^="docs-internal-guid-"]');
  for (const b of structuralBs) {
    const parent = b.parentNode;
    if (!parent) continue;
    while (b.firstChild) {
      parent.insertBefore(b.firstChild, b);
    }
    parent.removeChild(b);
  }
}

/**
 * Convert Word's HTML list markup into real `<ul>`/`<ol>` lists.
 *
 * Word exports list items as plain `<p style="mso-list:...">` paragraphs with
 * the bullet/number baked in as a literal character inside a
 * `<span style="mso-list:Ignore">`. Pasted as-is, ProseMirror sees ordinary
 * paragraphs prefixed with a literal "·". Here we strip that literal-marker
 * span and wrap each run of consecutive list paragraphs in a `<ul>` (bullets)
 * or `<ol>` (numbers, detected from the marker text); the `<li>` parseDOM rule
 * in ParagraphExtension then turns them into real list paragraphs. (v1: nesting
 * folded flat.)
 */
function convertWordLists(doc: Document): void {
  const IGNORE_SEL = 'span[style*="mso-list:Ignore"], span[style*="mso-list: Ignore"]';
  const isListPara = (el: Element): boolean => /mso-list\s*:/.test(el.getAttribute('style') || '');
  const paras = Array.from(doc.querySelectorAll('p'));

  let i = 0;
  while (i < paras.length) {
    if (!isListPara(paras[i])) {
      i++;
      continue;
    }
    const firstMarker = (paras[i].querySelector(IGNORE_SEL)?.textContent || '').trim();
    const ordered = /[0-9a-z][.)]/i.test(firstMarker);

    const items: HTMLElement[] = [];
    let j = i;
    while (j < paras.length && isListPara(paras[j])) {
      const item = paras[j] as HTMLElement;
      item.querySelector(IGNORE_SEL)?.remove(); // drop the literal bullet/number
      items.push(item);
      j++;
    }

    const list = doc.createElement(ordered ? 'ol' : 'ul');
    for (const item of items) {
      const li = doc.createElement('li');
      while (item.firstChild) li.appendChild(item.firstChild);
      list.appendChild(li);
    }
    items[0].parentNode?.insertBefore(list, items[0]);
    for (const item of items) item.remove();

    i = j;
  }
}

/**
 * Transform pasted HTML: inline class-based CSS, unwrap Google Docs wrappers,
 * and convert Word list markup to real lists.
 */
function transformPastedHTML(html: string): string {
  const hasStyleBlock = html.includes('<style');
  const hasGoogleDocsWrapper = html.includes('docs-internal-guid-');
  const hasWordList = html.includes('mso-list');

  if (!hasStyleBlock && !hasGoogleDocsWrapper && !hasWordList) return html;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    if (hasStyleBlock) {
      inlineStylesFromStyleBlocks(doc);
      const styleElements = doc.querySelectorAll('style');
      for (const el of styleElements) {
        el.remove();
      }
    }

    if (hasGoogleDocsWrapper) {
      unwrapGoogleDocsStructuralB(doc);
    }

    if (hasWordList) {
      convertWordLists(doc);
    }

    return doc.body.innerHTML;
  } catch {
    return html;
  }
}

/**
 * When a pasted slice begins with a list paragraph but is "open" at the start
 * (openStart > 0), ProseMirror merges that first list paragraph into the
 * destination paragraph on insert — and the destination's (non-list) attrs win,
 * so the first list item silently loses its bullet/number. Closing the slice
 * start (openStart = 0) inserts the first item as its own block, preserving its
 * list attrs. Only applied when the leading block is actually a list paragraph,
 * so ordinary text paste is untouched.
 */
function closeListSliceStart(slice: Slice): Slice {
  if (slice.openStart === 0) return slice;
  const first = slice.content.firstChild;
  if (!first || first.type.name !== 'paragraph' || !first.attrs.numPr) {
    return slice;
  }
  return new Slice(slice.content, 0, slice.openEnd);
}

export const PasteStyleInlinerExtension = createExtension({
  name: 'pasteStyleInliner',
  // Run before other paste handlers so styles are inlined before parseDOM
  priority: Priority.High,
  onSchemaReady(): ExtensionRuntime {
    const plugin = new Plugin({
      props: {
        transformPastedHTML(html: string): string {
          return transformPastedHTML(html);
        },
        transformPasted(slice: Slice): Slice {
          return closeListSliceStart(slice);
        },
      },
    });

    return { plugins: [plugin] };
  },
});
