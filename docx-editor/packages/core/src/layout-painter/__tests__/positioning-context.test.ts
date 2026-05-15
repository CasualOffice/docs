/**
 * Regression tests for #379 — RenderContext.positioning controls the outer
 * position style of paragraph + table fragment renderers, so HF / textbox
 * callers don't have to flip inline styles after the fact.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderParagraphFragment } from '../renderParagraph';
import { renderTableFragment } from '../renderTable';
import type {
  ParagraphBlock,
  ParagraphFragment,
  ParagraphMeasure,
  TableBlock,
  TableFragment,
  TableMeasure,
} from '../../layout-engine/types';
import type { RenderContext } from '../renderPage';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

const baseContext: RenderContext = {
  pageNumber: 1,
  totalPages: 1,
  section: 'body',
};

function makeParagraphFragment(): {
  block: ParagraphBlock;
  fragment: ParagraphFragment;
  measure: ParagraphMeasure;
} {
  const block: ParagraphBlock = {
    kind: 'paragraph',
    id: 'p1',
    runs: [{ kind: 'text', text: 'hi' }],
  };
  const measure: ParagraphMeasure = {
    kind: 'paragraph',
    lines: [
      {
        fromRun: 0,
        fromChar: 0,
        toRun: 0,
        toChar: 2,
        width: 20,
        ascent: 10,
        descent: 3,
        lineHeight: 13,
      },
    ],
    totalHeight: 13,
  };
  const fragment: ParagraphFragment = {
    kind: 'paragraph',
    blockId: 'p1',
    x: 0,
    y: 0,
    width: 200,
    height: 13,
    fromLine: 0,
    toLine: 1,
  };
  return { block, fragment, measure };
}

function makeTableFragment(): {
  block: TableBlock;
  fragment: TableFragment;
  measure: TableMeasure;
} {
  const block: TableBlock = {
    kind: 'table',
    id: 't1',
    rows: [],
  };
  const measure: TableMeasure = {
    kind: 'table',
    rows: [],
    columnWidths: [200],
    totalWidth: 200,
    totalHeight: 30,
  };
  const fragment: TableFragment = {
    kind: 'table',
    blockId: 't1',
    x: 0,
    y: 0,
    width: 200,
    height: 30,
    fromRow: 0,
    toRow: 0,
  };
  return { block, fragment, measure };
}

describe('renderParagraphFragment — positioning hint (#379)', () => {
  test('default positioning produces position: relative', () => {
    const { block, fragment, measure } = makeParagraphFragment();
    const el = renderParagraphFragment(fragment, block, measure, baseContext);
    expect(el.style.position).toBe('relative');
  });

  test("positioning: 'flow' produces position: relative", () => {
    const { block, fragment, measure } = makeParagraphFragment();
    const el = renderParagraphFragment(fragment, block, measure, {
      ...baseContext,
      positioning: 'flow',
    });
    expect(el.style.position).toBe('relative');
  });

  test("positioning: 'absolute' produces position: absolute", () => {
    const { block, fragment, measure } = makeParagraphFragment();
    const el = renderParagraphFragment(fragment, block, measure, {
      ...baseContext,
      positioning: 'absolute',
    });
    expect(el.style.position).toBe('absolute');
  });
});

describe('renderTableFragment — positioning hint (#379)', () => {
  test('default positioning produces position: absolute (body legacy)', () => {
    const { block, fragment, measure } = makeTableFragment();
    const el = renderTableFragment(fragment, block, measure, baseContext);
    expect(el.style.position).toBe('absolute');
  });

  test("positioning: 'flow' produces position: relative", () => {
    const { block, fragment, measure } = makeTableFragment();
    const el = renderTableFragment(fragment, block, measure, {
      ...baseContext,
      positioning: 'flow',
    });
    expect(el.style.position).toBe('relative');
  });

  test("positioning: 'absolute' produces position: absolute", () => {
    const { block, fragment, measure } = makeTableFragment();
    const el = renderTableFragment(fragment, block, measure, {
      ...baseContext,
      positioning: 'absolute',
    });
    expect(el.style.position).toBe('absolute');
  });
});
