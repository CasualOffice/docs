/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Unit test — does parseHeader actually capture textbox content for the
 * header-with-textbox.docx fixture? Direct inspection of the parsed
 * Document model, no rendering involved.
 *
 * If this passes but the e2e test still fails, the gap is downstream of
 * parsing (layout-bridge / toProseDoc / painter).
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { parseHeader } from '../headerFooterParser';
import type { Paragraph, Run, ShapeContent } from '../../types/document';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(
  here,
  '..',
  '..',
  '..',
  '..',
  '..',
  'e2e/fixtures/header-with-textbox.docx'
);

describe('parseHeader — textbox content (issue #318)', () => {
  test('header parser yields a shape with textBody for our injected textbox', async () => {
    const buf = readFileSync(fixturePath);
    const zip = await JSZip.loadAsync(buf);
    const headerXml = await zip.file('word/header1.xml')!.async('text');

    const result = parseHeader(headerXml);

    // Collect every ShapeContent across every run of every paragraph
    const shapes: ShapeContent[] = [];
    for (const item of result.content) {
      if (item.type !== 'paragraph') continue;
      const paragraph = item as Paragraph;
      for (const block of paragraph.content) {
        if (block.type !== 'run') continue;
        for (const rc of (block as Run).content) {
          if (rc.type === 'shape') shapes.push(rc as ShapeContent);
        }
      }
    }

    expect(shapes.length).toBeGreaterThan(0);
    const tb = shapes[0].shape;
    expect(tb.textBody).toBeDefined();
    const textPieces: string[] = [];
    for (const p of tb.textBody!.content) {
      for (const block of p.content) {
        if (block.type !== 'run') continue;
        for (const rc of (block as Run).content) {
          if (rc.type === 'text') textPieces.push(rc.text);
        }
      }
    }
    expect(textPieces.join(' ')).toContain('Header Textbox');
  });
});
