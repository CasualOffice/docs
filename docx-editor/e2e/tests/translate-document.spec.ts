import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// Tools → Translate document opens a dedicated dialog with source +
// target language pickers and a "Translate & download" button.
// We don't actually trigger the network round-trip here (Playwright
// runs against the MyMemory public endpoint which is slow/flaky for
// CI); we just assert the entry point and dialog scaffolding.
test('Tools menu carries a Translate document entry', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.newDocument();

  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  const item = page.getByRole('menuitem', { name: /Translate document/i });
  await expect(item).toBeVisible();
  await item.click();

  const dialog = page.getByTestId('translate-document-dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('translate-doc-source')).toBeVisible();
  await expect(page.getByTestId('translate-doc-target')).toBeVisible();
  // Side-by-side preview panes are both mounted (the right pane shows a
  // loading state until the snapshot translation lands).
  await expect(page.getByTestId('translate-doc-preview-source')).toBeVisible();
  await expect(page.getByTestId('translate-doc-preview-target')).toBeVisible();
  await expect(page.getByTestId('translate-doc-export')).toBeVisible();
});
