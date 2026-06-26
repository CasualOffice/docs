import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * Custom-hex highlight round-trip — UI end-to-end.
 *
 * Unit coverage (`highlight-roundtrip.test.ts`) pins the parser/
 * serializer contract: a custom-hex highlight serializes via
 * `<w:shd>` (since `<w:highlight>` only accepts the named-color
 * enum), and — by deliberate design — an imported run-level `<w:shd>`
 * rehydrates as run SHADING, not a highlight mark. Promoting every
 * `<w:shd>` fill to a highlight made ordinary Word/LibreOffice text
 * look falsely highlighted, so the color rides back on `runShading`.
 *
 * This spec walks the user-visible flow: pick a custom hex color from
 * the highlight dropdown, apply it to selected text, save the document
 * to a buffer, reload it from that buffer, and assert the SAME color is
 * still on the run after the round-trip — as the `runShading` mark the
 * `<w:shd>` fallback round-trips into. The visual fill survives; only
 * the semantic label moves from `highlight` to `runShading`, matching
 * the unit contract.
 */

async function readHighlightsOnFirstParagraph(
  page: import('@playwright/test').Page
): Promise<string[]> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = (window as any).__editorRef?.current;
    if (!handle) return [];
    const view = handle.getEditorRef?.()?.getView?.();
    if (!view) return [];
    const out: string[] = [];
    const paragraph = view.state.doc.firstChild;
    if (!paragraph) return [];
    paragraph.descendants(
      (node: {
        isText?: boolean;
        marks: { type: { name: string }; attrs: Record<string, unknown> }[];
      }) => {
        if (!node.isText) return;
        for (const mark of node.marks) {
          if (mark.type.name === 'highlight') {
            out.push(String((mark.attrs as { color?: string }).color ?? ''));
          }
        }
      }
    );
    return out;
  });
}

/**
 * Read the run-shading fill hex off the first paragraph's text runs.
 * Custom-hex highlights round-trip as `<w:shd>` → the `runShading` mark
 * (see `toProseDoc.ts`), so this is where the color lives after reload.
 */
async function readShadingFillsOnFirstParagraph(
  page: import('@playwright/test').Page
): Promise<string[]> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = (window as any).__editorRef?.current;
    if (!handle) return [];
    const view = handle.getEditorRef?.()?.getView?.();
    if (!view) return [];
    const out: string[] = [];
    const paragraph = view.state.doc.firstChild;
    if (!paragraph) return [];
    paragraph.descendants(
      (node: {
        isText?: boolean;
        marks: { type: { name: string }; attrs: Record<string, unknown> }[];
      }) => {
        if (!node.isText) return;
        for (const mark of node.marks) {
          if (mark.type.name === 'runShading') {
            const shading = (mark.attrs as { shading?: { fill?: { rgb?: string } } }).shading;
            const rgb = shading?.fill?.rgb;
            if (rgb) out.push(String(rgb));
          }
        }
      }
    );
    return out;
  });
}

test('custom-hex highlight survives a save → reload cycle', async ({ page }) => {
  const editor = new EditorPage(page);
  await page.goto('/?e2e=1');
  await editor.waitForReady();
  await editor.newDocument();
  await editor.focus();

  // Type some text and select it.
  await editor.typeText('Highlight me');
  await editor.selectAll();

  // Apply a custom hex highlight (FFEB3B = material yellow — not in the
  // named-color enum, so it has to ride the `<w:shd>` fallback).
  await editor.setHighlightColor('FFEB3B');
  await page.waitForTimeout(150);

  // Sanity: the highlight mark is on the run pre-save (this is the live
  // editing state, before any OOXML serialization).
  const before = await readHighlightsOnFirstParagraph(page);
  expect(before.length).toBeGreaterThan(0);
  expect(before[0].toUpperCase()).toBe('FFEB3B');

  // Save → reload. The save returns the serialized .docx buffer; we
  // hand it straight back to `loadDocumentBuffer` so the document
  // is re-parsed from XML (the only path that exercises the
  // `<w:shd>` → `runShading` rehydration).
  await page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = (window as any).__editorRef?.current;
    const buf: ArrayBuffer = await handle.save();
    await handle.loadDocumentBuffer(buf);
  });
  await page.waitForTimeout(400);

  // After reload the same fill should still be on the run — now carried
  // by `runShading` (the deliberate, unit-pinned destination for a
  // custom-hex `<w:shd>` fallback), not the `highlight` mark.
  const shadingFills = await readShadingFillsOnFirstParagraph(page);
  expect(shadingFills.length).toBeGreaterThan(0);
  expect(shadingFills[0].toUpperCase()).toBe('FFEB3B');
});
