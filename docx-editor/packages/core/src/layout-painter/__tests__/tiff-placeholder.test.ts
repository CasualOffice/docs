/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Pin the TIFF-image placeholder fallback.
 *
 * Per gap-matrix `tiff-images` + GH #146: Chrome and Firefox both
 * refuse to render `data:image/tiff;base64,…` URLs (Safari handles
 * it). Without a converter we'd show a broken-image icon, which
 * looks like a bug rather than a format-support issue. The renderer
 * now ships a styled "TIFF image — preview unavailable" placeholder
 * sized to match the original `wp:extent` so the surrounding layout
 * stays stable.
 *
 * PNG/JPEG/SVG/GIF/etc. follow the normal `<img>` path.
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
    width: 200,
    height: 100,
    ...overrides,
  };
}

describe('TIFF image placeholder', () => {
  test('TIFF data URL renders a placeholder span, not an <img>', () => {
    const el = renderInlineImageRun(imageRun({ src: 'data:image/tiff;base64,SUkqAA==' }), document);
    expect(el.tagName).toBe('SPAN');
    expect(el.classList.contains('layout-image-placeholder')).toBe(true);
    expect(el.style.width).toBe('200px');
    expect(el.style.height).toBe('100px');
    expect(el.textContent).toContain('TIFF');
  });

  test('image/tif (no second f) is also caught', () => {
    const el = renderInlineImageRun(imageRun({ src: 'data:image/tif;base64,SUkqAA==' }), document);
    expect(el.tagName).toBe('SPAN');
    expect(el.classList.contains('layout-image-placeholder')).toBe(true);
  });

  test('alt text appears in the placeholder when present', () => {
    const el = renderInlineImageRun(
      imageRun({
        src: 'data:image/tiff;base64,SUkqAA==',
        alt: 'Microscope photograph',
      }),
      document
    );
    expect(el.textContent).toContain('Microscope photograph');
    expect(el.textContent).toContain('TIFF');
  });

  test('PNG renders as <img>, not a placeholder', () => {
    const el = renderInlineImageRun(imageRun({ src: 'data:image/png;base64,iVBOR' }), document);
    expect(el.tagName).toBe('IMG');
    expect(el.classList.contains('layout-image-placeholder')).toBe(false);
  });

  test('JPEG renders as <img>', () => {
    const el = renderInlineImageRun(imageRun({ src: 'data:image/jpeg;base64,/9j/' }), document);
    expect(el.tagName).toBe('IMG');
  });

  test('SVG renders as <img>', () => {
    const el = renderInlineImageRun(imageRun({ src: 'data:image/svg+xml,%3Csvg/%3E' }), document);
    expect(el.tagName).toBe('IMG');
  });

  test('non-data URL (e.g. http) renders as <img> (browser handles fetch)', () => {
    const el = renderInlineImageRun(imageRun({ src: 'https://example.com/image.tiff' }), document);
    // We can't detect format from URL paths reliably; let the browser
    // either render it or show its native broken-image icon. Anyone
    // shipping http-URL TIFFs through the editor is already in
    // non-DOCX-native territory.
    expect(el.tagName).toBe('IMG');
  });
});
