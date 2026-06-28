/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Pin <wps:cNvPr id="..." name="..."/> emission inside <wps:wsp>.
 *
 * Word always writes this non-visual common-properties element first
 * inside <wps:wsp> — it's what accessibility tooling and Office's
 * "Selection Pane" use to identify the shape. scripts/roundtrip-
 * audit.mjs flagged 10 dropped wps:cNvPr (8 in medical-incident-form,
 * 2 in others) before this commit.
 */
import { describe, expect, test } from 'bun:test';
import type { ShapeContent, Shape } from '../../types/document';
import { serializeRun } from '../serializer/runSerializer';

function shapeXml(overrides: Partial<Shape> = {}): string {
  const shape: Shape = {
    type: 'shape',
    shapeType: 'rect',
    size: { width: 914400, height: 914400 },
    wrap: { type: 'inline' },
    ...overrides,
  };
  const content: ShapeContent = { type: 'shape', shape };
  return serializeRun({ type: 'run', content: [content] });
}

describe('<wps:cNvPr> inside <wps:wsp>', () => {
  test('rect shape with explicit id+name round-trips both', () => {
    const xml = shapeXml({ id: '485885232', name: 'Rectangle 1' });
    expect(xml).toContain('<wps:cNvPr id="485885232" name="Rectangle 1"/>');
  });

  test('shape without explicit name gets a synthesized default', () => {
    const xml = shapeXml({ id: '42' });
    // Default for non-textbox shapes is "Shape <id>".
    expect(xml).toMatch(/<wps:cNvPr id="42" name="Shape \d+"\/>/);
  });

  test('textbox shape gets the textbox-flavored default name', () => {
    const xml = shapeXml({ id: '7', shapeType: 'textBox' });
    expect(xml).toMatch(/<wps:cNvPr id="7" name="TextBox \d+"\/>/);
  });

  test("cNvPr is emitted before cNvSpPr (Word's schema order)", () => {
    const xml = shapeXml({ id: '1', name: 'A' });
    const pr = xml.indexOf('<wps:cNvPr');
    const sp = xml.indexOf('<wps:cNvSpPr');
    expect(pr).toBeGreaterThan(0);
    expect(sp).toBeGreaterThan(pr);
  });

  test('special characters in name are XML-escaped', () => {
    const xml = shapeXml({ id: '1', name: 'Box <Bar & "Baz">' });
    expect(xml).toContain('<wps:cNvPr id="1" name="Box &lt;Bar &amp; &quot;Baz&quot;&gt;"/>');
  });
});
