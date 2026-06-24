import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// F2 — File → "Email as attachment". The honest version: trigger the
// .docx download, then open a mailto draft with subject/body pre-filled.
// Browsers can't auto-attach, so the toast tells the user to drag the
// just-downloaded file into the email window.
test.describe('File > Email as attachment', () => {
  test('downloads the .docx and opens a mailto draft', async ({ page, context }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
    await editor.typeText('Just a quick note.');

    // Intercept the mailto open — Playwright surfaces it as a new page
    // (or window.open with the same URL).
    const opened: string[] = [];
    await page.exposeFunction('__captureMailto', (url: string) => {
      opened.push(url);
    });
    await page.evaluate(() => {
      const origOpen = window.open.bind(window);
      window.open = (url?: string | URL, ...rest: unknown[]) => {
        if (typeof url === 'string' && url.startsWith('mailto:')) {
          (window as unknown as { __captureMailto: (u: string) => void }).__captureMailto(url);
          return null;
        }
        return origOpen(url as string, rest[0] as string, rest[1] as string);
      };
    });

    // Trigger File → Email as attachment, asserting a download happens.
    const downloadPromise = context.waitForEvent('page', { timeout: 1500 }).catch(() => null);
    const dlPromise = page.waitForEvent('download', { timeout: 5000 });
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.waitForSelector('[role="menu"]', { state: 'visible', timeout: 4000 });
    await page.getByRole('menuitem', { name: /Email as attachment/ }).click();

    const download = await dlPromise;
    expect(download.suggestedFilename()).toMatch(/\.docx$/i);

    // mailto draft was opened with our prefill.
    await expect.poll(() => opened.length, { timeout: 2000 }).toBeGreaterThan(0);
    const mailto = opened[0]!;
    expect(mailto).toMatch(/^mailto:\?subject=/);
    expect(decodeURIComponent(mailto)).toMatch(/Attached:.*\.docx/);

    void downloadPromise;
  });
});
