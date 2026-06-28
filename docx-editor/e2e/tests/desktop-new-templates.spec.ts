/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Desktop "New document" should show the editor's template gallery, not a blank
 * page. A file-bound desktop window still boots straight into the document.
 */
import { test, expect } from '@playwright/test';

const deskBridge = (filePath: string | null) => ({
  isDesktop: true,
  filePath,
  fileKind: 'docx',
  loadDocument: async () => {
    throw new Error('not a real file in this test');
  },
  save: async () => null,
  saveAs: async () => null,
  setDirty: () => undefined,
  dismissBoot: () => undefined,
});

test('desktop New (no file) shows the template gallery, not a blank editor', async ({ page }) => {
  await page.addInitScript((b) => {
    (window as unknown as { __deskApp__: unknown }).__deskApp__ = b;
  }, deskBridge(null));

  await page.goto('/?desk=1');

  await expect(page.locator('[data-testid="home-page"]')).toBeVisible();
  await expect(page.locator('[data-testid="docx-editor"]')).toHaveCount(0);
});

test('desktop with a file boots into the document, not the gallery', async ({ page }) => {
  await page.addInitScript((b) => {
    (window as unknown as { __deskApp__: unknown }).__deskApp__ = b;
  }, deskBridge('/tmp/a.docx'));

  await page.goto('/?desk=1&file=/tmp/a.docx');

  // A file-bound desktop window is a document window — it must NOT show the
  // template gallery (it boots into the document instead).
  await page.waitForTimeout(300);
  await expect(page.locator('[data-testid="home-page"]')).toHaveCount(0);
});
