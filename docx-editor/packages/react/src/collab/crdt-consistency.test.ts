/**
 * Collab consistency guards (pillar A, docs/internal/22).
 *
 * Everything that travels over the Yjs CRDT in a collab session IS the
 * ProseMirror document. These tests pin the two properties that keep
 * collaboration drop-free:
 *
 *   1. CRDT round-trip is lossless — peer A's PM doc → Y.Doc → peer B's PM doc
 *      is byte-identical, so a joining peer (or a server decoding the Y.Doc)
 *      reconstructs every node/mark/attr, including the drawing envelopes the
 *      `fix(collab): carry drawing OOXML envelope in PM` change put on the
 *      shape/textBox nodes.
 *   2. Two peers converge — applying one peer's encoded state to a fresh Y.Doc
 *      yields the identical document.
 *
 * If either regresses, a real collab session silently loses content.
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import * as Y from 'yjs';
import { prosemirrorToYDoc, yDocToProsemirror } from 'y-prosemirror';
// Import core SOURCE (not the built dist) so this test needs no pre-build —
// the CI unit job runs `bun test` before the build step.
import { parseDocx } from '../../../core/src/docx/parser';
import { serializeDocument } from '../../../core/src/docx/serializer/documentSerializer';
import { toProseDoc, fromProseDoc } from '../../../core/src/prosemirror/conversion';
import { schema } from '../../../core/src/prosemirror/schema';

const FIXTURE_DIR = new URL('../../../../e2e/fixtures/', import.meta.url);
async function loadPM(name: string) {
  const buf = readFileSync(new URL(`${name}.docx`, FIXTURE_DIR));
  const pkg = await parseDocx(new Uint8Array(buf).buffer);
  return { pkg, pm: toProseDoc(pkg, { styles: pkg.package.styles }) };
}

// Spread of node kinds: images, tables, marks, merged cells, shapes/text-boxes.
const FIXTURES = [
  'example-with-image',
  'with-tables',
  'complex-styles',
  'merged-cells',
  'styled-content',
  'textbox-test',
  'vml-rect',
];

describe('collab consistency — CRDT round-trip is lossless', () => {
  for (const name of FIXTURES) {
    test(`${name}: PM → Y.Doc → PM is byte-identical`, async () => {
      const { pm } = await loadPM(name);
      const ydoc = prosemirrorToYDoc(pm, 'prosemirror');
      const pmBack = yDocToProsemirror(schema, ydoc);
      expect(JSON.stringify(pmBack.toJSON())).toBe(JSON.stringify(pm.toJSON()));
    });
  }

  test('two peers converge: applying A’s state to a fresh Y.Doc reproduces the doc', async () => {
    const { pm } = await loadPM('with-tables');
    const ydocA = prosemirrorToYDoc(pm, 'prosemirror');
    const ydocB = new Y.Doc();
    Y.applyUpdate(ydocB, Y.encodeStateAsUpdate(ydocA)); // peer B joins, gets A's state
    const pmB = yDocToProsemirror(schema, ydocB);
    expect(JSON.stringify(pmB.toJSON())).toBe(JSON.stringify(pm.toJSON()));
  });

  test('drawing envelope survives the full collab path (Yjs → rebuild → serialize)', async () => {
    // A peer joining from the Y.Doc, with no original seed, must still save the
    // <v:rect> drawing — the envelope rides through the CRDT on the node attrs.
    const { pm } = await loadPM('vml-rect');
    const ydoc = prosemirrorToYDoc(pm, 'prosemirror');
    const pmPeer = yDocToProsemirror(schema, ydoc);
    const saved = serializeDocument(fromProseDoc(pmPeer));
    expect(saved).toContain('<v:rect');
  });
});
