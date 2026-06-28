/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * Theme text color round-trip — UI end-to-end.
 *
 * Unit coverage (`theme-color-roundtrip.test.ts`) pins both the XML
 * parse/serialize layer and the PM `toProseDoc` / `fromProseDoc`
 * conversion for the four interesting shapes (rgb-only, themeColor-
 * only, themeColor+tint/shade, auto+themeColor).
 *
 * This spec exercises the full disk path: load a fixture with two
 * runs — one `<w:color w:val="auto" w:themeColor="dk1"/>` (the
 * shape that pre-fix dropped the textColor mark entirely) and one
 * `<w:color w:val="B4C6E7" w:themeColor="accent1" w:themeTint="66"/>`
 * — save, reload, and assert the theme attrs survived on both runs.
 */

interface TextColorAttrs {
  rgb?: string | null;
  themeColor?: string | null;
  themeTint?: string | null;
  themeShade?: string | null;
  auto?: boolean | null;
}

async function readTextColorMarks(
  page: import('@playwright/test').Page
): Promise<Record<string, TextColorAttrs>> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = (window as any).__editorRef?.current;
    if (!handle) return {};
    const view = handle.getEditorRef?.()?.getView?.();
    if (!view) return {};
    const out: Record<string, TextColorAttrs> = {};
    view.state.doc.descendants(
      (node: {
        isText?: boolean;
        text?: string;
        marks: { type: { name: string }; attrs: Record<string, unknown> }[];
      }) => {
        if (!node.isText || !node.text) return;
        for (const mark of node.marks) {
          if (mark.type.name === 'textColor') {
            out[node.text] = mark.attrs as TextColorAttrs;
          }
        }
      }
    );
    return out;
  });
}

test('auto + themeColor and tint+themeColor round-trip through save → reload', async ({
  page,
}) => {
  const editor = new EditorPage(page);
  await page.goto('/?e2e=1');
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/theme-color-auto.docx');
  await page.waitForTimeout(400);

  const before = await readTextColorMarks(page);
  // Pre-save: parser populated both runs.
  expect(before['AUTO-THEMED']).toBeTruthy();
  expect(before['AUTO-THEMED'].themeColor).toBe('dk1');
  expect(before['AUTO-THEMED'].auto).toBe(true);

  expect(before['TINTED-ACCENT']).toBeTruthy();
  expect(before['TINTED-ACCENT'].themeColor).toBe('accent1');
  expect(before['TINTED-ACCENT'].themeTint).toBe('66');
  expect((before['TINTED-ACCENT'].rgb || '').toUpperCase()).toBe('B4C6E7');

  // Save → reload from the produced buffer (re-parses the serialized XML).
  await page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = (window as any).__editorRef?.current;
    const buf: ArrayBuffer = await handle.save();
    await handle.loadDocumentBuffer(buf);
  });
  await page.waitForTimeout(400);

  const after = await readTextColorMarks(page);
  expect(after['AUTO-THEMED']).toBeTruthy();
  expect(after['AUTO-THEMED'].themeColor).toBe('dk1');
  expect(after['AUTO-THEMED'].auto).toBe(true);

  expect(after['TINTED-ACCENT']).toBeTruthy();
  expect(after['TINTED-ACCENT'].themeColor).toBe('accent1');
  expect(after['TINTED-ACCENT'].themeTint).toBe('66');
  expect((after['TINTED-ACCENT'].rgb || '').toUpperCase()).toBe('B4C6E7');
});
