/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Pin the .docx pre-flight: when a user renames `.doc` → `.docx` and
 * tries to open it, surface a clean "this is a legacy .doc, not a
 * .docx" error instead of the cryptic JSZip "Can't find end of
 * central directory" message that used to come out. Same applies to
 * RTF and any other non-zip input.
 *
 * Anything starting with PK is handed off to JSZip; non-PK bytes get
 * a magic-byte classification + a friendly error.
 */
import { describe, expect, test } from 'bun:test';
import { unzipDocx } from '../unzip';

function bytesOf(hex: string): ArrayBuffer {
  const clean = hex.replace(/\s+/g, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out.buffer;
}

describe('unzipDocx pre-flight magic-byte classification', () => {
  test('CFB / legacy .doc header → friendly "rename to .docx" error', async () => {
    const cfb = bytesOf('D0CF11E0A1B11AE1 00000000000000000000');
    let err: Error | null = null;
    try {
      await unzipDocx(cfb);
    } catch (e) {
      err = e as Error;
    }
    expect(err).not.toBeNull();
    expect(err!.message).toContain('.doc');
    expect(err!.message).toContain('.docx');
    expect(err!.message).not.toContain('central directory');
  });

  test('RTF header is detected', async () => {
    const rtf = bytesOf('7B5C72746631 0000');
    let err: Error | null = null;
    try {
      await unzipDocx(rtf);
    } catch (e) {
      err = e as Error;
    }
    expect(err).not.toBeNull();
    expect(err!.message).toContain('RTF');
  });

  test('zero-byte buffer fails fast with an "input is empty" message', async () => {
    let err: Error | null = null;
    try {
      await unzipDocx(new ArrayBuffer(0));
    } catch (e) {
      err = e as Error;
    }
    expect(err).not.toBeNull();
    expect(err!.message.toLowerCase()).toMatch(/empty|too small/);
  });

  test('Random non-zip bytes (no PK) are reported with the magic dump', async () => {
    const garbage = bytesOf('DEADBEEF DEADBEEF 0000');
    let err: Error | null = null;
    try {
      await unzipDocx(garbage);
    } catch (e) {
      err = e as Error;
    }
    expect(err).not.toBeNull();
    expect(err!.message.toLowerCase()).toContain('not a .docx');
    expect(err!.message.toLowerCase()).toContain('de ad be ef');
  });

  test('PK header (corrupt zip) yields the "looks like a ZIP but corrupt" wrapper', async () => {
    // "PK" + four bytes of garbage that won't pass JSZip's end-of-central-
    // directory check.
    const corruptZip = bytesOf('504B 0304 DEADBEEF');
    let err: Error | null = null;
    try {
      await unzipDocx(corruptZip);
    } catch (e) {
      err = e as Error;
    }
    expect(err).not.toBeNull();
    expect(err!.message).toContain('looks like a ZIP');
    expect(err!.message).toContain('corrupt or truncated');
  });
});
