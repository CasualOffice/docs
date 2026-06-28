/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// C2 v0 — Insert → Shape submenu drops a default-styled SVG primitive
// at the cursor as an inline image. Spec covers each of the four
// shape types; we assert the image's `src` is an SVG data URL and the
// underlying SVG contains the expected primitive.
test.describe('Insert > Shape (C2 v0)', () => {
  for (const [label, type, primitive] of [
    ['Rectangle', 'rectangle', '<rect'],
    ['Ellipse', 'ellipse', '<ellipse'],
    ['Line', 'line', '<line'],
    ['Arrow', 'arrow', 'marker-end="url(#arrowhead)"'],
  ] as const) {
    test(`${label} drops an inline SVG`, async ({ page }) => {
      const editor = new EditorPage(page);
      await editor.goto();
      await editor.waitForReady();
      await editor.newDocument();
      await editor.focus();

      await page.getByRole('button', { name: 'Insert', exact: true }).click();
      await page.waitForSelector('[role="menu"]', { state: 'visible', timeout: 4000 });
      // Hover the "Shape" entry to surface the submenu, then click the type.
      await page.getByRole('menuitem', { name: /^Shape/ }).hover();
      await page.getByRole('menuitem', { name: new RegExp(`^${label}$`) }).click();

      // The painter renders inline images as <img> inside the page body.
      const img = page.locator('.paged-editor__pages img[src^="data:image/svg+xml"]').first();
      await expect(img).toBeVisible();
      const src = (await img.getAttribute('src')) ?? '';
      const decoded = decodeURIComponent(src.replace(/^data:image\/svg\+xml;utf8,/, ''));
      expect(decoded).toContain(primitive);

      if (type === 'rectangle') {
        await page.screenshot({ path: 'screenshots/c2-rectangle.png' });
      }
    });
  }
});
