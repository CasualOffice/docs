/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * GH #321 — Cmd+F finds matches but doesn't scroll to them.
 *
 * `scrollToMatch` in `findReplaceUtils.ts` used to query for
 * `[data-paragraph-index="..."]` — the painter never emits that
 * attribute, so the scroll was a silent no-op. The fix walks visible
 * `.layout-paragraph` elements (skipping HF / tables / hidden PM),
 * dedupes by `data-block-id` for paginated paragraphs, and picks the
 * Nth one — matching the paragraph-ordinal that `findInDocument`
 * assigns to each match.
 *
 * Test: build a long body of placeholder paragraphs with a unique
 * canary deep in the document. Open Find, search for the canary,
 * assert the editor scrolled enough that the canary paragraph's
 * bounding rect lands inside the visible scroll container.
 */

test('Cmd+F scrolls the editor to the matched paragraph', async ({ page }) => {
  const editor = new EditorPage(page);
  await page.goto('/?e2e=1');
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/find-scroll.docx');
  await page.waitForTimeout(800);

  // Scroll back to top so the canary is below the viewport.
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = (window as any).__editorRef?.current;
    handle?.scrollToPage?.(1);
    window.scrollTo({ top: 0 });
  });
  await page.waitForTimeout(200);

  // Confirm canary is currently off-screen.
  const before = await page.evaluate(() => {
    const paras = Array.from(
      document.querySelectorAll<HTMLElement>('.layout-paragraph')
    ).filter((el) => !el.closest('.paged-editor__hidden-pm'));
    const canary = paras.find((p) => p.textContent?.includes('CANARY-TARGET-PARAGRAPH'));
    if (!canary) return { found: false } as const;
    const rect = canary.getBoundingClientRect();
    return {
      found: true,
      onScreenBefore: rect.top >= 0 && rect.bottom <= window.innerHeight,
      topBefore: rect.top,
    };
  });
  expect(before.found).toBe(true);
  // The fixture is long enough that the canary should be off-screen.
  expect(before.onScreenBefore).toBe(false);

  // Focus the editor so the Cmd+F shortcut fires.
  await editor.focus();
  await page.waitForTimeout(100);
  await editor.openFind();
  await editor.find('CANARY-TARGET-PARAGRAPH');
  await page.waitForTimeout(700); // smooth scroll completes

  // After the search runs, the canary should be in view.
  const after = await page.evaluate(() => {
    const paras = Array.from(
      document.querySelectorAll<HTMLElement>('.layout-paragraph')
    ).filter((el) => !el.closest('.paged-editor__hidden-pm'));
    const canary = paras.find((p) => p.textContent?.includes('CANARY-TARGET-PARAGRAPH'));
    if (!canary) return { found: false } as const;
    const rect = canary.getBoundingClientRect();
    return {
      found: true,
      onScreenAfter: rect.top >= 0 && rect.bottom <= window.innerHeight,
      topAfter: rect.top,
    };
  });
  expect(after.found).toBe(true);
  expect(after.onScreenAfter, 'canary should be visible after Cmd+F').toBe(true);
});
