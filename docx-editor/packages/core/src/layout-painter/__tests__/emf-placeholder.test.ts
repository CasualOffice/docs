/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Pin the EMF / WMF image placeholder fallback.
 *
 * Word embeds EMF (Enhanced Metafile) and WMF (Windows Metafile)
 * thumbnails for charts, shapes, and OLE objects. No browser renders
 * those formats natively in an `<img>` tag — without a converter
 * we'd ship a broken-image icon. The painter detects the data-URL
 * MIME and emits a styled "EMF image — preview unavailable" /
 * "WMF image — preview unavailable" placeholder instead, sized to
 * match `wp:extent` so the surrounding layout stays stable.
 *
 * Pairs with `tiff-placeholder.test.ts`.
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { ImageRun } from '../../layout-engine/types';
import { renderInlineImageRun } from '../renderParagraph';

beforeAll(() => {
  GlobalRegistrator.register();
});

afterAll(() => {
  GlobalRegistrator.unregister();
});

function imageRun(overrides: Partial<ImageRun> = {}): ImageRun {
  return {
    kind: 'image',
    src: 'data:image/png;base64,iVBORw0KGgo=',
    width: 240,
    height: 160,
    ...overrides,
  };
}

describe('EMF / WMF image placeholder', () => {
  test('image/x-emf renders a labeled placeholder span, not an <img>', () => {
    const el = renderInlineImageRun(
      imageRun({ src: 'data:image/x-emf;base64,AQAAAA==' }),
      document
    );
    expect(el.tagName).toBe('SPAN');
    expect(el.classList.contains('layout-image-placeholder')).toBe(true);
    expect(el.style.width).toBe('240px');
    expect(el.style.height).toBe('160px');
    expect(el.textContent).toContain('EMF');
  });

  test('image/emf (without x- prefix) is also caught', () => {
    const el = renderInlineImageRun(imageRun({ src: 'data:image/emf;base64,AQAAAA==' }), document);
    expect(el.tagName).toBe('SPAN');
    expect(el.classList.contains('layout-image-placeholder')).toBe(true);
    expect(el.textContent).toContain('EMF');
  });

  test('image/x-wmf renders a WMF-labeled placeholder', () => {
    const el = renderInlineImageRun(
      imageRun({ src: 'data:image/x-wmf;base64,1858Pw==' }),
      document
    );
    expect(el.tagName).toBe('SPAN');
    expect(el.textContent).toContain('WMF');
  });

  test('image/wmf (without x- prefix) is caught and labeled WMF', () => {
    const el = renderInlineImageRun(imageRun({ src: 'data:image/wmf;base64,1858Pw==' }), document);
    expect(el.tagName).toBe('SPAN');
    expect(el.textContent).toContain('WMF');
  });

  test('alt text appears in EMF placeholder when present', () => {
    const el = renderInlineImageRun(
      imageRun({
        src: 'data:image/x-emf;base64,AQAAAA==',
        alt: 'Sales chart Q3',
      }),
      document
    );
    expect(el.textContent).toContain('Sales chart Q3');
    expect(el.textContent).toContain('EMF');
  });

  test('PNG still renders as <img> (regression guard)', () => {
    const el = renderInlineImageRun(imageRun({ src: 'data:image/png;base64,iVBOR' }), document);
    expect(el.tagName).toBe('IMG');
    expect(el.classList.contains('layout-image-placeholder')).toBe(false);
  });
});
