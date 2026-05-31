import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// P2 verification:
// - With no Writing-Assistant feature enabled, the right-click menu
//   does NOT show "Rewrite with AI" / "Summarize with AI".
// - The menu items are gated on `enabledFeatures + phase === 'ready'`
//   so they don't promise an action the controller can't fulfil.
test('AI rewrite/summarize entries are gated on feature ready-state', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.newDocument();
  await editor.typeText('Hello world from the AI test');

  const isMac = await page.evaluate(() => /Mac/.test(navigator.platform));
  await page.keyboard.press(isMac ? 'Meta+a' : 'Control+a');

  const pages = page.locator('.paged-editor__pages').first();
  await pages.click({ button: 'right' });

  // Translate selection is always shown when there's a selection.
  await expect(page.getByRole('menuitem', { name: /Translate selection/i })).toBeVisible();
  // Without enabling Writing Assistant, the AI entries stay hidden.
  await expect(page.getByRole('menuitem', { name: /Rewrite with AI/i })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: /Summarize with AI/i })).toHaveCount(0);
});
