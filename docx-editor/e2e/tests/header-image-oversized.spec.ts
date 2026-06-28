/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * GH #265 — Header image renders oversized and overlays body content.
 *
 * Fixture (`oversized-header-image.docx`) declares an inline header
 * image at 1800×600 px on a Letter page with 1-inch margins (content
 * area ≈ 624 px wide). Pre-fix, the painter rendered the inline image
 * at its full natural pixel width and let it overlay the body line
 * below. The painter now sets `max-width: 100%` on every inline /
 * block image, clamping the rendered width to the parent container.
 *
 * We assert:
 *   1. The visible header `<img>`'s rendered width is no wider than
 *      the header element (no horizontal overflow).
 *   2. The body's first text line starts BELOW the bottom of the
 *      rendered header image — no overlap.
 */

test('oversized inline header image is clamped and does not overlay body', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/oversized-header-image.docx');
  await page.waitForTimeout(600);

  const layout = await page.evaluate(() => {
    const headers = Array.from(
      document.querySelectorAll<HTMLElement>('.layout-page-header')
    ).filter((el) => !el.closest('.paged-editor__hidden-pm'));
    if (headers.length === 0) return { error: 'no visible header' as const };

    const header = headers[0];
    const headerRect = header.getBoundingClientRect();
    const img = header.querySelector('img');
    if (!img) return { error: 'no header img' as const };
    const imgRect = img.getBoundingClientRect();

    // Find the visible body line that contains the canary "BODY-LINE-ONE".
    let bodyRect: DOMRect | null = null;
    const pages = Array.from(document.querySelectorAll<HTMLElement>('.layout-page')).filter(
      (el) => !el.closest('.paged-editor__hidden-pm')
    );
    for (const pageEl of pages) {
      const lines = pageEl.querySelectorAll<HTMLElement>('span, p, div');
      for (const el of Array.from(lines)) {
        if (el.textContent?.trim() === 'BODY-LINE-ONE') {
          bodyRect = el.getBoundingClientRect();
          break;
        }
      }
      if (bodyRect) break;
    }

    return {
      headerWidth: headerRect.width,
      imgWidth: imgRect.width,
      imgRight: imgRect.right - headerRect.left,
      imgBottom: imgRect.bottom,
      bodyTop: bodyRect?.top ?? null,
    };
  });

  if ('error' in layout) throw new Error(layout.error);

  // The image declared 1800 px wide. After clamp, rendered width
  // should be no greater than the header content width.
  expect(layout.imgWidth).toBeGreaterThan(0);
  expect(layout.imgWidth).toBeLessThanOrEqual(layout.headerWidth + 1);

  // Body content's first line must start at or below the image's
  // bottom edge — no overlap.
  expect(layout.bodyTop).not.toBeNull();
  expect(layout.bodyTop!).toBeGreaterThanOrEqual(layout.imgBottom - 1);
});
