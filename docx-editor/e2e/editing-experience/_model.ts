/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Shared model-inspection helpers for the editing-experience regression
 * suite (milestone M1b).
 *
 * These reach into the LIVE ProseMirror editing state via the `?e2e=1`
 * `window.__editorRef` hook (installed in examples/vite/src/App.tsx) and
 * read the document model directly — node types, paragraph attributes,
 * and run marks. The point of this suite is to lock the *current* editor
 * behavior as a UX contract: the future WASM/canvas renderer must drive
 * the same model from the same gestures, so every assertion here targets
 * the model (or a model round-trip), not pixels.
 *
 * The access pattern mirrors the existing roundtrip specs
 * (e.g. e2e/tests/highlight-roundtrip-e2e.spec.ts):
 *   window.__editorRef.current.getEditorRef().getView().state.doc
 */

import type { Page } from '@playwright/test';

/** A flat snapshot of a paragraph's editing-relevant attributes. */
export interface ParagraphSnapshot {
  text: string;
  alignment: string | null;
  styleId: string | null;
}

/**
 * Read the PM doc's top-level paragraphs as flat snapshots
 * (alignment + styleId + text). Top-level only — table/list internals are
 * covered by the dedicated specs.
 */
export async function readParagraphs(page: Page): Promise<ParagraphSnapshot[]> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = (window as any).__editorRef?.current;
    const view = handle?.getEditorRef?.()?.getView?.();
    if (!view) return [];
    const out: ParagraphSnapshot[] = [];
    view.state.doc.forEach(
      (node: { type: { name: string }; attrs: Record<string, unknown>; textContent: string }) => {
        if (node.type.name !== 'paragraph') return;
        out.push({
          text: node.textContent,
          alignment: (node.attrs.alignment as string | null) ?? null,
          styleId: (node.attrs.styleId as string | null) ?? null,
        });
      }
    );
    return out;
  });
}

/**
 * Collect the set of mark-type names applied to any text run whose text
 * includes `needle`. Used to assert "the bold mark is on this run".
 */
export async function marksOnText(page: Page, needle: string): Promise<string[]> {
  return page.evaluate((searchText) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = (window as any).__editorRef?.current;
    const view = handle?.getEditorRef?.()?.getView?.();
    if (!view) return [];
    const names = new Set<string>();
    view.state.doc.descendants(
      (node: { isText?: boolean; text?: string; marks: { type: { name: string } }[] }) => {
        if (node.isText && node.text && node.text.includes(searchText)) {
          for (const mark of node.marks) names.add(mark.type.name);
        }
      }
    );
    return Array.from(names);
  }, needle);
}

/** Count nodes of a given type anywhere in the doc (tables, images, math…). */
export async function countNodes(page: Page, typeName: string): Promise<number> {
  return page.evaluate((name) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = (window as any).__editorRef?.current;
    const view = handle?.getEditorRef?.()?.getView?.();
    if (!view) return 0;
    let n = 0;
    view.state.doc.descendants((node: { type: { name: string } }) => {
      if (node.type.name === name) n += 1;
    });
    return n;
  }, typeName);
}

/** The full plain-text content of the live PM doc (paragraph-joined). */
export async function docText(page: Page): Promise<string> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = (window as any).__editorRef?.current;
    const view = handle?.getEditorRef?.()?.getView?.();
    return view ? (view.state.doc.textContent as string) : '';
  });
}

/**
 * Serialize the live doc to a .docx buffer and re-parse it back into the
 * editor — the only path that exercises the OOXML serializer + parser
 * (fromProseDoc → XML → toProseDoc). Returns once the reload settles.
 */
export async function saveAndReload(page: Page): Promise<void> {
  await page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = (window as any).__editorRef?.current;
    const buf: ArrayBuffer = await handle.save();
    await handle.loadDocumentBuffer(buf);
  });
  await page.waitForTimeout(400);
}
