/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Pin parse + serialize round-trip for `<w:proofErr w:type="..."/>`
 * markers.
 *
 * Word's editor-internal spell/grammar checkpoints. We don't render or
 * act on them, but losing them on save floods scripts/roundtrip-audit.mjs
 * with 544 dropped tags across 8 fixtures and forces Word to redo all
 * proofing work on the next open. Round-tripped verbatim.
 *
 * These appear as siblings of <w:r> at paragraph level, never inside
 * runs.
 */
import { describe, expect, test } from 'bun:test';
import type { XmlElement } from '../xmlParser';
import { parseXmlDocument } from '../xmlParser';
import { parseParagraph } from '../paragraphParser';
import { serializeParagraph } from '../serializer/paragraphSerializer';

function parseAndSerialize(innerXml: string): string {
  const pXml = `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${innerXml}</w:p>`;
  const root = parseXmlDocument(pXml) as XmlElement | null;
  if (!root) throw new Error('parse failed');
  const paragraph = parseParagraph(root, null, null, null, null, null);
  return serializeParagraph(paragraph);
}

describe('<w:proofErr> round-trip', () => {
  test('spellStart + spellEnd around a run survive', () => {
    const out = parseAndSerialize(
      '<w:proofErr w:type="spellStart"/>' +
        '<w:r><w:t>Safetymint</w:t></w:r>' +
        '<w:proofErr w:type="spellEnd"/>'
    );
    expect(out).toContain('<w:proofErr w:type="spellStart"/>');
    expect(out).toContain('<w:proofErr w:type="spellEnd"/>');
    // ordering: start before run, end after.
    expect(out.indexOf('spellStart')).toBeLessThan(out.indexOf('<w:r>'));
    expect(out.indexOf('spellEnd')).toBeGreaterThan(out.indexOf('</w:r>'));
  });

  test('gramStart + gramEnd around a run survive', () => {
    const out = parseAndSerialize(
      '<w:proofErr w:type="gramStart"/>' +
        '<w:r><w:t>(text)</w:t></w:r>' +
        '<w:proofErr w:type="gramEnd"/>'
    );
    expect(out).toContain('<w:proofErr w:type="gramStart"/>');
    expect(out).toContain('<w:proofErr w:type="gramEnd"/>');
  });

  test('unknown proofErr type is ignored (defensive)', () => {
    const out = parseAndSerialize('<w:proofErr w:type="bogus"/>' + '<w:r><w:t>hello</w:t></w:r>');
    // Unknown type is dropped — we only serialize the four known enum values.
    expect(out).not.toContain('w:type="bogus"');
    expect(out).toContain('<w:t>hello</w:t>');
  });

  test('multiple proofErr siblings stay in original order', () => {
    const out = parseAndSerialize(
      '<w:r><w:t>a </w:t></w:r>' +
        '<w:proofErr w:type="spellStart"/>' +
        '<w:r><w:t>b</w:t></w:r>' +
        '<w:proofErr w:type="spellEnd"/>' +
        '<w:r><w:t> c </w:t></w:r>' +
        '<w:proofErr w:type="gramStart"/>' +
        '<w:r><w:t>d</w:t></w:r>' +
        '<w:proofErr w:type="gramEnd"/>'
    );
    const spellStart = out.indexOf('spellStart');
    const spellEnd = out.indexOf('spellEnd');
    const gramStart = out.indexOf('gramStart');
    const gramEnd = out.indexOf('gramEnd');
    expect(spellStart).toBeGreaterThan(0);
    expect(spellEnd).toBeGreaterThan(spellStart);
    expect(gramStart).toBeGreaterThan(spellEnd);
    expect(gramEnd).toBeGreaterThan(gramStart);
  });
});
