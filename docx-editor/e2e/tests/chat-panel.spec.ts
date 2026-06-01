import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// Chat rail icon opens the panel; without the advanced LLM loaded
// the user sees the gate hint that points them at the Writing
// Assistant sheet (we don't actually load a 880 MB model in tests).
test('rail icon opens chat panel + shows LLM-required hint', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.newDocument();

  await page.getByTestId('rail-chat').click();
  await expect(page.getByTestId('chat-panel')).toBeVisible();
  await expect(page.getByText(/Chat needs the Advanced LLM tier/i)).toBeVisible();
  await expect(page.getByTestId('chat-send')).toBeDisabled();
});
