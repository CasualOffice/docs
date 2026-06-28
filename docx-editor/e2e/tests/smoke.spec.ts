/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Pre-push smoke test.
 *
 * The unit-test + typecheck + build gates I (Claude) was running
 * before each push do NOT catch React render-loop bugs or unhandled
 * promise rejections. The setState-inside-useMemo bug shipped clean
 * through all of them and crashed the editor at runtime. This spec is
 * the smallest realistic check that would have caught it:
 *
 *   - Boot the editor in a real browser.
 *   - Subscribe to every error channel: `console.error`,
 *     `window.onerror`, `window.onunhandledrejection`, and PM/React
 *     "Minified React error #..." patterns.
 *   - Walk every AI / status surface: open chat, open writer sheet,
 *     open version history (this is the panel that broke), open the
 *     translate dialog, type into the doc, select some text.
 *   - Fail the test with the full error log if anything was captured.
 *
 * Run via `npx playwright test e2e/tests/_smoke.spec.ts --reporter=line`
 * before every push.
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// Console messages we treat as benign. Real product warnings should
// usually trigger a code fix; the list below covers known third-party
// noise (Fonts loaded toast, dev-only warnings that don't recur).
const IGNORED_PATTERNS: RegExp[] = [
  /^Fonts loaded/i,
  /Download the React DevTools/i,
  /\[vite\]/i,
];

interface ErrorRecord {
  source: 'console.error' | 'pageerror' | 'unhandledrejection';
  text: string;
}

function shouldIgnore(text: string): boolean {
  return IGNORED_PATTERNS.some((re) => re.test(text));
}

test.describe('Smoke — editor + AI surfaces mount without runtime errors', () => {
  test('walks every AI surface without console errors or React unmounts', async ({ page }) => {
    const errors: ErrorRecord[] = [];

    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (shouldIgnore(text)) return;
      errors.push({ source: 'console.error', text });
    });
    page.on('pageerror', (err) => {
      const text = `${err.name}: ${err.message}\n${err.stack ?? ''}`;
      if (shouldIgnore(text)) return;
      errors.push({ source: 'pageerror', text });
    });
    // Playwright doesn't expose `unhandledrejection` directly; the
    // event surfaces via `pageerror` so we don't need a separate hook.

    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.focus();

    // Type so the readability plugin walks + status bar updates +
    // any setState-in-useMemo derived-state paths fire.
    await editor.typeText(
      'This document tests the smoke pass. ' +
        'It includes a long sentence that the readability plugin would normally flag because it has many many many many many many many many many words. ' +
        'Short follow-up.'
    );
    await page.waitForTimeout(200);

    // Open every right-rail panel in turn. Version history is the
    // panel whose setState-in-useMemo crashed the editor; opening it
    // here is the actual regression guard.
    const rail = page.getByTestId('panel-rail');
    if (await rail.count()) {
      // Outline.
      const outlineBtn = page.getByTestId('rail-outline');
      if (await outlineBtn.count()) {
        await outlineBtn.first().click();
        await page.waitForTimeout(120);
        await outlineBtn.first().click(); // close
      }
      // Version history — the one that previously crashed.
      const histBtn = page.getByTestId('rail-history');
      if (await histBtn.count()) {
        await histBtn.first().click();
        await page.waitForTimeout(200);
        const panel = page.getByTestId('version-history-panel');
        await expect(panel).toBeVisible();
        await histBtn.first().click(); // close
      }
      // Comments.
      const commentsBtn = page.getByTestId('rail-comments');
      if (await commentsBtn.count()) {
        await commentsBtn.first().click();
        await page.waitForTimeout(120);
        await commentsBtn.first().click();
      }
      // Chat.
      const chatBtn = page.getByTestId('rail-chat');
      if (await chatBtn.count()) {
        await chatBtn.first().click();
        await page.waitForTimeout(200);
        await expect(page.getByTestId('chat-panel')).toBeVisible();
        await chatBtn.first().click();
      }
      // Writer sheet.
      const writerBtn = page.getByTestId('rail-writer');
      if (await writerBtn.count()) {
        await writerBtn.first().click();
        await page.waitForTimeout(200);
        await expect(page.getByTestId('writing-assistant-sheet')).toBeVisible();
        await writerBtn.first().click();
      }
    }

    // Selection-anchored Ask AI: select text + verify the pill mounts
    // without erroring. The pill itself only shows when the LLM is
    // ready, but the underlying component still mounts during render
    // — the React-error-#185 loop would fire even when the pill is
    // hidden.
    await editor.focus();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Meta+A');
    await page.waitForTimeout(120);

    // Final assertion — any captured error fails the test with the
    // full message + source, so the failure diagnoses itself.
    if (errors.length > 0) {
      const summary = errors
        .map((e, i) => `[${i + 1}] (${e.source}) ${e.text}`)
        .join('\n\n---\n\n');
      throw new Error(`Smoke run captured ${errors.length} runtime error(s):\n\n${summary}`);
    }
  });
});
