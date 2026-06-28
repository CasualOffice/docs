/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Desktop in-window open safety.
 *
 * File → Open inside the editor loads a browser-picked file in place. A browser
 * File has no real filesystem path, so the window must NOT stay bound to the
 * previously-open file — otherwise the next Save would overwrite that file with
 * the newly-opened content. The editor now fires `onFileOpened`, which the
 * desktop host uses to unbind the path (Save then prompts for a location).
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

test('opening a file in-window unbinds the previous desktop file path', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __deskApp__: unknown }).__deskApp__ = {
      isDesktop: true,
      filePath: null,
      fileKind: 'docx',
      loadDocument: async () => {
        throw new Error('not used');
      },
      save: async () => null,
      saveAs: async () => null,
      setDirty: () => undefined,
      dismissBoot: () => undefined,
    };
  });

  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();

  // Simulate a window already bound to a file on disk.
  await page.evaluate(() => {
    (window as unknown as { __deskApp__: { filePath: string | null } }).__deskApp__.filePath =
      '/tmp/original.docx';
  });
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __deskApp__: { filePath: string | null } }).__deskApp__.filePath,
    ),
  ).toBe('/tmp/original.docx');

  // Open a different file in-window via File → Open (sets the hidden input).
  await editor.loadDocxFile('fixtures/demo/demo.docx');

  // The bound path must be cleared so a later Save can't overwrite original.docx.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __deskApp__: { filePath: string | null } }).__deskApp__.filePath,
      ),
    )
    .toBeNull();
});
