/**
 * E2E coverage for scrollToPage(n) and getTotalPages() (issue #280).
 * Uses the multi-page paraid-test.docx fixture.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';
import { waitPageShellInViewport } from '../helpers/wait-in-viewport';
import * as path from 'path';

test.describe('scrollToPage / getTotalPages (issue #280)', () => {
  test.beforeEach(async ({ page }) => {
    // Loading the ~50-page, 1 MB fixture and laying it out is genuinely slow
    // on constrained CI runners (2 vCPU); the default 30 s test budget gets
    // eaten by load + layout before the scroll wait can finish. Triple it so
    // the in-viewport wait has room rather than racing the test timeout.
    test.slow();
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    // `paraid-test.docx` was an old long-doc fixture in `screenshots/`
    // that never got committed; reuse the in-tree multi-page fixture
    // `issue-68-large.docx` (1 MB, ~50 pages) which exercises the same
    // page-jump behaviour.
    const docPath = path.resolve(process.cwd(), 'e2e/fixtures/issue-68-large.docx');
    await editor.loadDocxFile(docPath);
    await page.waitForFunction(() => (window.__DOCX_EDITOR_E2E__?.getTotalPages() ?? 0) > 1, {
      timeout: 10000,
    });
    // getTotalPages reflects the layout calculation, but the .layout-page
    // shells render asynchronously after that. scrollToPage(n) is a no-op
    // until shell n exists in the DOM, which on CI sometimes lags the
    // total-pages signal by a few hundred ms — wait for at least two shells
    // so the first scroll target is present before the test acts.
    await page.waitForFunction(
      () => document.querySelectorAll('.layout-page').length >= 2,
      { timeout: 10000 }
    );
  });

  test('getTotalPages reports the layout page count (>1) without scrolling', async ({ page }) => {
    const total = await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.getTotalPages() ?? 0);
    // paraid-test.docx is intentionally long; multi-page is the whole point.
    expect(total).toBeGreaterThan(1);
  });

  test('scrollToPage(2) brings the second page into the viewport', async ({ page }) => {
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.scrollToPage(2));
    await waitPageShellInViewport(page, 2);
  });

  test('scrollToPage(N) brings the last page into the viewport', async ({ page }) => {
    const total = await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.getTotalPages() ?? 0);
    expect(total).toBeGreaterThan(2);
    await page.evaluate((n) => window.__DOCX_EDITOR_E2E__?.scrollToPage(n), total);
    await waitPageShellInViewport(page, total, 25000);
  });

  test('scrollToPage with out-of-range / invalid input is a no-op (no crash)', async ({ page }) => {
    for (const bad of [-1, 0, 999, 1.5]) {
      await page.evaluate((n) => window.__DOCX_EDITOR_E2E__?.scrollToPage(n), bad);
    }
    await page.evaluate(() => window.__DOCX_EDITOR_E2E__?.scrollToPage(2));
    await waitPageShellInViewport(page, 2);
  });
});
