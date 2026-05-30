import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// The Word count dialog now mirrors the status bar's reading-time
// estimate so the two stay in sync.
test('Word count dialog includes the reading-time row', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.newDocument();
  await editor.focus();
  await editor.typeText('A short note for the reading-time row.');

  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await page.waitForSelector('[role="menu"]', { state: 'visible', timeout: 4000 });
  await page.getByRole('menuitem', { name: /Word count/ }).click();

  const dlg = page.getByRole('dialog', { name: /Word count/i });
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText(/Reading time/);
  await expect(dlg).toContainText(/~1 min/);
});
