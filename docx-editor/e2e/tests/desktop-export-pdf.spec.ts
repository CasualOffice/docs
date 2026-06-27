import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * In the desktop shell, "Export as PDF" must route through the host's native
 * webview print-to-PDF (selectable text, reliable on WebKitGTK) instead of the
 * browser print-dialog fallback. We stub a desktop bridge whose exportPdf
 * records calls, and assert the native path is taken and window.open (the
 * print pipeline) is NOT used.
 */
test('desktop Export as PDF routes through the native host, not the print dialog', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __pdfCalls: string[];
      __printOpened: boolean;
      __deskApp__: unknown;
    };
    w.__pdfCalls = [];
    w.__printOpened = false;
    w.__deskApp__ = {
      isDesktop: true,
      filePath: null,
      fileKind: 'docx',
      loadDocument: async () => {
        throw new Error('not used');
      },
      save: async () => null,
      saveAs: async () => null,
      setDirty: () => undefined,
      dismissBoot: () => undefined,
      exportPdf: async (name: string) => {
        w.__pdfCalls.push(name);
        return '/tmp/out.pdf';
      },
    };
    // Harmless stub so a fallback to the print pipeline can't pop an OS dialog,
    // and is detectable.
    window.open = function () {
      w.__printOpened = true;
      return {
        document: { write() {}, close() {} },
        onload: null,
        print() {},
        close() {},
        closed: true,
      } as unknown as Window;
    };
  });

  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/core-properties.docx');
  await page.waitForTimeout(300);

  await page.getByRole('button', { name: /^File$/ }).click();
  await page.getByText('Export as PDF', { exact: true }).click();
  await page.waitForTimeout(150);

  // Routed through the native host with `<doc>.pdf`, and the browser print
  // fallback was NOT used.
  expect(await page.evaluate(() => (window as unknown as { __pdfCalls: string[] }).__pdfCalls)).toEqual(
    ['core-properties.pdf'],
  );
  expect(
    await page.evaluate(() => (window as unknown as { __printOpened: boolean }).__printOpened),
  ).toBe(false);
});
