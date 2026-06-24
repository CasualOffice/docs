/**
 * Proving test for the co-editing fidelity gap (audit doc 17, §2).
 *
 * The raw-XML envelopes that preserve VML / DrawingML / textbox drawings on
 * round-trip live on the parsed Document model (`Shape.rawXml`), NOT in the
 * ProseMirror document. Everything that travels over the Yjs CRDT in a collab
 * session IS the ProseMirror document. So anything reconstructing a Document
 * *from* the Y.Doc — e.g. a server-side snapshot decoding the shared state, or
 * a peer that joined without the original seed — rebuilds the body from PM and
 * silently drops those envelopes.
 *
 * This test pins that loss, and the crucial corollary: holding the seed and
 * passing it to `fromProseDoc` does NOT save inline body drawings, because
 * `fromProseDoc` rebuilds `document.content` from PM blocks (`extractBlocks`);
 * the seed only restores section-level scaffolding (headers/footers/sections).
 *
 * Therefore the server-side-snapshot fix (chosen direction) must apply a
 * SELECTIVE SAVE against the seed BYTES — keeping untouched drawings' original
 * XML verbatim — not a from-PM re-serialize. When that fix lands, the
 * `not.toContain` assertions below flip to `toContain` for the seed path, and
 * this file becomes its regression guard.
 */
import { describe, test, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { parseDocx } from './parser';
import { toProseDoc, fromProseDoc } from '../prosemirror/conversion';
import { serializeDocument } from './serializer/documentSerializer';

const FIXTURE = path.resolve(__dirname, '../../../../e2e/fixtures/vml-rect.docx');
const ENVELOPE = '<v:rect'; // the VML drawing this fixture round-trips via rawXml

describe('co-editing fidelity — envelope loss across the CRDT/PM boundary (audit 17 §2)', () => {
  test('a from-PM reconstruction (Y.Doc-only) drops the inline body envelope', async () => {
    const buf = fs.readFileSync(FIXTURE);
    const pkg = await parseDocx(buf);

    // Baseline: the parsed model carries the VML envelope, so serializing the
    // model straight out preserves the <v:rect> drawing.
    const original = serializeDocument(pkg);
    expect(original).toContain(ENVELOPE);

    // Reconstruct the Document from PM — the data a server-side snapshot
    // decoding only the Y.Doc has to work with.
    const pmDoc = toProseDoc(pkg, { styles: pkg.package.styles });
    const rebuiltNoSeed = fromProseDoc(pmDoc); //          server has only the Y.Doc
    const rebuiltWithSeed = fromProseDoc(pmDoc, pkg); //   server also fetched the seed model

    const outNoSeed = serializeDocument(rebuiltNoSeed);
    const outWithSeed = serializeDocument(rebuiltWithSeed);

    // FIXED: the drawing envelope now rides through the PM document (carried on
    // the shape/textBox node attrs in `toProseDoc`, restored in `fromProseDoc`),
    // so a from-PM rebuild re-emits it verbatim — with OR without the seed. This
    // is what makes drawings survive a structural edit, a collab peer joining
    // from the Y.Doc, and a server-side snapshot. This file is now the
    // regression guard for that.
    expect(outNoSeed).toContain(ENVELOPE);
    expect(outWithSeed).toContain(ENVELOPE);
  });
});
