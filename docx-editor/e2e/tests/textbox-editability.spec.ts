/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Textbox EDITABILITY (not rendering) — P1.
 *
 * Rendering of textboxes is covered by textbox-rendering.spec.ts. This
 * asserts the user can actually EDIT them: clicking inside a painted
 * textbox must land the caret INSIDE the textbox's content so typing
 * edits the textbox (not the body behind it).
 *
 * Fixture: 9 textboxes (`wps:txbx`). We scope to the painter via the
 * `docx-editor` testid to avoid the dual-render DOM collision.
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

const FIXTURE = 'fixtures/textbox-test.docx';
const TB = '[data-testid="docx-editor"] .layout-textbox';

test.describe('Textbox editability — click to enter + type', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.loadDocxFile(FIXTURE);
    await page.waitForSelector(TB, { timeout: 15000 });
  });

  test('clicking a textbox lands the caret inside it so typing edits the textbox', async ({
    page,
  }) => {
    const tb = page.locator(TB).first();
    const box = await tb.boundingBox();
    if (!box) throw new Error('no textbox bounding box');

    // Click near the top of the textbox where its first line of text sits.
    await page.mouse.click(box.x + box.width / 2, box.y + Math.min(16, box.height / 2));
    await page.waitForTimeout(150);
    await page.keyboard.type('ZZZ');
    await page.waitForTimeout(450);

    const after = (await tb.innerText()).trim();
    expect(after).toContain('ZZZ');
  });
});
