/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Doc-context summariser — gives every chat-driven AI call a one-
 * paragraph picture of the active document so the model can reason
 * about WHAT it's editing instead of treating each prompt as
 * context-free.
 *
 * Inputs are deliberately cheap to compute (plain-text scan + a small
 * walk of the PM doc when available). The output is plain English, no
 * markdown — designed to drop into a system prompt's preamble:
 *
 *   "You are editing the user's document. About the document:
 *    – Likely a resume / cover-letter
 *    – ~340 words, 4 headings (Summary, Experience, Education, Skills)
 *    – 8 bullet points · 1 table · 0 images
 *    – The user has 2 paragraphs of "Experience" selected (160 chars)"
 *
 * Caller passes `getDocText`, optional editor view, and the user's
 * current selection text. Returned string is capped at ~600 chars so
 * the system-prompt budget stays predictable.
 */

import type { EditorView } from 'prosemirror-view';

export interface DocContextOptions {
  /** Full plain-text snapshot of the document. */
  docText: string;
  /** Active editor view, if available — lets us count headings /
   *  bullets / tables without re-walking text. */
  view?: EditorView | null;
  /** Selection text (empty string if cursor only). */
  selectionText?: string;
}

interface Counts {
  paragraphs: number;
  headings: { level: number; text: string }[];
  bullets: number;
  numbered: number;
  tables: number;
  images: number;
}

function walkPm(view: EditorView): Counts {
  const c: Counts = {
    paragraphs: 0,
    headings: [],
    bullets: 0,
    numbered: 0,
    tables: 0,
    images: 0,
  };
  view.state.doc.descendants((node) => {
    if (node.type.name === 'paragraph') {
      c.paragraphs += 1;
      // Heading detection — fork uses `headingStyle` attr / mark-based
      // headings rather than a `heading` node. Detect via a font-size
      // mark > 22 half-points OR via a styleId hint.
      const styleId = node.attrs?.styleId as string | undefined;
      const looksHeading =
        (typeof styleId === 'string' && /^Heading\s*(\d)/i.test(styleId)) ||
        node.firstChild?.marks?.some(
          (m) => m.type.name === 'fontSize' && (m.attrs?.size ?? 0) >= 24
        );
      if (looksHeading) {
        const level = styleId?.match(/(\d)/)?.[1];
        const text = node.textContent?.slice(0, 80) ?? '';
        c.headings.push({
          level: level ? Number(level) : 2,
          text,
        });
      }
      const txt = node.textContent ?? '';
      if (/^\s*[-•]\s+/.test(txt)) c.bullets += 1;
      if (/^\s*\d+\.\s+/.test(txt)) c.numbered += 1;
    }
    if (node.type.name === 'table') {
      c.tables += 1;
      return false; // don't descend into cells for the count
    }
    if (node.type.name === 'image') c.images += 1;
    return true;
  });
  return c;
}

function wordCount(text: string): number {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

export type DocKind =
  | 'resume'
  | 'cover-letter'
  | 'memo'
  | 'academic'
  | 'meeting-notes'
  | 'markdown-doc'
  | null;

export function inferDocKind(text: string, headings: string[]): DocKind {
  const lc = text.toLowerCase();
  const hl = headings.map((h) => h.toLowerCase());
  const has = (re: RegExp) => hl.some((h) => re.test(h)) || re.test(lc.slice(0, 800));
  if (has(/experience/) && (has(/education/) || has(/skills/))) return 'resume';
  if (has(/cover letter/) || /dear hiring manager/i.test(text)) return 'cover-letter';
  if (has(/memorandum|to:|from:|subject:/i)) return 'memo';
  if (has(/abstract/) && has(/introduction/)) return 'academic';
  if (has(/agenda/)) return 'meeting-notes';
  if (/^\s*#/.test(text) || /\n\n#{1,6}\s/.test(text)) return 'markdown-doc';
  return null;
}

const DOC_TEXT_SCAN_LIMIT = 6000;
const SELECTION_HINT_CAP = 200;

export function summariseDocStructure(opts: DocContextOptions): string {
  const text = (opts.docText ?? '').slice(0, DOC_TEXT_SCAN_LIMIT);
  const view = opts.view ?? null;
  const counts = view
    ? walkPm(view)
    : ({ paragraphs: 0, headings: [], bullets: 0, numbered: 0, tables: 0, images: 0 } as Counts);
  const words = wordCount(text);
  const headingNames = counts.headings.map((h) => h.text.trim()).filter(Boolean);
  const kind = inferDocKind(text, headingNames);

  const parts: string[] = [];

  if (words === 0) {
    parts.push('The document is currently empty.');
  } else {
    const lead = kind ? `Likely a ${kind}.` : 'A working document.';
    parts.push(lead);
    parts.push(
      `~${words} word${words === 1 ? '' : 's'}` +
        (counts.paragraphs
          ? `, ${counts.paragraphs} paragraph${counts.paragraphs === 1 ? '' : 's'}`
          : '')
    );
    if (headingNames.length > 0) {
      const sample = headingNames.slice(0, 6).join(', ');
      parts.push(
        `${counts.headings.length} heading${counts.headings.length === 1 ? '' : 's'} (${sample}${headingNames.length > 6 ? ', …' : ''})`
      );
    }
    const decorationParts: string[] = [];
    if (counts.bullets > 0)
      decorationParts.push(`${counts.bullets} bullet point${counts.bullets === 1 ? '' : 's'}`);
    if (counts.numbered > 0)
      decorationParts.push(`${counts.numbered} numbered item${counts.numbered === 1 ? '' : 's'}`);
    if (counts.tables > 0)
      decorationParts.push(`${counts.tables} table${counts.tables === 1 ? '' : 's'}`);
    if (counts.images > 0)
      decorationParts.push(`${counts.images} image${counts.images === 1 ? '' : 's'}`);
    if (decorationParts.length > 0) parts.push(decorationParts.join(' · '));
  }

  const sel = opts.selectionText?.trim() ?? '';
  if (sel.length > 0) {
    const selWords = wordCount(sel);
    const preview = sel.length > SELECTION_HINT_CAP ? `${sel.slice(0, SELECTION_HINT_CAP)}…` : sel;
    parts.push(
      `The user currently has ${selWords} word${selWords === 1 ? '' : 's'} selected: "${preview}"`
    );
  } else {
    parts.push('No text is currently selected — cursor only.');
  }

  return parts.join('\n');
}
