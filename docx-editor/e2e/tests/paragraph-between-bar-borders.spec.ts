/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * w:pBdr/w:between + w:pBdr/w:bar — openspec
 * `paragraph-border-rendering`.
 *
 * `w:between` paints a horizontal rule between two adjacent paragraphs
 * that share an identical `between` border (per ECMA-376 §17.3.1.2).
 * `w:bar` paints a vertical bar in the left margin area of the paragraph
 * (§17.3.1.5). Both were historically dropped silently; the audit
 * found every layer (parse → PM round-trip → layout-bridge →
 * renderer → serializer) now carries them.
 *
 * This spec pins the behavior so it doesn't regress:
 *   1. Load a fixture with two adjacent paragraphs carrying matching
 *      `between` + `bar`, then a plain paragraph.
 *   2. Assert the PM doc carries `between` + `bar` on the two styled
 *      paragraphs and neither on the plain one.
 *   3. Save → reload from the produced buffer; assert both survive.
 */

interface BorderSpec {
  style?: string;
  size?: number;
  color?: { rgb?: string } | string;
}

async function readParagraphBorders(
  page: import('@playwright/test').Page
): Promise<Array<{ text: string; between?: BorderSpec; bar?: BorderSpec }>> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = (window as any).__editorRef?.current;
    if (!handle) return [];
    const view = handle.getEditorRef?.()?.getView?.();
    if (!view) return [];
    const out: Array<{ text: string; between?: unknown; bar?: unknown }> = [];
    view.state.doc.descendants(
      (node: { type: { name: string }; attrs: Record<string, unknown>; textContent: string }) => {
        if (node.type.name !== 'paragraph') return;
        const borders = node.attrs.borders as { between?: unknown; bar?: unknown } | null;
        out.push({
          text: node.textContent,
          between: borders?.between,
          bar: borders?.bar,
        });
      }
    );
    return out;
  });
}

test('w:between + w:bar paragraph borders survive load and save → reload', async ({ page }) => {
  const editor = new EditorPage(page);
  await page.goto('/?e2e=1');
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/between-bar-borders.docx');
  await page.waitForTimeout(400);

  const before = await readParagraphBorders(page);

  // Find the three canary paragraphs by text. Order may include
  // editor-added trailing paragraphs.
  const a = before.find((p) => p.text === 'BETWEEN-A');
  const b = before.find((p) => p.text === 'BETWEEN-B');
  const plain = before.find((p) => p.text === 'PLAIN-TAIL');
  expect(a, 'BETWEEN-A paragraph').toBeTruthy();
  expect(b, 'BETWEEN-B paragraph').toBeTruthy();
  expect(plain, 'PLAIN-TAIL paragraph').toBeTruthy();

  // Styled paragraphs carry both borders.
  expect(a!.between).toBeTruthy();
  expect(a!.bar).toBeTruthy();
  expect(b!.between).toBeTruthy();
  expect(b!.bar).toBeTruthy();
  // Plain paragraph has neither.
  expect(plain!.between).toBeFalsy();
  expect(plain!.bar).toBeFalsy();

  // Save → reload from the produced buffer (round-trips through the
  // serializer + parser, exercising every layer).
  await page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = (window as any).__editorRef?.current;
    const buf: ArrayBuffer = await handle.save();
    await handle.loadDocumentBuffer(buf);
  });
  await page.waitForTimeout(400);

  const after = await readParagraphBorders(page);
  const aAfter = after.find((p) => p.text === 'BETWEEN-A');
  const bAfter = after.find((p) => p.text === 'BETWEEN-B');
  expect(aAfter?.between).toBeTruthy();
  expect(aAfter?.bar).toBeTruthy();
  expect(bAfter?.between).toBeTruthy();
  expect(bAfter?.bar).toBeTruthy();
});

test('w:between renders a horizontal rule between two grouped paragraphs', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/between-bar-borders.docx');
  await page.waitForTimeout(500);

  // The renderer paints `between` as a top border on an inner
  // `.layout-paragraph-border` overlay div on the interior paragraph
  // of a border group. So `BETWEEN-B`'s overlay should have a top
  // border (the blue rule), and `BETWEEN-A`'s should have a left-side
  // bar element (red).
  const data = await page.evaluate(() => {
    const pages = Array.from(document.querySelectorAll<HTMLElement>('.layout-page')).filter(
      (el) => !el.closest('.paged-editor__hidden-pm')
    );
    let bTop: string | null = null;
    let aBarLeft: string | null = null;
    for (const pageEl of pages) {
      const paras = Array.from(pageEl.querySelectorAll<HTMLElement>('.layout-paragraph'));
      for (const p of paras) {
        if (p.textContent?.includes('BETWEEN-B')) {
          // Border CSS lives on the .layout-paragraph-border child.
          const overlay = p.querySelector<HTMLElement>('.layout-paragraph-border');
          bTop = overlay?.style.borderTop || null;
        }
        if (p.textContent?.includes('BETWEEN-A')) {
          // The bar is a separate absolutely-positioned child div.
          const bar = p.querySelector<HTMLElement>(
            'div[style*="position: absolute"][style*="border-left"]'
          );
          aBarLeft = bar?.style.borderLeft ?? null;
        }
      }
    }
    return { bTop, aBarLeft };
  });

  // BETWEEN-B should have a top border on its border overlay
  // (the rendered `between` rule between the two grouped paragraphs).
  expect(data.bTop).toBeTruthy();
  // BETWEEN-A should have a left-margin bar.
  expect(data.aBarLeft).toBeTruthy();
});
