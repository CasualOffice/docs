/**
 * Desktop parse-failure safety.
 *
 * When the opened file can't be read/parsed, the app used to fall back to a
 * blank EDITABLE document still bound to the source path — so a single Ctrl+S
 * would overwrite the (merely unreadable) original with empty content. It now
 * shows a read-only error surface and unbinds the path, so no Save can land.
 *
 * Stubs a desktop bridge whose loadDocument throws and asserts the error
 * surface renders while the editor never mounts.
 */
import { test, expect } from '@playwright/test';

test('a file that fails to parse shows a read-only error, not a blank editable doc', async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as unknown as { __deskApp__: unknown }).__deskApp__ = {
      isDesktop: true,
      filePath: '/tmp/broken.docx',
      fileKind: 'docx',
      loadDocument: async () => {
        throw new Error("This file doesn't look like a valid .docx.");
      },
      loadText: async () => {
        throw new Error('not used');
      },
      save: async () => null,
      saveAs: async () => null,
      setDirty: () => undefined,
      dismissBoot: () => undefined,
    };
  });

  // ?e2e=1 forces the editor view; the stubbed bridge makes it the desktop path.
  await page.goto('/?e2e=1');

  const errorSurface = page.locator('[data-testid="load-error"]');
  await expect(errorSurface).toBeVisible();
  await expect(errorSurface).toContainText('broken.docx');

  // Critical: no editable editor mounted, so there is no Save path to overwrite
  // the original file.
  await expect(page.locator('[data-testid="docx-editor"]')).toHaveCount(0);
});
