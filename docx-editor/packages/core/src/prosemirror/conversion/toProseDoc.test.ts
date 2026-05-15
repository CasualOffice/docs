/**
 * Integration tests for toProseDoc — theme color resolution in tables.
 *
 * Verifies that themed cell shading (w:shd with w:themeFill + w:themeFillTint/Shade)
 * is correctly resolved to RGB values on ProseMirror tableCell node attrs.
 */

import { afterAll, beforeAll, describe, test, expect } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { DOMSerializer } from 'prosemirror-model';
import { toProseDoc } from './toProseDoc';
import { fromProseDoc } from './fromProseDoc';
import { schema } from '../schema';
import type { Document, Table, TableRow, TableCell, Theme } from '../../types/document';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

const OFFICE_THEME: Theme = {
  colorScheme: {
    dk1: '000000',
    lt1: 'FFFFFF',
    dk2: '44546A',
    lt2: 'E7E6E6',
    accent1: '4472C4',
    accent2: 'ED7D31',
    accent3: 'A5A5A5',
    accent4: 'FFC000',
    accent5: '5B9BD5',
    accent6: '70AD47',
    hlink: '0563C1',
    folHlink: '954F72',
  },
};

function makeCell(formatting?: TableCell['formatting']): TableCell {
  return {
    type: 'tableCell',
    formatting,
    content: [{ type: 'paragraph', content: [] }],
  };
}

function makeTable(cells: TableCell[]): Table {
  const row: TableRow = { type: 'tableRow', cells };
  return { type: 'table', rows: [row] };
}

function makeDocument(table: Table, theme?: Theme): Document {
  return {
    package: {
      document: { content: [table] },
      theme,
    },
  };
}

// Collect all tableCell PM nodes in document order.
function collectCellAttrs(pmDoc: ReturnType<typeof toProseDoc>): Array<Record<string, unknown>> {
  const cells: Array<Record<string, unknown>> = [];
  pmDoc.descendants((node) => {
    if (node.type.name === 'tableCell') {
      cells.push(node.attrs as Record<string, unknown>);
    }
  });
  return cells;
}

// Border color for one physical side of a converted cell (the `borders` attr is loosely typed).
function borderColor(
  attrs: Record<string, unknown>,
  side: 'top' | 'bottom' | 'left' | 'right'
): { rgb?: string; themeColor?: string } | undefined {
  const borders = attrs.borders as
    | Record<string, { color?: { rgb?: string; themeColor?: string } }>
    | null
    | undefined;
  return borders?.[side]?.color;
}

describe('toProseDoc — table cell theme color resolution', () => {
  test('cell with RGB fill sets backgroundColor directly', () => {
    const cell = makeCell({ shading: { fill: { rgb: 'FF0000' } } });
    const doc = makeDocument(makeTable([cell]), OFFICE_THEME);
    const pmDoc = toProseDoc(doc);
    const cells = collectCellAttrs(pmDoc);
    expect(cells[0].backgroundColor).toBe('FF0000');
  });

  test('cell with theme fill resolves to base theme color', () => {
    // w:themeFill="accent1" with no tint/shade → base color
    const cell = makeCell({ shading: { fill: { themeColor: 'accent1' } } });
    const doc = makeDocument(makeTable([cell]), OFFICE_THEME);
    const pmDoc = toProseDoc(doc);
    const cells = collectCellAttrs(pmDoc);
    expect(cells[0].backgroundColor).toBe('4472C4');
  });

  test('cell with theme fill + tint resolves to lightened RGB', () => {
    // accent1 (#4472C4) with themeFillTint="33" → near-white blue
    // OOXML: t = 0x33/255 ≈ 0.2 → keep 20% color, 80% white
    const cell = makeCell({
      shading: { fill: { themeColor: 'accent1', themeTint: '33' } },
    });
    const doc = makeDocument(makeTable([cell]), OFFICE_THEME);
    const pmDoc = toProseDoc(doc);
    const cells = collectCellAttrs(pmDoc);
    expect(cells[0].backgroundColor).toBe('DAE3F3');
  });

  test('cell with theme fill + shade resolves to darkened RGB', () => {
    // background1 (lt1 = FFFFFF) with themeFillShade="F2" → light gray
    // OOXML: s = 0xF2/255 ≈ 0.949 → keep 95% of color
    const cell = makeCell({
      shading: { fill: { themeColor: 'background1', themeShade: 'F2' } },
    });
    const doc = makeDocument(makeTable([cell]), OFFICE_THEME);
    const pmDoc = toProseDoc(doc);
    const cells = collectCellAttrs(pmDoc);
    expect(cells[0].backgroundColor).toBe('F2F2F2');
  });

  test('cell with themed fill and no document theme leaves backgroundColor undefined', () => {
    // Without a theme, theme color references can't be resolved.
    // The rgb fallback is already overwritten by the parser when themeFill is present.
    const cell = makeCell({
      shading: { fill: { themeColor: 'accent1', themeTint: '33' } },
    });
    const doc = makeDocument(makeTable([cell]), undefined);
    const pmDoc = toProseDoc(doc);
    const cells = collectCellAttrs(pmDoc);
    expect(cells[0].backgroundColor).toBeFalsy();
  });

  test('multiple cells with different theme tints resolve independently', () => {
    // Mimics the real-world scenario: title row with dark tint, section row with light tint.
    const titleCell = makeCell({
      shading: { fill: { themeColor: 'accent1', themeTint: '99' } },
    });
    const sectionCell = makeCell({
      shading: { fill: { themeColor: 'accent1', themeTint: '33' } },
    });
    const doc = makeDocument(makeTable([titleCell, sectionCell]), OFFICE_THEME);
    const pmDoc = toProseDoc(doc);
    const cells = collectCellAttrs(pmDoc);
    // tint=99 (0.6) → medium blue
    expect(cells[0].backgroundColor).toBe('8FAADC');
    // tint=33 (0.2) → near-white
    expect(cells[1].backgroundColor).toBe('DAE3F3');
  });

  test('cell with themed border color resolves against the document theme', () => {
    // toDOM has no theme access, so a themed border color must be baked to RGB
    // at conversion time (mirrors the backgroundColor handling).
    const cell = makeCell({
      borders: { top: { style: 'single', size: 8, color: { themeColor: 'accent2' } } },
    });
    const doc = makeDocument(makeTable([cell]), OFFICE_THEME);
    const cells = collectCellAttrs(toProseDoc(doc));
    expect(borderColor(cells[0], 'top')?.rgb).toBe('ED7D31'); // accent2
  });

  test('themed border + tint resolves to the modified RGB', () => {
    const cell = makeCell({
      borders: {
        left: { style: 'single', size: 4, color: { themeColor: 'accent1', themeTint: '33' } },
      },
    });
    const doc = makeDocument(makeTable([cell]), OFFICE_THEME);
    const cells = collectCellAttrs(toProseDoc(doc));
    expect(borderColor(cells[0], 'left')?.rgb).toBe('DAE3F3');
  });

  test('themed border with no document theme is left for resolveColor to default', () => {
    const cell = makeCell({
      borders: { top: { style: 'single', size: 8, color: { themeColor: 'accent2' } } },
    });
    const doc = makeDocument(makeTable([cell]), undefined);
    const cells = collectCellAttrs(toProseDoc(doc));
    expect(borderColor(cells[0], 'top')?.themeColor).toBe('accent2');
  });

  test('plain RGB and auto border colors pass through unchanged', () => {
    const cell = makeCell({
      borders: {
        top: { style: 'single', size: 8, color: { rgb: 'FF0000' } },
        bottom: { style: 'single', size: 8, color: { rgb: 'auto' } },
      },
    });
    const doc = makeDocument(makeTable([cell]), OFFICE_THEME);
    const cells = collectCellAttrs(toProseDoc(doc));
    expect(borderColor(cells[0], 'top')?.rgb).toBe('FF0000');
    expect(borderColor(cells[0], 'bottom')?.rgb).toBe('auto');
  });
});

