/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Endnote text editing — render + edit + round-trip persistence. Endnotes are
 * now rendered at document end; double-click → editor → change → save → reload
 * persists (endnotes.xml surgically regenerated).
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';
import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const EN = '[data-testid="docx-editor"] .layout-endnote[data-endnote-id]';
const UNIQUE = 'EN_EDIT_PERSIST_2026';

test('endnote: renders at doc end → edit → save → reload persists', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/demo.docx');
  await page.waitForTimeout(1800);

  // the endnote section renders
  await expect(page.locator('[data-testid="endnote-section"]')).toBeAttached();
  const en = page.locator(EN).first();
  await expect(en).toBeAttached();
  await en.scrollIntoViewIfNeeded();
  await en.dblclick();
  await page.waitForTimeout(300);

  await expect(page.locator('[data-testid="footnote-edit-dialog"]')).toBeVisible();
  await page.locator('[data-testid="footnote-edit-text"]').fill(UNIQUE);
  await page.locator('[data-testid="footnote-edit-apply"]').click();
  await page.waitForTimeout(500);

  // live update
  await expect(page.locator(EN).first()).toContainText(UNIQUE);

  // export → reload → persisted
  const b64 = await page.evaluate(async () => {
    // @ts-expect-error e2e hook
    const buf: ArrayBuffer | null = await window.__editorRef?.current?.exportDocx?.();
    if (!buf) return null;
    let bin = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  });
  expect(b64).toBeTruthy();
  const out = join(tmpdir(), `rt-endnote-${Date.now()}.docx`);
  writeFileSync(out, Buffer.from(b64 as string, 'base64'));

  await editor.loadDocxFile(out);
  await page.waitForTimeout(1800);
  await expect(page.locator(EN).first()).toContainText(UNIQUE);
});
