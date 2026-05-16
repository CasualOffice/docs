/**
 * Pipeline-level unit test — does the layout-bridge produce a `textBox`
 * FlowBlock when we feed it a header that contains a textbox?
 *
 * Steps mirror what convertHeaderFooterToContent does internally:
 *   parseHeader → headerFooterToProseDoc → toFlowBlocks
 *
 * If a textBox block appears in the bridge's output, then the gap that
 * keeps Playwright tests red is downstream (painter / measureBlocks).
 * If it doesn't, the gap is upstream of the bridge.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { parseHeader } from '../../docx/headerFooterParser';
import { headerFooterToProseDoc } from '../../prosemirror/conversion/toProseDoc';
import { toFlowBlocks } from '../toFlowBlocks';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(
  here,
  '..', '..', '..', '..', '..',
  'e2e/fixtures/header-with-textbox.docx'
);

describe('Header bridge pipeline → toFlowBlocks (issue #318)', () => {
  test('header-with-textbox produces a textBox FlowBlock', async () => {
    const buf = readFileSync(fixturePath);
    const zip = await JSZip.loadAsync(buf);
    const headerXml = await zip.file('word/header1.xml')!.async('text');

    const header = parseHeader(headerXml);
    const pmDoc = headerFooterToProseDoc(header.content);
    const blocks = toFlowBlocks(pmDoc);

    const kinds = blocks.map((b) => b.kind);
    // For diagnostics if the test fails:
    if (!kinds.includes('textBox')) {
      console.error('  no textBox block in bridge output. Kinds seen:', kinds);
      // Walk the PM doc to see if it has a textBox node at all:
      let pmHasTextBox = false;
      pmDoc.descendants((node) => {
        if (node.type.name === 'textBox') pmHasTextBox = true;
      });
      console.error('  pmDoc has textBox node?', pmHasTextBox);
    }

    expect(kinds).toContain('textBox');
  });
});
