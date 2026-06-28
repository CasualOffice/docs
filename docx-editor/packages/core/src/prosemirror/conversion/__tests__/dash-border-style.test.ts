/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Pins OOXML `<a:prstDash>` → CSS `border-style` translation.
 *
 * CSS only accepts `solid` / `dotted` / `dashed`; OOXML has 11 named
 * variants. Without the translation, values like `"dashDot"` end up
 * verbatim in a CSS `border` rule, the browser rejects them, and
 * the entire border falls back to `none` — shapes / textboxes /
 * images that should have dashed outlines render without any
 * outline at all.
 */
import { describe, test, expect } from 'bun:test';
import type { Shape } from '../../../types/document';
import { toProseDoc } from '../toProseDoc';
import type { Document } from '../../../types/document';

function docWithShape(outline: NonNullable<Shape['outline']>): Document {
  const shape: Shape = {
    type: 'shape',
    shapeType: 'rect',
    size: { width: 914400, height: 914400 }, // 1in × 1in EMU
    outline,
    wrap: { type: 'inline' },
  };
  return {
    package: {
      document: {
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'run',
                content: [{ type: 'shape', shape }],
              },
            ],
          },
        ],
      },
    },
  };
}

function extractShapeOutlineStyle(doc: Document): string | undefined {
  const pm = toProseDoc(doc);
  let out: string | undefined;
  pm.descendants((node) => {
    if (node.type.name === 'shape' && node.attrs.outlineStyle) {
      out = node.attrs.outlineStyle as string;
    }
  });
  return out;
}

describe('OOXML prstDash → CSS border-style', () => {
  const cases: Array<[string, string]> = [
    ['solid', 'solid'],
    ['dash', 'dashed'],
    ['lgDash', 'dashed'],
    ['sysDash', 'dashed'],
    ['dashDot', 'dashed'],
    ['sysDashDot', 'dashed'],
    ['lgDashDot', 'dashed'],
    ['lgDashDotDot', 'dashed'],
    ['sysDashDotDot', 'dashed'],
    ['dot', 'dotted'],
    ['sysDot', 'dotted'],
  ];

  for (const [ooxml, css] of cases) {
    test(`${ooxml} maps to ${css}`, () => {
      const doc = docWithShape({
        width: 12700, // 1pt
        color: { rgb: 'FF0000' },
        style: ooxml as NonNullable<Shape['outline']>['style'],
      });
      expect(extractShapeOutlineStyle(doc)).toBe(css);
    });
  }

  test('unknown value defaults to solid', () => {
    const doc = docWithShape({
      width: 12700,
      color: { rgb: 'FF0000' },
      style: 'mystery' as NonNullable<Shape['outline']>['style'],
    });
    expect(extractShapeOutlineStyle(doc)).toBe('solid');
  });
});
