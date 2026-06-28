/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Textbox rendering tests — issue #318
 *
 * Fixture `e2e/fixtures/textbox-test.docx` contains nine textboxes
 * (`wps:txbx` inside `w:drawing`) with distinctive headings/bodies, plus
 * a regular paragraph between them.
 *
 * The dual-rendering system (CLAUDE.md: hidden ProseMirror + visible
 * layout-painter) means content can appear in DOM twice — once in the
 * offscreen PM tree, once in the painter output. Tests scope to the
 * painter via the `docx-editor` testid to avoid strict-mode collisions.
 *
 * What we assert:
 *  - Painter renders textbox CONTENT (text strings appear).
 *  - Painter renders a `.layout-textbox` container per textbox
 *    (`packages/core/src/layout-painter/renderTextBox.ts` ⇒
 *     `<div class="layout-textbox">` with absolute positioning, fill, border).
 *
 * The first batch ("content presence") should pass — the bug isn't
 * "content missing from DOM."
 * The second batch ("container divs") is the real fidelity gap — if
 * `.layout-textbox` count is below 7, the layout-bridge / layout-engine
 * isn't producing TextBoxFragments for the parsed textboxes.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

const FIXTURE = 'fixtures/textbox-test.docx';
const EDITOR = 'docx-editor';
const EXPECTED_TEXTBOX_COUNT = 9;

test.describe('Textbox rendering — content presence (issue #318)', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.loadDocxFile(FIXTURE);
  });

  test('regular paragraph between textboxes renders (sanity)', async ({ page }) => {
    await expect(
      page.getByTestId(EDITOR).getByText(/regular paragraph between text boxes/i)
    ).toBeVisible({ timeout: 5000 });
  });

  test('"Simple Text Box" heading is in painter output', async ({ page }) => {
    await expect(
      page.getByTestId(EDITOR).getByText('Simple Text Box', { exact: true })
    ).toBeVisible({ timeout: 5000 });
  });

  test('"Blue Info Box" heading is in painter output', async ({ page }) => {
    await expect(
      page.getByTestId(EDITOR).getByText('Blue Info Box', { exact: true })
    ).toBeVisible({ timeout: 5000 });
  });

  test('"Warning:" heading is in painter output', async ({ page }) => {
    await expect(
      page.getByTestId(EDITOR).getByText('Warning:')
    ).toBeVisible({ timeout: 5000 });
  });

  test('"Purple Box" heading is in painter output', async ({ page }) => {
    await expect(
      page.getByTestId(EDITOR).getByText('Purple Box', { exact: true })
    ).toBeVisible({ timeout: 5000 });
  });

  test('first-textbox body text is in painter output', async ({ page }) => {
    await expect(
      page.getByTestId(EDITOR).getByText(
        'This is a basic text box with a thin black border.'
      )
    ).toBeVisible({ timeout: 5000 });
  });

  test('green-fill textbox body text is in painter output', async ({ page }) => {
    await expect(
      page
        .getByTestId(EDITOR)
        .getByText(/no border, just a green background fill/i)
    ).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Textbox rendering — visual containers (issue #318, real gap)', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.loadDocxFile(FIXTURE);
    // Give layout-painter a moment after fixture load.
    await page.waitForTimeout(500);
  });

  test(`renders ${EXPECTED_TEXTBOX_COUNT} .layout-textbox containers`, async ({ page }) => {
    const containers = page.locator('.layout-textbox');
    await expect(containers).toHaveCount(EXPECTED_TEXTBOX_COUNT, { timeout: 5000 });
  });

  test('every .layout-textbox is absolutely positioned (per renderTextBox.ts)', async ({ page }) => {
    const containers = page.locator('.layout-textbox');
    const count = await containers.count();
    expect(count).toBeGreaterThan(0); // pre-check; covered above too
    for (let i = 0; i < count; i++) {
      const position = await containers.nth(i).evaluate(
        (el) => getComputedStyle(el).position
      );
      expect(position, `textbox #${i} should be absolutely positioned`).toBe('absolute');
    }
  });

  test('the bordered textbox container has a non-zero border', async ({ page }) => {
    // The first textbox in the fixture has "a thin black border."
    const bordered = page.locator('.layout-textbox', {
      hasText: 'This is a basic text box with a thin black border.',
    });
    await expect(bordered).toHaveCount(1, { timeout: 5000 });
    const borderWidth = await bordered.first().evaluate((el) => {
      const cs = getComputedStyle(el);
      return parseFloat(cs.borderTopWidth);
    });
    expect(borderWidth, 'bordered textbox should have a top border > 0').toBeGreaterThan(0);
  });
});
