/**
 * Regression: positioned wrapNone images render in the floating layer but do
 * not create text-wrap exclusion margins.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type {
  Page,
  ParagraphBlock,
  ParagraphFragment,
  ParagraphMeasure,
} from '../../layout-engine/types';
import { renderPage, isFloatingImageRun, isTextWrappingFloatingImageRun } from '../renderPage';

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

const positionedImageRun = {
  kind: 'image' as const,
  src: 'data:image/png;base64,synthetic',
  width: 96,
  height: 96,
  wrapType: 'inFront',
  displayMode: 'float' as const,
  cssFloat: 'none' as const,
  position: {
    horizontal: { relativeTo: 'column', posOffset: 0 },
    vertical: { relativeTo: 'paragraph', posOffset: 0 },
  },
};

describe('wrapNone floating image rendering', () => {
  test('inFront image is floating but not text-wrapping', () => {
    expect(isFloatingImageRun(positionedImageRun)).toBe(true);
    expect(isTextWrappingFloatingImageRun(positionedImageRun)).toBe(false);

    expect(
      isTextWrappingFloatingImageRun({
        ...positionedImageRun,
        wrapType: 'square',
        cssFloat: 'left',
      })
    ).toBe(true);
  });

  test('renderPage does not offset lines around inFront images', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'p1',
      runs: [
        positionedImageRun,
        {
          kind: 'text',
          text: 'Text should keep the full line width because wrapNone does not wrap.',
          fontSize: 11,
          fontFamily: 'Calibri',
        },
      ],
    };
    const measure: ParagraphMeasure = {
      kind: 'paragraph',
      lines: [
        {
          fromRun: 0,
          fromChar: 0,
          toRun: 1,
          toChar: block.runs[1].kind === 'text' ? block.runs[1].text.length : 0,
          width: 410,
          ascent: 14,
          descent: 4,
          lineHeight: 18,
        },
      ],
      totalHeight: 18,
    };
    const fragment: ParagraphFragment = {
      kind: 'paragraph',
      blockId: 'p1',
      x: 50,
      y: 50,
      width: 500,
      height: measure.totalHeight,
      fromLine: 0,
      toLine: measure.lines.length,
    };
    const page: Page = {
      number: 1,
      fragments: [fragment],
      margins: { top: 50, right: 50, bottom: 50, left: 50 },
      size: { w: 600, h: 800 },
    };

    const el = renderPage(
      page,
      { pageNumber: 1, totalPages: 1, section: 'body' },
      {
        document,
        blockLookup: new Map([['p1', { block, measure }]]),
      }
    );

    expect(el.querySelectorAll('.layout-page-floating-image').length).toBe(1);
    const firstLine = el.querySelector<HTMLElement>('.layout-line');
    expect(firstLine).toBeTruthy();
    expect(parseFloat(firstLine!.style.marginLeft || '0')).toBe(0);
    expect(parseFloat(firstLine!.style.marginRight || '0')).toBe(0);
  });
});
