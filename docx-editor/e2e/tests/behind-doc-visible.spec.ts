/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Regression: "behind text" (behind-doc) anchored objects must render above
 * the page background, not vanish behind it.
 *
 * Each page is painted with an opaque background. Behind-doc shapes/text-boxes
 * are painted at z-index:-1; if no ancestor establishes a stacking context the
 * -1 child escapes to the root's negative layer and paints *behind* the page
 * background, so real content (e.g. the SDS appearance box 外观与性状/状/颜色)
 * silently disappeared. The page now sets `isolation: isolate` to contain it.
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

test.describe('Behind-doc objects render above the page background', () => {
  test('page establishes a stacking context and behind-doc text is visible', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.loadDocxFile('fixtures/sds-real-world.docx');
    await page.waitForSelector('.layout-page', { timeout: 40000 });
    await page.waitForTimeout(1500);

    // The fix: every page isolates so z-index:-1 content stays contained.
    const isolation = await page
      .locator('.layout-page')
      .first()
      .evaluate((el) => getComputedStyle(el).isolation);
    expect(isolation).toBe('isolate');

    // Structural guarantee: the behind-doc appearance-box label lives in a
    // z-index:-1 text-box that is a descendant of the isolated page, so it is
    // contained within the page's stacking context and paints above the page
    // background (rather than escaping to the root's negative layer behind it).
    const contained = await page.evaluate(() => {
      const els = [...document.querySelectorAll('.layout-page *')] as HTMLElement[];
      const label = els.find(
        (e) => e.children.length === 0 && e.textContent?.trim().startsWith('外观') === true
      );
      if (!label) return 'label-not-found';
      // nearest behind-doc (negative z-index) ancestor
      let n: HTMLElement | null = label;
      let behind: HTMLElement | null = null;
      while (n && !n.classList.contains('layout-page')) {
        if (parseInt(getComputedStyle(n).zIndex, 10) < 0) behind = n;
        n = n.parentElement;
      }
      if (!behind) return 'not-behind-doc';
      const page = behind.closest('.layout-page') as HTMLElement | null;
      if (!page) return 'not-in-page';
      return getComputedStyle(page).isolation === 'isolate' ? 'contained' : 'escapes';
    });
    expect(contained).toBe('contained');
  });
});
