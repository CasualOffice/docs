/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Tests for parsing and round-tripping docProps/core.xml — the data
 * source for the File → Properties dialog.
 */

import { describe, test, expect } from 'bun:test';
import {
  parseCoreProperties,
  applyCorePropertiesToXml,
  EMPTY_CORE_PROPERTIES_XML,
} from '../corePropertiesParser';

const SAMPLE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Annual Report</dc:title>
  <dc:subject>FY 2025</dc:subject>
  <dc:creator>Jane Doe</dc:creator>
  <cp:keywords>finance; annual; report</cp:keywords>
  <dc:description>Year-end financials &amp; commentary</dc:description>
  <cp:lastModifiedBy>John Smith</cp:lastModifiedBy>
  <cp:revision>5</cp:revision>
  <dcterms:created xsi:type="dcterms:W3CDTF">2024-01-15T09:30:00Z</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">2024-12-20T14:45:00Z</dcterms:modified>
</cp:coreProperties>`;

describe('parseCoreProperties', () => {
  test('extracts all common fields', () => {
    const props = parseCoreProperties(SAMPLE);
    expect(props?.title).toBe('Annual Report');
    expect(props?.subject).toBe('FY 2025');
    expect(props?.creator).toBe('Jane Doe');
    expect(props?.keywords).toBe('finance; annual; report');
    expect(props?.description).toBe('Year-end financials & commentary');
    expect(props?.lastModifiedBy).toBe('John Smith');
    expect(props?.revision).toBe(5);
    expect(props?.created?.toISOString()).toBe('2024-01-15T09:30:00.000Z');
    expect(props?.modified?.toISOString()).toBe('2024-12-20T14:45:00.000Z');
  });

  test('returns undefined for empty/null input', () => {
    expect(parseCoreProperties(null)).toBeUndefined();
    expect(parseCoreProperties('')).toBeUndefined();
  });

  test('returns undefined when no fields are present', () => {
    expect(parseCoreProperties(EMPTY_CORE_PROPERTIES_XML)).toBeUndefined();
  });

  test('handles XML entity-encoded text', () => {
    const xml = `<cp:coreProperties><dc:title>A &amp; B &lt; C</dc:title></cp:coreProperties>`;
    expect(parseCoreProperties(xml)?.title).toBe('A & B < C');
  });
});

describe('applyCorePropertiesToXml', () => {
  test('updates an existing field in place', () => {
    const out = applyCorePropertiesToXml(SAMPLE, { title: 'New Title' });
    expect(out).toContain('<dc:title>New Title</dc:title>');
    expect(out).not.toContain('Annual Report');
    // Other fields are untouched.
    expect(out).toContain('<dc:creator>Jane Doe</dc:creator>');
  });

  test('inserts a missing field before </cp:coreProperties>', () => {
    const minimal = EMPTY_CORE_PROPERTIES_XML;
    const out = applyCorePropertiesToXml(minimal, { title: 'Fresh', creator: 'Bot' });
    expect(out).toContain('<dc:title>Fresh</dc:title>');
    expect(out).toContain('<dc:creator>Bot</dc:creator>');
    expect(out).toContain('</cp:coreProperties>');
    // The new tags land BEFORE the closer, not after.
    expect(out.indexOf('<dc:title>')).toBeLessThan(out.indexOf('</cp:coreProperties>'));
  });

  test('removes a field when set to empty string', () => {
    const out = applyCorePropertiesToXml(SAMPLE, { subject: '' });
    expect(out).not.toContain('FY 2025');
    expect(out).not.toContain('<dc:subject>');
  });

  test('escapes XML special characters in values', () => {
    const out = applyCorePropertiesToXml(EMPTY_CORE_PROPERTIES_XML, {
      description: 'A & B <c> "d"',
    });
    expect(out).toContain('A &amp; B &lt;c&gt; &quot;d&quot;');
  });

  test('writes dcterms:created with the W3CDTF xsi:type attribute', () => {
    const out = applyCorePropertiesToXml(EMPTY_CORE_PROPERTIES_XML, {
      created: new Date('2026-05-16T00:00:00Z'),
    });
    expect(out).toContain(
      '<dcterms:created xsi:type="dcterms:W3CDTF">2026-05-16T00:00:00.000Z</dcterms:created>'
    );
  });

  test('round-trip: parse → apply edit → re-parse preserves untouched fields', () => {
    const original = parseCoreProperties(SAMPLE)!;
    const edited = applyCorePropertiesToXml(SAMPLE, { title: 'Updated' });
    const reparsed = parseCoreProperties(edited)!;
    expect(reparsed.title).toBe('Updated');
    expect(reparsed.creator).toBe(original.creator);
    expect(reparsed.subject).toBe(original.subject);
    expect(reparsed.created?.toISOString()).toBe(original.created?.toISOString());
  });

  test('no-op when updates is undefined or empty', () => {
    expect(applyCorePropertiesToXml(SAMPLE, undefined)).toBe(SAMPLE);
    expect(applyCorePropertiesToXml(SAMPLE, {})).toBe(SAMPLE);
  });
});
