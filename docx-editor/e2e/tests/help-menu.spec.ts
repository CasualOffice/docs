import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

test.describe('Help menu', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
  });

  test('Help > Report issue opens GitHub issues URL with pre-filled body', async ({ page }) => {
    await page.evaluate(() => {
      (window as unknown as { __lastOpenedUrl?: string }).__lastOpenedUrl = undefined;
      window.open = ((url?: string | URL) => {
        (window as unknown as { __lastOpenedUrl?: string }).__lastOpenedUrl = String(url ?? '');
        return null;
      }) as typeof window.open;
    });

    await page.getByRole('button', { name: 'Help' }).click();
    await page.getByRole('button', { name: 'Report issue' }).click();

    // DocxEditor.handleReportBug dynamically imports report-bug.ts, so
    // window.open fires on a microtask after the click. Wait for the
    // stub to capture the URL instead of reading immediately.
    await page.waitForFunction(
      () => (window as unknown as { __lastOpenedUrl?: string }).__lastOpenedUrl !== undefined,
      { timeout: 5000 }
    );
    const openedUrl = await page.evaluate(
      () => (window as unknown as { __lastOpenedUrl?: string }).__lastOpenedUrl
    );
    expect(openedUrl).toBeDefined();

    const url = new URL(openedUrl!);
    // Help > Report issue points at this fork's tracker via
    // packages/react/src/components/report-bug.ts (the DocxEditor's
    // onReportBug handler dynamic-imports it).
    expect(url.origin + url.pathname).toBe('https://github.com/schnsrw/docx/issues/new');

    // report-bug.ts routes to GitHub's structured issue form (bug.yml)
    // and labels the issue; the pre-fill happens via the form fields,
    // not body text. The env param carries browser + viewport for triage.
    expect(url.searchParams.get('template')).toBe('bug.yml');
    expect(url.searchParams.get('labels')).toBe('bug');
    expect(url.searchParams.get('url')).toBeTruthy();
    const env = url.searchParams.get('env') ?? '';
    expect(env).toContain('viewport');
  });
});
