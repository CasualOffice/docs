/**
 * Regression guard for issue #386 — multiple <w:num> elements pointing to the
 * same <w:abstractNum> share counter state per ECMA-376 §17.9.18. A numId
 * with <w:lvlOverride>/<w:startOverride> resets that shared counter the first
 * time the numId is encountered.
 */

import { describe, test, expect } from 'bun:test';
import { toProseDoc } from '../../prosemirror/conversion/toProseDoc';
import { toFlowBlocks } from '../toFlowBlocks';
import type { Document, Paragraph } from '../../types/document';

function listPara(opts: {
  numId: number;
  ilvl?: number;
  text: string;
  abstractNumId?: number;
  startOverride?: number;
  marker?: string;
}): Paragraph {
  const ilvl = opts.ilvl ?? 0;
  return {
    type: 'paragraph',
    formatting: { numPr: { numId: opts.numId, ilvl } },
    content: [{ type: 'run', content: [{ type: 'text', text: opts.text }] }],
    listRendering: {
      marker: opts.marker ?? '(%1)',
      level: ilvl,
      numId: opts.numId,
      isBullet: false,
      numFmt: 'decimal',
      levelNumFmts: ['decimal'],
      abstractNumId: opts.abstractNumId,
      startOverride: opts.startOverride,
    },
  };
}

function doc(content: Paragraph[]): Document {
  return { package: { document: { content } } };
}

function markersOf(blocks: ReturnType<typeof toFlowBlocks>): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.kind === 'paragraph' && b.attrs?.listMarker) out.push(b.attrs.listMarker);
  }
  return out;
}

describe('toFlowBlocks — counter shared by abstractNumId', () => {
  test('two numIds with the same abstractNum share the running counter', () => {
    const d = doc([
      listPara({ numId: 1, abstractNumId: 4, text: 'a' }),
      listPara({ numId: 2, abstractNumId: 4, text: 'b' }),
      listPara({ numId: 1, abstractNumId: 4, text: 'c' }),
    ]);
    expect(markersOf(toFlowBlocks(toProseDoc(d), {}))).toEqual(['(1)', '(2)', '(3)']);
  });

  test('startOverride resets the shared counter on first encounter only', () => {
    // Mirrors issue #386: numId 1 (no override) then numId 2 (override=1)
    // then numId 1 again — the override fires once, then both keep sharing.
    const d = doc([
      listPara({ numId: 1, abstractNumId: 4, text: 'a' }),
      listPara({ numId: 1, abstractNumId: 4, text: 'b' }),
      listPara({ numId: 2, abstractNumId: 4, startOverride: 1, text: 'c' }),
      listPara({ numId: 1, abstractNumId: 4, text: 'd' }),
      listPara({ numId: 2, abstractNumId: 4, startOverride: 1, text: 'e' }),
    ]);
    expect(markersOf(toFlowBlocks(toProseDoc(d), {}))).toEqual(['(1)', '(2)', '(1)', '(2)', '(3)']);
  });

  test('startOverride fires per (numId, ilvl) — first paragraph at ilvl=0 does not suppress an override at ilvl=1', () => {
    // Per ECMA-376 §17.9.27 startOverride applies "when this level first
    // occurs". A numId with overrides on multiple ilvls must reset each
    // level on its own first appearance, not just the first ilvl seen.
    const d = doc([
      listPara({ numId: 1, ilvl: 0, abstractNumId: 4, startOverride: 5, text: 'a' }),
      listPara({
        numId: 1,
        ilvl: 1,
        abstractNumId: 4,
        startOverride: 7,
        marker: '%2.',
        text: 'b',
      }),
    ]);
    // Pre-fix: ilvl=1 line emitted "1." (override suppressed because numId=1
    // was already in the seen-set after the ilvl=0 paragraph).
    expect(markersOf(toFlowBlocks(toProseDoc(d), {}))).toEqual(['(5)', '7.']);
  });

  test('numIds without an abstractNumId stay independent (legacy fallback)', () => {
    const d = doc([listPara({ numId: 1, text: 'a' }), listPara({ numId: 2, text: 'b' })]);
    // Without a shared abstractNumId we key by numId — each starts fresh.
    expect(markersOf(toFlowBlocks(toProseDoc(d), {}))).toEqual(['(1)', '(1)']);
  });
});
