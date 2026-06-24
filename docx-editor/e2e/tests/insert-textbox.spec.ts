import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

const TB = '[data-testid="docx-editor"] .layout-textbox';

test('Insert → Text box adds an editable text box', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.focus();
  await editor.typeText('Body paragraph.');
  await page.waitForTimeout(300);

  const before = await page.locator(TB).count();

  await page.getByRole('button', { name: 'Insert', exact: true }).click();
  await page.waitForSelector('[role="menu"]', { state: 'visible', timeout: 4000 });
  await page.getByRole('menuitem', { name: /^Text box$/ }).click();
  await page.waitForTimeout(600);

  const after = await page.locator(TB).count();
  expect(after).toBe(before + 1);

  await page.keyboard.type('HELLO_TB');
  await page.waitForTimeout(400);
  const txt = (await page.locator(TB).last().innerText()).trim();
  expect(txt).toContain('HELLO_TB');
});
