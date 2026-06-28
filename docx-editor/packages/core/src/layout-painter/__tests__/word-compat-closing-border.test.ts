/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Issue #395 — Word-compat closing-border heuristic.
 *
 * Word draws a horizontal line below the last body row of a table when
 * the table style's firstRow declares a bottom border, even though
 * ECMA-376 says firstRow's borders only apply to the first row. The
 * ground-truth matrix (see scripts/table-border-test-plan.md) shows
 * this is Word-only — LibreOffice and Google Docs don't draw it — so
 * the heuristic is gated behind RenderContext.wordCompat (off by
 * default) to preserve the spec-faithful rendering everyone else uses.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderTableFragment } from '../renderTable';
import type {
  CellBorderSpec,
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

const FIRST_ROW_BORDER: CellBorderSpec = { width: 1, color: '#000000', style: 'solid' };

/**
 * Build a 1-column, 2-row table where the first row declares a bottom
 * border and the last row's bottom is whatever the caller passes.
 * Mirrors the VeriCasaHeader fixture's shape (A1 in the test plan).
 */
function make2RowTable(lastRowBottom: CellBorderSpec | undefined | null): {
  block: TableBlock;
  measure: TableMeasure;
  fragment: TableFragment;
} {
  // null sentinel means "no borders object at all" — distinct from
  // `borders: { bottom: undefined }` which exercises the same branch
  // but goes through cell.borders defined-but-empty.
  const lastRowBorders = lastRowBottom === null ? undefined : { bottom: lastRowBottom };

  const block: TableBlock = {
    kind: 'table',
    id: 't1',
    rows: [
      {
        id: 'r0',
        cells: [{ id: 'c0', blocks: [], borders: { bottom: FIRST_ROW_BORDER } }],
      },
      {
        id: 'r1',
        cells: [{ id: 'c1', blocks: [], borders: lastRowBorders }],
      },
    ],
  };
  const measure: TableMeasure = {
    kind: 'table',
    rows: [
      { cells: [{ blocks: [], width: 200, height: 15 }], height: 15 },
      { cells: [{ blocks: [], width: 200, height: 15 }], height: 15 },
    ],
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
    toRow: 2,
  };
  return { block, measure, fragment };
}

function lastRowCell(el: HTMLElement): HTMLElement {
  const rows = el.querySelectorAll('.layout-table-row');
  const lastRow = rows[rows.length - 1] as HTMLElement;
  return lastRow.querySelector('.layout-table-cell') as HTMLElement;
}

describe('renderTableFragment — Word-compat closing border (#395)', () => {
  test('default (wordCompat off): last row has no bottom border', () => {
    const { block, measure, fragment } = make2RowTable(null);
    const el = renderTableFragment(fragment, block, measure, baseContext);
    const cell = lastRowCell(el);
    // No borders object on the last row's cell + heuristic off ⇒ nothing
    // touches borderBottom, so the inline style stays empty.
    expect(cell.style.borderBottom).toBe('');
  });

  test('wordCompat on: last row inherits firstRow bottom border', () => {
    const { block, measure, fragment } = make2RowTable(null);
    const el = renderTableFragment(fragment, block, measure, {
      ...baseContext,
      wordCompat: true,
    });
    const cell = lastRowCell(el);
    // applyBorder writes "<width>px <style> <color>"
    expect(cell.style.borderBottom).toBe('1px solid #000000');
  });

  test('wordCompat on + last row already has its own bottom: heuristic skipped', () => {
    const ownBorder: CellBorderSpec = { width: 2, color: '#ff0000', style: 'dashed' };
    const { block, measure, fragment } = make2RowTable(ownBorder);
    const el = renderTableFragment(fragment, block, measure, {
      ...baseContext,
      wordCompat: true,
    });
    const cell = lastRowCell(el);
    // Cell keeps its declared border — heuristic doesn't overwrite.
    expect(cell.style.borderBottom).toBe('2px dashed #ff0000');
  });

  test('wordCompat on + firstRow has no bottom: nothing to copy, heuristic adds nothing', () => {
    const { block, measure, fragment } = make2RowTable(null);
    // Strip the firstRow's bottom border so there's no template to copy.
    block.rows[0].cells[0].borders = {};
    const el = renderTableFragment(fragment, block, measure, {
      ...baseContext,
      wordCompat: true,
    });
    const cell = lastRowCell(el);
    expect(cell.style.borderBottom).toBe('');
  });

  test('wordCompat on: firstRow itself does not get a stray bottom from the heuristic', () => {
    const { block, measure, fragment } = make2RowTable(null);
    const el = renderTableFragment(fragment, block, measure, {
      ...baseContext,
      wordCompat: true,
    });
    const firstRow = el.querySelectorAll('.layout-table-row')[0] as HTMLElement;
    const firstCell = firstRow.querySelector('.layout-table-cell') as HTMLElement;
    // The firstRow's own declared bottom border is applied (1px solid black);
    // the heuristic should not double-apply, and crucially the first row is
    // not the last row, so isLastRow is false there.
    expect(firstCell.style.borderBottom).toBe('1px solid #000000');
  });
});
