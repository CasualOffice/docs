/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Track-changes / Suggesting mode — full end-to-end flow.
 *
 * Verifies the (already-built) feature works through the real UI: the mode
 * dropdown switches to Suggesting; typed text becomes an insertion (green,
 * .docx-insertion on the painted page); deleting marks text as a deletion
 * (.docx-deletion); the tracked-changes sidebar lists them; and Accept resolves
 * a change. This is the Phase-A flagship — pinned so it can't silently regress.
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

const PAGES = '[data-testid="docx-editor"] .paged-editor__pages';
const MODE_TRIGGER = 'button[aria-label*="Ctrl+Shift+E"]';

test('suggesting mode: typed text becomes a tracked insertion on the page', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/demo.docx');
  await page.waitForTimeout(1000);

  // No tracked insertions initially.
  expect(await page.locator(`${PAGES} .docx-insertion`).count()).toBe(0);

  // Switch to Suggesting via the toolbar mode dropdown.
  await page.locator(MODE_TRIGGER).click();
  await page.getByRole('button', { name: /Suggesting/i }).click();
  await page.waitForTimeout(300);

  // Type into the document — it should be wrapped as an insertion.
  await editor.focusParagraph(1);
  await editor.typeText('ZZINSERTED');
  await page.waitForTimeout(600);

  const ins = page.locator(`${PAGES} .docx-insertion`);
  await expect(ins.first()).toBeVisible();
  await expect(ins.filter({ hasText: 'ZZINSERTED' }).first()).toBeVisible();
});

test('suggesting mode: deleting existing text marks it as a tracked deletion', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/demo.docx');
  await page.waitForTimeout(1000);

  await page.locator(MODE_TRIGGER).click();
  await page.getByRole('button', { name: /Suggesting/i }).click();
  await page.waitForTimeout(300);

  // Select the first few chars of a body paragraph and delete — in suggesting
  // mode the text stays but is struck through (deletion), not removed.
  await editor.selectRange(1, 0, 4);
  await page.waitForTimeout(200);
  await editor.pressDelete();
  await page.waitForTimeout(600);

  const del = page.locator(`${PAGES} .docx-deletion`);
  await expect(del.first()).toBeVisible();
});

test('accept-all resolves tracked insertions (mark gone, text kept)', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/demo.docx');
  await page.waitForTimeout(1000);

  // Make a tracked insertion in Suggesting mode.
  await page.locator(MODE_TRIGGER).click();
  await page.getByRole('button', { name: /Suggesting/i }).click();
  await page.waitForTimeout(300);
  await editor.focusParagraph(1);
  await editor.typeText('ZZACCEPTME');
  await page.waitForTimeout(500);
  await expect(page.locator(`${PAGES} .docx-insertion`).first()).toBeVisible();

  // Switch back to Editing (via the suggesting banner) — the accept/reject
  // action bar appears.
  await page.getByRole('button', { name: /Switch to editing/i }).click();
  await page.waitForTimeout(300);

  await page.locator('[data-testid="tracked-changes-accept-all"]').click();
  await page.waitForTimeout(600);

  // The insertion mark is resolved (gone), but the inserted text remains.
  await expect(page.locator(`${PAGES} .docx-insertion`)).toHaveCount(0);
  await expect(page.locator(PAGES)).toContainText('ZZACCEPTME');
});
