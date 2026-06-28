import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * Shift+Click extends the selection from the existing anchor to the clicked
 * point (a fundamental selection gesture). Previously the painted-layer
 * mousedown handler always collapsed the selection to the click, ignoring
 * the Shift modifier.
 */
test('Shift+Click extends the selection to the click point', async ({ page }) => {
  const ed = new EditorPage(page);
  await ed.goto();
  await ed.waitForReady();
  await ed.newDocument();
  await ed.focus();
  await ed.typeText('AAAA BBBB CCCC DDDD');
  await page.waitForTimeout(200);

  const span = page.locator('.layout-page-content span', { hasText: 'AAAA' }).first();
  const box = await span.boundingBox();
  if (!box) throw new Error('no span box');

  // Place the cursor at the very start.
  await page.mouse.click(box.x + 2, box.y + box.height / 2);
  await page.waitForTimeout(120);

  // Shift+Click partway through CCCC → selection from start to that point.
  await page.keyboard.down('Shift');
  await page.mouse.click(box.x + box.width * 0.62, box.y + box.height / 2);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(150);

  // Typing replaces the selection — the left chunk is gone.
  await ed.typeText('X');
  await page.waitForTimeout(150);
  const body = (await page.locator('.paged-editor__pages').innerText()).trim();
  expect(body.startsWith('X')).toBe(true);
  expect(body).not.toContain('AAAA');
  expect(body).toContain('DDDD');
});

test('a plain click still just places the cursor (no extend)', async ({ page }) => {
  const ed = new EditorPage(page);
  await ed.goto();
  await ed.waitForReady();
  await ed.newDocument();
  await ed.focus();
  await ed.typeText('one two three');
  await page.waitForTimeout(200);

  const span = page.locator('.layout-page-content span', { hasText: 'one' }).first();
  const box = await span.boundingBox();
  if (!box) throw new Error('no span box');
  // Click near the start, then type — inserts there, nothing replaced.
  await page.mouse.click(box.x + 2, box.y + box.height / 2);
  await page.waitForTimeout(120);
  await ed.typeText('Z');
  await page.waitForTimeout(150);
  const body = (await page.locator('.paged-editor__pages').innerText()).trim();
  expect(body).toContain('two three');
  expect(body).toMatch(/Z/);
});
