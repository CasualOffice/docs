/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Textbox-in-header rendering tests — issue #318 (header edge case)
 *
 * Issue #318 explicitly: "the textbox is only visible in Microsoft Word
 * when editing the header section, but it is not rendered in the editor
 * at all."
 *
 * Body textboxes are handled correctly (see textbox-rendering.spec.ts).
 * The header path needed three changes (issue #318):
 *  1. `enrichParagraphTextBoxes` had to be called in
 *     `parseHeaderFooterContent`, not just `parseBlockContent` for body.
 *     (Lives in the new `textBoxEnricher.ts` so both parsers can share
 *     it without the documentParser/headerFooterParser cycle.)
 *  2. `renderHeaderFooterContent` had to grow a `textBox` case mirroring
 *     the table case (synthesize a `TextBoxFragment` covering the full
 *     block, call `renderTextBoxFragment`, advance `cursorY`).
 *  3. (Already in place upstream: bridge + measure + visual-bounds for
 *     `textBox` blocks in `headerFooterLayout.ts`.)
 *
 * Fixture: `e2e/fixtures/header-with-textbox.docx`, built by
 * `scripts/make-header-textbox-fixture.mjs`. The textbox lives inside
 * `word/header1.xml`. Headers repeat on every page, so the editor
 * renders one container per page.
 *
 * The fixture renders across multiple pages so we assert *at-least-one*
 * rather than an exact count.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

const FIXTURE = 'fixtures/header-with-textbox.docx';

test.describe('Textbox in header — issue #318 (header path)', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.loadDocxFile(FIXTURE);
    await page.waitForTimeout(500); // give the layout-painter a beat after load
  });

  test('header textbox heading appears in painter output', async ({ page }) => {
    // Header content lives outside the body `data-testid="docx-editor"`
    // container — it's painted in per-page header regions. Use page-scoped
    // `getByText` and assert at least one is visible.
    await expect(
      page.getByText('Header Textbox', { exact: true }).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('header textbox body appears in painter output', async ({ page }) => {
    await expect(
      page.getByText('A textbox inside the page header.').first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('at least one .layout-textbox container exists for the header textbox', async ({ page }) => {
    const containers = page.locator('.layout-textbox');
    const count = await containers.count();
    expect(count, 'expected >= 1 header textbox container').toBeGreaterThanOrEqual(1);
  });

  test('every rendered header .layout-textbox is absolutely positioned', async ({ page }) => {
    const containers = page.locator('.layout-textbox');
    const count = await containers.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const pos = await containers.nth(i).evaluate(
        (el) => getComputedStyle(el).position
      );
      expect(pos, `textbox #${i} should be absolutely positioned`).toBe('absolute');
    }
  });
});
