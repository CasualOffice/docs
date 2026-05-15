/**
 * Unit tests for detectTableInsertHover — the table-insert "+" button hit-test
 * shared across React + Vue adapters.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { detectTableInsertHover } from '../tableInsertHover';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

function makePages(opts: {
  tableLeft: number;
  tableTop: number;
  cellWidth: number;
  rowHeight: number;
  containerClass?: string;
}): HTMLElement {
  const container = document.createElement('div');
  if (opts.containerClass) container.className = opts.containerClass;
  container.style.position = 'absolute';
  container.style.left = '0';
  container.style.top = '0';
  container.style.width = '1000px';
  container.style.height = '1000px';

  const tableEl = document.createElement('div');
  tableEl.className = 'layout-table';
  tableEl.style.position = 'absolute';
  tableEl.style.left = `${opts.tableLeft}px`;
  tableEl.style.top = `${opts.tableTop}px`;
  tableEl.style.width = `${opts.cellWidth}px`;
  tableEl.style.height = `${opts.rowHeight}px`;

  const rowEl = document.createElement('div');
  rowEl.className = 'layout-table-row';
  rowEl.style.position = 'absolute';
  rowEl.style.left = '0';
  rowEl.style.top = '0';
  rowEl.style.width = `${opts.cellWidth}px`;
  rowEl.style.height = `${opts.rowHeight}px`;

  const cellEl = document.createElement('div');
  cellEl.className = 'layout-table-cell';
  cellEl.dataset.pmStart = '42';
  cellEl.style.position = 'absolute';
  cellEl.style.left = '0';
  cellEl.style.top = '0';
  cellEl.style.width = `${opts.cellWidth}px`;
  cellEl.style.height = `${opts.rowHeight}px`;

  // Stub getBoundingClientRect — happy-dom doesn't compute real layout.
  const rect = (l: number, t: number, w: number, h: number) => () =>
    ({
      x: l,
      y: t,
      left: l,
      top: t,
      width: w,
      height: h,
      right: l + w,
      bottom: t + h,
      toJSON: () => ({}),
    }) as DOMRect;
  tableEl.getBoundingClientRect = rect(
    opts.tableLeft,
    opts.tableTop,
    opts.cellWidth,
    opts.rowHeight
  );
  rowEl.getBoundingClientRect = rect(opts.tableLeft, opts.tableTop, opts.cellWidth, opts.rowHeight);
  cellEl.getBoundingClientRect = rect(
    opts.tableLeft,
    opts.tableTop,
    opts.cellWidth,
    opts.rowHeight
  );

  rowEl.appendChild(cellEl);
  tableEl.appendChild(rowEl);
  container.appendChild(tableEl);
  return container;
}

describe('detectTableInsertHover', () => {
  let pagesContainer: HTMLElement;

  beforeEach(() => {
    pagesContainer = makePages({ tableLeft: 100, tableTop: 200, cellWidth: 400, rowHeight: 30 });
    document.body.replaceChildren(pagesContainer);
  });

  test('returns row hit when mouse is just left of a row', () => {
    const hit = detectTableInsertHover({
      mouseX: 95,
      mouseY: 215,
      pagesContainer,
      target: pagesContainer.querySelector('.layout-table-cell') as HTMLElement,
      hfEditMode: null,
    });
    expect(hit).not.toBeNull();
    expect(hit!.type).toBe('row');
    expect(hit!.cellPmPos).toBe(42);
  });

  test('returns column hit when mouse is just above a column', () => {
    const hit = detectTableInsertHover({
      mouseX: 200,
      mouseY: 195,
      pagesContainer,
      target: pagesContainer.querySelector('.layout-table-cell') as HTMLElement,
      hfEditMode: null,
    });
    expect(hit).not.toBeNull();
    expect(hit!.type).toBe('column');
    expect(hit!.cellPmPos).toBe(42);
  });

  test('returns null when mouse is far from any table edge', () => {
    const hit = detectTableInsertHover({
      mouseX: 800,
      mouseY: 800,
      pagesContainer,
      target: document.body,
      hfEditMode: null,
    });
    expect(hit).toBeNull();
  });

  test('returns null for body table when in HF edit mode (header)', () => {
    const hit = detectTableInsertHover({
      mouseX: 95,
      mouseY: 215,
      pagesContainer,
      target: pagesContainer.querySelector('.layout-table-cell') as HTMLElement,
      hfEditMode: 'header',
    });
    expect(hit).toBeNull();
  });

  test('returns hit for header table when in HF edit mode (header)', () => {
    pagesContainer = makePages({
      tableLeft: 100,
      tableTop: 200,
      cellWidth: 400,
      rowHeight: 30,
      containerClass: 'layout-page-header',
    });
    document.body.replaceChildren(pagesContainer);

    const hit = detectTableInsertHover({
      mouseX: 95,
      mouseY: 215,
      pagesContainer,
      target: pagesContainer.querySelector('.layout-table-cell') as HTMLElement,
      hfEditMode: 'header',
    });
    expect(hit).not.toBeNull();
  });

  test('returns null for header table when not in HF edit mode', () => {
    pagesContainer = makePages({
      tableLeft: 100,
      tableTop: 200,
      cellWidth: 400,
      rowHeight: 30,
      containerClass: 'layout-page-header',
    });
    document.body.replaceChildren(pagesContainer);

    const hit = detectTableInsertHover({
      mouseX: 95,
      mouseY: 215,
      pagesContainer,
      target: pagesContainer.querySelector('.layout-table-cell') as HTMLElement,
      hfEditMode: null,
    });
    expect(hit).toBeNull();
  });
});
