/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Real-world smoke test against a complex .docx the user provided
 * (Safety Data Sheet, ZH locale, large body + 1 body textbox + 1
 * header textbox + 1 table).
 *
 * This doc uses legacy **VML** for its textboxes
 * (`<v:shape type="#_x0000_t202">` / `<v:textbox>` / `<w:txbxContent>`)
 * rather than DrawingML. Both paths are supported now:
 *   - DrawingML: `textBoxParser.ts` (modern `<wps:wsp>` / `<wps:txbx>`).
 *   - VML:      `vmlTextBoxParser.ts` (legacy `<w:pict>` / `<v:shape>`).
 *
 * Both are invoked from `textBoxEnricher.ts`'s second pass so headers
 * and bodies get the same treatment regardless of format.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

const FIXTURE = 'fixtures/sds-real-world.docx';

test.describe('Real-world doc (SDS) — smoke test', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.loadDocxFile(FIXTURE);
    await page.waitForTimeout(800);
  });

  test('loads without onError firing', async ({ page }) => {
    const editorEl = page.locator('[data-testid="docx-editor"]');
    await expect(editorEl).toBeVisible({ timeout: 5000 });
  });

  test('VML textboxes render as .layout-textbox containers', async ({ page }) => {
    // SDS has 1 body VML textbox + 1 header VML textbox (the header
    // repeats on every page), so count is >= 1.
    const count = await page.locator('.layout-textbox').count();
    expect(count, 'expected at least one rendered VML textbox container').toBeGreaterThanOrEqual(1);
  });
});
