/**
 * Regression coverage for border overlay geometry:
 * - Paragraph borders follow indented text extents, not the full page width.
 * - Page borders render as an inset overlay that honors OOXML spacing.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type {
  Page,
  ParagraphBlock,
  ParagraphFragment,
  ParagraphMeasure,
} from '../../layout-engine/types';
import { pointsToPixels } from '../../utils/units';
import { renderPage } from '../renderPage';
import { renderParagraphFragment } from '../renderParagraph';

let originalGetContext: typeof HTMLCanvasElement.prototype.getContext | undefined;

beforeAll(() => {
  GlobalRegistrator.register();
  originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function getContext(type: string) {
    if (type === '2d') {
      return {
        font: '',
        measureText: (text: string) => ({ width: text.length * 7 }),
      } as unknown as CanvasRenderingContext2D;
    }
    return null;
  } as typeof HTMLCanvasElement.prototype.getContext;
});

afterAll(() => {
  if (originalGetContext) {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  }
  GlobalRegistrator.unregister();
});

describe('border overlay layout', () => {
  test('paragraph borders are drawn around indented text extents', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'title',
      attrs: {
        alignment: 'center',
        indent: { left: 120, right: 90 },
        borders: {
          top: { style: 'solid', width: 2, color: '#000000', space: 7 },
          bottom: { style: 'solid', width: 2, color: '#000000', space: 9 },
          left: { style: 'solid', width: 2, color: '#000000', space: 5 },
          right: { style: 'solid', width: 2, color: '#000000', space: 6 },
        },
      },
      runs: [
        {
          kind: 'text',
          text: 'CENTERED BORDER TITLE',
          fontSize: 20,
          fontFamily: 'Times New Roman',
        },
      ],
    };
    const measure: ParagraphMeasure = {
      kind: 'paragraph',
      lines: [
        {
          fromRun: 0,
          fromChar: 0,
          toRun: 0,
          toChar: 21,
          width: 280,
          ascent: 24,
          descent: 6,
          lineHeight: 30,
        },
      ],
      totalHeight: 30,
    };
    const fragment: ParagraphFragment = {
      kind: 'paragraph',
      blockId: 'title',
      x: 40,
      y: 40,
      width: 600,
      height: 30,
      fromLine: 0,
      toLine: 1,
    };

    const el = renderParagraphFragment(
      fragment,
      block,
      measure,
      { pageNumber: 1, totalPages: 1, section: 'body' },
      { document }
    );
    const border = el.querySelector<HTMLElement>('.layout-paragraph-border');
    const line = el.querySelector<HTMLElement>('.layout-line');

    expect(border).toBeTruthy();
    expect(border!.style.left).toBe('115px');
    expect(border!.style.right).toBe('84px');
    expect(border!.style.top).toBe('-7px');
    expect(border!.style.bottom).toBe('-9px');
    expect(el.style.borderTop).toBe('');
    expect(line?.style.paddingLeft).toBe('120px');
    expect(line?.style.paddingRight).toBe('90px');
  });

  test('page borders render as a text-relative inset overlay with visible double lines', () => {
    const page: Page = {
      number: 1,
      fragments: [],
      margins: { top: 54, right: 36, bottom: 52, left: 54 },
      size: { w: 816, h: 1056 },
    };

    const el = renderPage(
      page,
      { pageNumber: 1, totalPages: 1, section: 'body' },
      {
        document,
        pageBorders: {
          display: 'allPages',
          offsetFrom: 'text',
          top: { style: 'double', size: 4, space: 15, color: { rgb: '000000' } },
          left: { style: 'double', size: 4, space: 15, color: { rgb: '000000' } },
          bottom: { style: 'double', size: 4, space: 11, color: { rgb: '000000' } },
          right: { style: 'double', size: 4, space: 2, color: { rgb: '000000' } },
        },
      }
    );
    const border = el.querySelector<HTMLElement>('.layout-page-border');

    expect(border).toBeTruthy();
    expect(parseFloat(border!.style.top)).toBeCloseTo(54 - pointsToPixels(15), 5);
    expect(parseFloat(border!.style.left)).toBeCloseTo(54 - pointsToPixels(15), 5);
    expect(parseFloat(border!.style.bottom)).toBeCloseTo(52 - pointsToPixels(11), 5);
    expect(parseFloat(border!.style.right)).toBeCloseTo(36 - pointsToPixels(2), 5);
    expect(border!.style.borderTopStyle).toBe('double');
    expect(border!.style.borderTopWidth).toBe('3px');
    expect(el.style.borderTopWidth).toBe('');
  });

  test('page border display firstPage is skipped after page one', () => {
    const page: Page = {
      number: 2,
      fragments: [],
      margins: { top: 54, right: 36, bottom: 52, left: 54 },
      size: { w: 816, h: 1056 },
    };

    const el = renderPage(
      page,
      { pageNumber: 2, totalPages: 2, section: 'body' },
      {
        document,
        pageBorders: {
          display: 'firstPage',
          offsetFrom: 'page',
          top: { style: 'single', size: 8, space: 24, color: { rgb: '000000' } },
        },
      }
    );

    expect(el.querySelector('.layout-page-border')).toBeNull();
  });
});
