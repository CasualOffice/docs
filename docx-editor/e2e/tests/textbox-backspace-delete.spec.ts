import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';
const TB = '[data-testid="docx-editor"] .layout-textbox';
test('Backspace in an empty text box deletes it', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.focus();
  await editor.typeText('Body.');
  await page.getByRole('button', { name: 'Insert', exact: true }).click();
  await page.waitForSelector('[role="menu"]', { state: 'visible' });
  await page.getByRole('menuitem', { name: /^Text box$/ }).click();
  await page.waitForTimeout(500);
  expect(await page.locator(TB).count()).toBe(1);
  // caret is inside the new empty box → Backspace deletes it
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(400);
  expect(await page.locator(TB).count()).toBe(0);
});
