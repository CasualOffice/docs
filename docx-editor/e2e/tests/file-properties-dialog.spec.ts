/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * File → Properties dialog: read existing OOXML core properties, edit
 * the user-facing fields, apply, and confirm the model carries the
 * edits. End-to-end repack-and-reload is verified by the unit test
 * (`coreProperties.test.ts` + `applyCorePropertiesToXml`); this spec
 * only proves the UI path: parser populates the dialog, the user can
 * type, and Apply pushes the new values onto `doc.package.properties`.
 */

test.describe('File → Properties dialog', () => {
  test('loads existing core properties, edits, and applies', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.loadDocxFile('fixtures/core-properties.docx');
    await page.waitForTimeout(400);

    // Open File menu → Properties.
    await page.getByRole('button', { name: /^File$/ }).click();
    await page.getByText('Properties', { exact: true }).click();

    const dialog = page.getByTestId('file-properties-dialog');
    await expect(dialog).toBeVisible();

    // Existing values come through the parser.
    await expect(page.getByTestId('fp-title')).toHaveValue('Original Title');
    await expect(page.getByTestId('fp-subject')).toHaveValue('Original Subject');
    await expect(page.getByTestId('fp-creator')).toHaveValue('Original Author');
    await expect(page.getByTestId('fp-keywords')).toHaveValue('alpha; beta');
    // Read-only fields show the parsed metadata.
    await expect(page.getByTestId('fp-lastModifiedBy')).toHaveText('Tester');

    // Edit the title and apply.
    const titleInput = page.getByTestId('fp-title');
    await titleInput.fill('Edited Title via Dialog');
    await page.getByTestId('fp-apply').click();
    await expect(dialog).not.toBeVisible();

    // Re-open and verify the value persisted on the live document.
    await page.getByRole('button', { name: /^File$/ }).click();
    await page.getByText('Properties', { exact: true }).click();
    await expect(page.getByTestId('fp-title')).toHaveValue('Edited Title via Dialog');
  });
});
