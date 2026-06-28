/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Resolve the Mod modifier (Meta on Mac, Control elsewhere) the way the
 * editor itself does — via the page's `navigator.platform`, NOT via
 * Node's `process.platform`. Playwright Chromium reports `Win32` even
 * on a macOS host, so a host-side check picks Meta but the page sends
 * a Control-keyed event, and the test silently misses keymap-bound
 * shortcuts (Mod-e, Mod-z, etc.). Detailed write-up in the
 * `feedback-playwright-platform-detection` memory.
 *
 * Usage:
 *
 *     const mod = await modifierKey(page);
 *     await page.keyboard.press(`${mod}+e`);
 */
import type { Page } from '@playwright/test';

let cached: Promise<'Meta' | 'Control'> | undefined;

export async function modifierKey(page: Page): Promise<'Meta' | 'Control'> {
  if (!cached) {
    cached = page
      .evaluate(() => navigator.platform.toUpperCase().includes('MAC'))
      .then((isMac) => (isMac ? 'Meta' : 'Control'));
  }
  return cached;
}
