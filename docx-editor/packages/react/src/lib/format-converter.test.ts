/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Routing coverage for the file-open format decision. The bug this guards:
 * opening a Markdown file via the FileSource / home-screen path fed its bytes
 * straight to the DOCX zip parser (garbled render). `toDocxBytes` is the shared
 * decision now used by every open path; a `.docx`/unknown/no-name input must
 * pass through untouched (no worker), and a foreign extension must be routed
 * for conversion.
 */

import { describe, expect, test } from 'bun:test';
import { formatFromFilename, isForeignFormat, toDocxBytes } from './format-converter';

describe('formatFromFilename + isForeignFormat — open routing decision', () => {
  test('markdown extensions resolve to the convertible "md" format', () => {
    expect(formatFromFilename('notes.md')).toBe('md');
    expect(formatFromFilename('README.markdown')).toBe('md');
    expect(isForeignFormat('md')).toBe(true);
  });

  test('odt and txt are convertible foreign formats', () => {
    expect(isForeignFormat(formatFromFilename('a.odt') as string)).toBe(true);
    expect(isForeignFormat(formatFromFilename('a.txt') as string)).toBe(true);
  });

  test('docx and pdf are NOT foreign (stay on the native path)', () => {
    expect(formatFromFilename('report.docx')).toBe('docx');
    expect(isForeignFormat('docx')).toBe(false);
    expect(isForeignFormat('pdf')).toBe(false);
  });
});

describe('toDocxBytes — passthrough (no worker) for native/unknown inputs', () => {
  const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer; // "PK.." zip magic

  test('a .docx filename returns the identical buffer', async () => {
    expect(await toDocxBytes(bytes, 'report.docx')).toBe(bytes);
  });

  test('a non-convertible extension (.pdf) returns the identical buffer', async () => {
    expect(await toDocxBytes(bytes, 'scan.pdf')).toBe(bytes);
  });

  test('no filename returns the identical buffer', async () => {
    expect(await toDocxBytes(bytes)).toBe(bytes);
  });
});
