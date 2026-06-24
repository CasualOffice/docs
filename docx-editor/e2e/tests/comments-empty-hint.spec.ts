import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// Clicking the rail's Comments toggle on an empty doc used to flip
// `aria-pressed` with nothing else visible — looks broken. Now it
// surfaces a toast hint pointing the user at "Add comment".
test('Comments rail toggle on an empty doc surfaces a toast hint', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.newDocument();

  await page.getByTestId('rail-comments').click();

  // Sonner renders toasts in a [data-sonner-toast] / [data-sonner-toaster]
  // container; matching the message text is enough.
  const toast = page.getByText('No comments yet', { exact: false });
  await expect(toast).toBeVisible();
});
