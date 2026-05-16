import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * Export as PDF reuses the print pipeline — browsers' print dialog
 * includes "Save as PDF" as a destination and uses the print window's
 * `<title>` as the default filename. We can't intercept the OS print
 * dialog from Playwright, so this spec stubs `window.open` to capture
 * the document the editor writes into the print window. We assert:
 *   1. The menu entry is reachable from the File menu.
 *   2. The print-window title equals the current document name (so the
 *      saved PDF defaults to `<doc>.pdf`, not `Print.pdf`).
 *   3. The print window contains at least one `.layout-page` clone.
 */

test.describe('Export as PDF', () => {
  test('opens print window titled with document name', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.loadDocxFile('fixtures/core-properties.docx');
    await page.waitForTimeout(400);

    // Capture what the editor would have written to the print window
    // and short-circuit window.open + print so the test doesn't pop
    // OS-level dialogs.
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      w.__capturedPrintHtml = null as string | null;
      const origOpen = window.open;
      w.__origOpen = origOpen;
      window.open = function (..._args: unknown[]) {
        let buffer = '';
        const stub = {
          document: {
            write(s: string) {
              buffer += s;
            },
            close() {
              w.__capturedPrintHtml = buffer;
            },
          },
          onload: null as (() => void) | null,
          print() {
            /* no-op */
          },
          close() {
            /* no-op */
          },
          closed: true,
        };
        // Allow tests to inspect title without the print actually firing.
        return stub as unknown as Window;
      };
    });

    await page.getByRole('button', { name: /^File$/ }).click();
    await page.getByText('Export as PDF', { exact: true }).click();
    await page.waitForTimeout(150);

    const captured = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any).__capturedPrintHtml as string | null;
    });

    expect(captured).toBeTruthy();
    // The example app sets documentName from the loaded file —
    // `core-properties.docx` → "core-properties". The export-pdf flow
    // strips a trailing `.docx` and uses the remainder as the title.
    expect(captured!).toContain('<title>core-properties</title>');
    expect(captured!).toContain('class="layout-page"');
  });
});
