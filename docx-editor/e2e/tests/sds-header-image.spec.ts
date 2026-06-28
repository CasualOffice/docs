/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

test('SDS header image renders at least once', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/sds-real-world.docx');
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    return {
      total: imgs.length,
      inHidden: imgs.filter((i) => i.closest('.paged-editor__hidden-pm')).length,
      inVisible: imgs.filter((i) => !i.closest('.paged-editor__hidden-pm')).length,
      sample: imgs
        .filter((i) => !i.closest('.paged-editor__hidden-pm'))
        .slice(0, 4)
        .map((i) => ({ w: i.width, h: i.height, parent: i.parentElement?.className || '' })),
    };
  });
  console.log(JSON.stringify(info, null, 2));
  // After fix: SDS body has 2 images, header has 1 image (per page).
  // With multiple pages rendered, expect visible-image count > 2.
  expect(info.inVisible).toBeGreaterThan(2);
});
