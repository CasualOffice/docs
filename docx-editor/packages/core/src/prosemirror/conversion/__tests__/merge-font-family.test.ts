/** Regression for #391 — see mergeFontFamily for ECMA-376 §17.3.2.27 rule. */

import { describe, test, expect } from 'bun:test';
import { toProseDoc } from '../toProseDoc';
import type { Document, Paragraph, Style, StyleDefinitions } from '../../../types/document';

// Build a Document with a RowGap style whose rPr is the already-resolved
// basedOn chain output (StyleResolver expects pre-resolved styles).
function makeDocAndStyles(
  paragraph: Paragraph,
  resolvedStyleRPr: Style['rPr']
): { doc: Document; styles: StyleDefinitions } {
  const styles: StyleDefinitions = {
    styles: [
      {
        styleId: 'RowGap',
        type: 'paragraph',
        name: 'RowGap',
        pPr: {},
        rPr: resolvedStyleRPr,
      },
    ],
  };
  const doc: Document = {
    package: { document: { content: [paragraph] } },
  };
  return { doc, styles };
}

describe('toProseDoc fontFamily merge (#391)', () => {
  test('paragraph rPr with only eastAsia preserves inherited ascii from basedOn chain', () => {
    const para: Paragraph = {
      type: 'paragraph',
      formatting: {
        styleId: 'RowGap',
        runProperties: {
          fontFamily: { eastAsia: 'Calibri' },
        },
      },
      content: [],
    };
    const { doc, styles } = makeDocAndStyles(para, { fontFamily: { ascii: 'Arial Narrow' } });
    const pmDoc = toProseDoc(doc, { styles });
    const pmPara = pmDoc.firstChild!;
    const dtf = pmPara.attrs.defaultTextFormatting as
      | { fontFamily?: { ascii?: string; eastAsia?: string } }
      | undefined;
    expect(dtf?.fontFamily?.ascii).toBe('Arial Narrow');
    expect(dtf?.fontFamily?.eastAsia).toBe('Calibri');
  });

  test('paragraph rPr ascii overrides inherited ascii', () => {
    const para: Paragraph = {
      type: 'paragraph',
      formatting: {
        styleId: 'RowGap',
        runProperties: {
          fontFamily: { ascii: 'Times New Roman' },
        },
      },
      content: [],
    };
    const { doc, styles } = makeDocAndStyles(para, { fontFamily: { ascii: 'Arial Narrow' } });
    const pmDoc = toProseDoc(doc, { styles });
    const dtf = pmDoc.firstChild!.attrs.defaultTextFormatting as
      | { fontFamily?: { ascii?: string } }
      | undefined;
    expect(dtf?.fontFamily?.ascii).toBe('Times New Roman');
  });
});
