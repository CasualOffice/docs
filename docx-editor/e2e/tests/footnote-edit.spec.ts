/**
 * Footnote text editing — complete flow incl. round-trip persistence.
 *   double-click a footnote at page bottom → editor opens with its text →
 *   change it → Save → the painted footnote updates live → export & reload →
 *   the new text persisted (footnotes.xml was surgically regenerated).
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';
import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const FN = '[data-testid="docx-editor"] .layout-footnote[data-footnote-id]';
const UNIQUE = 'FN_EDIT_PERSIST_2026';

test('footnote: double-click → edit → save → reload persists', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/demo.docx');
  await page.waitForTimeout(1800);

  const fn = page.locator(FN).first();
  await expect(fn).toBeAttached();
  await fn.scrollIntoViewIfNeeded();
  await fn.dblclick();
  await page.waitForTimeout(300);

  // editor opens with the footnote's current text
  await expect(page.locator('[data-testid="footnote-edit-dialog"]')).toBeVisible();
  const ta = page.locator('[data-testid="footnote-edit-text"]');
  await ta.fill(UNIQUE);
  await page.locator('[data-testid="footnote-edit-apply"]').click();
  await page.waitForTimeout(500);

  // live: the painted footnote now shows the new text
  await expect(page.locator(FN).first()).toContainText(UNIQUE);

  // export → write → reload → assert persisted
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
  const out = join(tmpdir(), `rt-footnote-${Date.now()}.docx`);
  writeFileSync(out, Buffer.from(b64 as string, 'base64'));

  await editor.loadDocxFile(out);
  await page.waitForTimeout(1800);
  await expect(page.locator(FN).first()).toContainText(UNIQUE);
});