describe('ProseMirror table cell DOM serialization', () => {
  test('OOXML auto border colors serialize to valid CSS colors', () => {
    const borders = {
      top: { style: 'single', size: 8, color: { rgb: 'auto' } },
      bottom: { style: 'single', size: 8, color: { rgb: 'auto' } },
      left: { style: 'single', size: 8, color: { rgb: 'auto' } },
      right: { style: 'single', size: 8, color: { rgb: 'auto' } },
    };
    const cell = schema.nodes.tableCell.create({ borders }, schema.nodes.paragraph.create());

    const dom = DOMSerializer.fromSchema(schema).serializeNode(cell) as HTMLElement;
    const style = dom.getAttribute('style') ?? '';

    expect(style).toContain('border-width: 1px');
    expect(style).toContain('border-style: solid');
    expect(style).toContain('border-color: #000000');
    expect(style).not.toContain('#auto');
  });
});

describe('toProseDoc ↔ fromProseDoc round-trip — theme shading preservation', () => {
  function firstCellShading(doc: Document) {
    const table = doc.package.document.content[0] as Table;
    return table?.rows[0]?.cells[0]?.formatting?.shading;
  }

  test('themed cell with tint survives round-trip with theme refs intact', () => {
    const cell = makeCell({
      shading: { fill: { themeColor: 'accent1', themeTint: '33' } },
    });
    const inDoc = makeDocument(makeTable([cell]), OFFICE_THEME);

    const pmDoc = toProseDoc(inDoc);
    const outDoc = fromProseDoc(pmDoc, inDoc);
    const shading = firstCellShading(outDoc);

    expect(shading?.fill?.themeColor).toBe('accent1');
    expect(shading?.fill?.themeTint).toBe('33');
    // The resolved rgb is not injected when unchanged — the original shape stays.
    expect(shading?.fill?.rgb).toBeUndefined();
  });

  test('themed cell with shade survives round-trip', () => {
    const cell = makeCell({
      shading: { fill: { themeColor: 'background1', themeShade: 'F2' } },
    });
    const inDoc = makeDocument(makeTable([cell]), OFFICE_THEME);
    const outDoc = fromProseDoc(toProseDoc(inDoc), inDoc);
    const shading = firstCellShading(outDoc);
    expect(shading?.fill?.themeColor).toBe('background1');
    expect(shading?.fill?.themeShade).toBe('F2');
  });

  test('user-changed backgroundColor overrides theme refs with rgb', () => {
    const cell = makeCell({
      shading: { fill: { themeColor: 'accent1', themeTint: '33' } },
    });
    const inDoc = makeDocument(makeTable([cell]), OFFICE_THEME);
    const pmDoc = toProseDoc(inDoc);

    // Simulate the user picking a new color: swap backgroundColor on every cell.
    type JsonNode = { type?: string; attrs?: Record<string, unknown>; content?: JsonNode[] };
    const json = pmDoc.toJSON() as JsonNode;
    const setBg = (n: JsonNode) => {
      if (n.type === 'tableCell' && n.attrs) n.attrs.backgroundColor = 'FF00FF';
      n.content?.forEach(setBg);
    };
    setBg(json);
    const edited = pmDoc.type.schema.nodeFromJSON(json);

    const shading = firstCellShading(fromProseDoc(edited, inDoc));
    expect(shading?.fill?.rgb).toBe('FF00FF');
    expect(shading?.fill?.themeColor).toBeUndefined();
  });
});
