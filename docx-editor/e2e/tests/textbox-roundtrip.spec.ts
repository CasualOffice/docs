/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Round-trip proof for the rawXml-invariant fix: editing an imported text
 * box's box-level properties (fill/outline/size) must PERSIST through a
 * save → reload, not be silently dropped because the original OOXML envelope
 * (rawXml) re-emits verbatim.
 *
 * Imported shapes render as text boxes, so this also covers "shape editability".
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';
import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const BOX = '[data-testid="docx-editor"] .layout-textbox';

test('text box outline edit survives save → reload', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/textbox-test.docx');
  await page.waitForTimeout(1500);

  // Edit: give the first box a thick outline via the Format panel.
  const box = page.locator(BOX).first();
  await box.click({ position: { x: 24, y: 12 } });
  await page.waitForTimeout(400);
  await page.locator('[data-testid="textbox-format-chip"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-testid="properties-textbox-outline-thick"]').click();
  await page.waitForTimeout(500);

  const borderBefore = await page
    .locator(BOX)
    .first()
    .evaluate((el) => parseFloat(getComputedStyle(el as HTMLElement).borderTopWidth || '0'));
  expect(borderBefore).toBeGreaterThanOrEqual(3); // applied in-editor

  // Save to bytes and write to a temp file.
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
  const out = join(tmpdir(), `rt-textbox-${Date.now()}.docx`);
  writeFileSync(out, Buffer.from(b64 as string, 'base64'));

  // Reload the saved file and assert the thick outline persisted.
  await editor.loadDocxFile(out);
  await page.waitForTimeout(1500);
  const borderAfter = await page
    .locator(BOX)
    .first()
    .evaluate((el) => parseFloat(getComputedStyle(el as HTMLElement).borderTopWidth || '0'));
  expect(borderAfter).toBeGreaterThanOrEqual(3); // persisted through round-trip
});
