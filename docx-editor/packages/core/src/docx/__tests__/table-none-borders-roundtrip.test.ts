/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Pins round-trip of `<w:tblBorders>` blocks whose sides are all
 * declared `w:val="none"`. Word writes this verbatim to express
 * "table with no visible borders" (vs. inheriting from style). The
 * serializer was dropping any border element with style `none`/`nil`,
 * which collapsed the entire <w:tblBorders> block when every side was
 * `none` — scripts/roundtrip-audit.mjs surfaced 32 dropped `w:insideH`
 * + 32 dropped `w:insideV` + 20 dropped `w:tblBorders` across
 * header-with-textbox + template-with-hf-rule before this fix.
 */
import { describe, expect, test } from 'bun:test';
import type { TableFormatting } from '../../types/document';
import { serializeTableFormatting } from '../serializer/tableSerializer';

describe('w:tblBorders round-trip with all-`none` sides', () => {
  const allNone: NonNullable<TableFormatting['borders']> = {
    top: { style: 'none', size: 0, space: 0, color: { rgb: 'FFFFFF' } },
    left: { style: 'none', size: 0, space: 0, color: { rgb: 'FFFFFF' } },
    bottom: { style: 'none', size: 0, space: 0, color: { rgb: 'FFFFFF' } },
    right: { style: 'none', size: 0, space: 0, color: { rgb: 'FFFFFF' } },
    insideH: { style: 'none', size: 0, space: 0, color: { rgb: 'FFFFFF' } },
    insideV: { style: 'none', size: 0, space: 0, color: { rgb: 'FFFFFF' } },
  };

  test('emits <w:tblBorders> with every side present even when all are "none"', () => {
    const formatting: TableFormatting = { borders: allNone };
    const xml = serializeTableFormatting(formatting);
    expect(xml).toContain('<w:tblBorders>');
    expect(xml).toContain('<w:top w:val="none"');
    expect(xml).toContain('<w:left w:val="none"');
    expect(xml).toContain('<w:bottom w:val="none"');
    expect(xml).toContain('<w:right w:val="none"');
    expect(xml).toContain('<w:insideH w:val="none"');
    expect(xml).toContain('<w:insideV w:val="none"');
    expect(xml).toContain('</w:tblBorders>');
  });

  test('mixed: solid outer + none inner round-trips both', () => {
    const formatting: TableFormatting = {
      borders: {
        top: { style: 'single', size: 4, color: { rgb: '000000' } },
        bottom: { style: 'single', size: 4, color: { rgb: '000000' } },
        left: { style: 'single', size: 4, color: { rgb: '000000' } },
        right: { style: 'single', size: 4, color: { rgb: '000000' } },
        insideH: { style: 'none', size: 0, color: { rgb: 'FFFFFF' } },
        insideV: { style: 'none', size: 0, color: { rgb: 'FFFFFF' } },
      },
    };
    const xml = serializeTableFormatting(formatting);
    expect(xml).toContain('<w:top w:val="single"');
    expect(xml).toContain('<w:insideH w:val="none"');
    expect(xml).toContain('<w:insideV w:val="none"');
  });

  test('undefined borders still serializes nothing', () => {
    const xml = serializeTableFormatting({});
    expect(xml).not.toContain('<w:tblBorders>');
  });
});
