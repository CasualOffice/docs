import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * Replace / Replace All must actually change the document. They build a new
 * Document via the Document-model `replaceText` command and push it into the
 * live ProseMirror view as one undoable transaction — previously the change
 * was routed through `handleDocumentChange`, which is the post-transaction
 * echo and never re-seeded the editor, so Replace silently did nothing.
 */
async function openReplace(page: import('@playwright/test').Page) {
  const mod = /Mac/i.test(await page.evaluate(() => navigator.platform)) ? 'Meta' : 'Control';
  await page.keyboard.press(`${mod}+h`);
  await page.locator('[data-testid="find-replace-dialog"]').waitFor({ timeout: 3000 });
  return mod;
}

test('Replace and Replace All change the document; undo restores it', async ({ page }) => {
  const ed = new EditorPage(page);
  await ed.goto();
  await ed.waitForReady();
  await ed.newDocument();
  await ed.focus();
  await ed.typeText('foo boo zoo');
  await page.waitForTimeout(200);

  const mod = await openReplace(page);
  const dlg = page.locator('[data-testid="find-replace-dialog"]');
  await page.locator('[data-testid="find-input"]').fill('oo');
  await page.locator('[data-testid="find-input"]').press('Enter');
  await page.waitForTimeout(300);
  await page.locator('#replace-text').fill('00');
  await page.waitForTimeout(150);

  await dlg.getByRole('button', { name: /^Replace$/ }).click();
  await page.waitForTimeout(400);
  expect((await page.locator('.paged-editor__pages').innerText()).replace(/\s+/g, ' ')).toContain(
    'f00 boo zoo'
  );

  await dlg.getByRole('button', { name: /^Replace All$/ }).click();
  await page.waitForTimeout(400);
  expect((await page.locator('.paged-editor__pages').innerText()).replace(/\s+/g, ' ').trim()).toBe(
    'f00 b00 z00'
  );

  // The Replace All is a single undoable step.
  await ed.focus();
  await page.keyboard.press(`${mod}+z`);
  await page.waitForTimeout(300);
  expect((await page.locator('.paged-editor__pages').innerText()).replace(/\s+/g, ' ')).toContain(
    'f00 boo zoo'
  );
});

test('Replace preserves surrounding formatting', async ({ page }) => {
  const ed = new EditorPage(page);
  await ed.goto();
  await ed.waitForReady();
  await ed.newDocument();
  await ed.focus();
  await ed.typeText('KEEP');
  await page.waitForTimeout(80);
  const mod = /Mac/i.test(await page.evaluate(() => navigator.platform)) ? 'Meta' : 'Control';
  await page.keyboard.press(`${mod}+a`);
  await page.keyboard.press(`${mod}+b`); // bold "KEEP"
  await page.waitForTimeout(100);
  await page.keyboard.press('End');
  await ed.typeText(' replaceme end');
  await page.waitForTimeout(150);

  await openReplace(page);
  const dlg = page.locator('[data-testid="find-replace-dialog"]');
  await page.locator('[data-testid="find-input"]').fill('replaceme');
  await page.locator('[data-testid="find-input"]').press('Enter');
  await page.waitForTimeout(250);
  await page.locator('#replace-text').fill('DONE');
  await page.waitForTimeout(120);
  await dlg.getByRole('button', { name: /^Replace All$/ }).click();
  await page.waitForTimeout(400);

  expect((await page.locator('.paged-editor__pages').innerText()).replace(/\s+/g, ' ')).toContain(
    'KEEP DONE end'
  );
  const keepWeight = await page.evaluate(() => {
    const span = [...document.querySelectorAll('.paged-editor__pages span')].find((s) =>
      s.textContent?.includes('KEEP')
    );
    return span ? getComputedStyle(span).fontWeight : '';
  });
  expect(['bold', '700']).toContain(keepWeight);
});
