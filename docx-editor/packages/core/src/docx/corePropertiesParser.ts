/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * docProps/core.xml — Open Packaging Conventions core properties.
 *
 * Word writes these fields with stable namespace prefixes (`cp:`, `dc:`,
 * `dcterms:`), so a regex-based extractor is enough to read them without
 * pulling the whole xml-js pipeline into the rezip hot path. The writer
 * (`applyCorePropertiesToXml`) preserves any other tags Word might have
 * written by editing the document in place — only the elements we know
 * about are touched.
 *
 * Fields covered (the set Word exposes in File → Info → Properties):
 *   - title           dc:title
 *   - subject         dc:subject
 *   - creator         dc:creator
 *   - keywords        cp:keywords
 *   - description     dc:description
 *   - lastModifiedBy  cp:lastModifiedBy
 *   - revision        cp:revision
 *   - created         dcterms:created
 *   - modified        dcterms:modified
 *   - category        cp:category
 *   - contentStatus   cp:contentStatus
 */

import { escapeXml } from './serializer/xmlUtils';

export interface CoreProperties {
  title?: string;
  subject?: string;
  creator?: string;
  keywords?: string;
  description?: string;
  lastModifiedBy?: string;
  revision?: number;
  created?: Date;
  modified?: Date;
  category?: string;
  contentStatus?: string;
}

interface FieldSpec {
  /** Key on the CoreProperties object. */
  key: keyof CoreProperties;
  /** Element name including namespace prefix. */
  element: string;
  /** Whether the element carries `xsi:type="dcterms:W3CDTF"`. */
  dateTyped?: boolean;
  /** Parse text → field value. Defaults to identity (string). */
  parse?: (text: string) => unknown;
  /** Serialize field value → text. Defaults to String(). */
  format?: (value: unknown) => string;
}

const FIELDS: FieldSpec[] = [
  { key: 'title', element: 'dc:title' },
  { key: 'subject', element: 'dc:subject' },
  { key: 'creator', element: 'dc:creator' },
  { key: 'keywords', element: 'cp:keywords' },
  { key: 'description', element: 'dc:description' },
  { key: 'lastModifiedBy', element: 'cp:lastModifiedBy' },
  { key: 'category', element: 'cp:category' },
  { key: 'contentStatus', element: 'cp:contentStatus' },
  {
    key: 'revision',
    element: 'cp:revision',
    parse: (t) => {
      const n = parseInt(t, 10);
      return Number.isFinite(n) ? n : undefined;
    },
  },
  {
    key: 'created',
    element: 'dcterms:created',
    dateTyped: true,
    parse: (t) => {
      const d = new Date(t);
      return Number.isNaN(d.getTime()) ? undefined : d;
    },
    format: (v) => (v instanceof Date ? v.toISOString() : ''),
  },
  {
    key: 'modified',
    element: 'dcterms:modified',
    dateTyped: true,
    parse: (t) => {
      const d = new Date(t);
      return Number.isNaN(d.getTime()) ? undefined : d;
    },
    format: (v) => (v instanceof Date ? v.toISOString() : ''),
  },
];

/** Build a regex that matches `<element ...>text</element>` and captures the inner text. */
function readRegex(element: string): RegExp {
  const escaped = element.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`);
}

const HTML_DECODE: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

function decodeXmlText(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos);/g, (m) => HTML_DECODE[m] ?? m);
}

/** Parse docProps/core.xml into a structured `CoreProperties`. */
export function parseCoreProperties(xml: string | null | undefined): CoreProperties | undefined {
  if (!xml || typeof xml !== 'string') return undefined;
  const out: CoreProperties = {};
  for (const field of FIELDS) {
    const m = xml.match(readRegex(field.element));
    if (!m) continue;
    const raw = decodeXmlText(m[1]);
    const value = field.parse ? field.parse(raw) : raw;
    if (value !== undefined && value !== '') {
      // Type assertion is safe — each field's parser returns the matching key's type.
      (out as Record<string, unknown>)[field.key] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Apply edits to a docProps/core.xml string. Only the fields present on
 * `updates` are touched; everything else (including unknown tags Word
 * may have written) is left in place. Missing tags are inserted before
 * `</cp:coreProperties>`.
 */
export function applyCorePropertiesToXml(
  xml: string,
  updates: Partial<CoreProperties> | undefined
): string {
  if (!updates || Object.keys(updates).length === 0) return xml;

  let result = xml;
  for (const field of FIELDS) {
    if (!(field.key in updates)) continue;
    const value = (updates as Record<string, unknown>)[field.key];

    // Remove the existing element first so we always emit a fresh, valid one.
    result = result.replace(readRegex(field.element), '');

    if (value === undefined || value === null || value === '') {
      // Drop the field entirely — explicit empty string also clears.
      continue;
    }

    const text = field.format ? field.format(value) : String(value);
    const attrs = field.dateTyped ? ' xsi:type="dcterms:W3CDTF"' : '';
    const newEl = `<${field.element}${attrs}>${escapeXml(text)}</${field.element}>`;
    if (/<\/cp:coreProperties>/.test(result)) {
      result = result.replace('</cp:coreProperties>', `${newEl}</cp:coreProperties>`);
    } else {
      // Defensive: malformed core.xml without a closing tag — append at end.
      result += newEl;
    }
  }
  return result;
}

/** Default core.xml shell used when the package has none. */
export const EMPTY_CORE_PROPERTIES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"></cp:coreProperties>`;
