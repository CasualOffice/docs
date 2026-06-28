/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Desktop dirty-tracking regression.
 *
 * The Tauri shell's unsaved-changes close-guard only prompts when the window
 * is flagged dirty. That flag used to be driven by a DOM keystroke heuristic,
 * which missed every mouse/toolbar/menu edit (bold, tables, format painter,
 * accept/reject) — so closing after a toolbar-only edit silently discarded the
 * work. The bridge now takes the dirty signal from DocxEditor's `onChange`
 * (forwarded by App.tsx → `window.__deskApp__.setDirty`).
 *
 * This stubs a desktop bridge that records setDirty calls and asserts a
 * toolbar-only Bold edit (no typing) marks the window dirty.
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

test('toolbar-only edit marks the desktop window dirty', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __deskDirtyCalls: boolean[]; __deskApp__: unknown };
    w.__deskDirtyCalls = [];
    w.__deskApp__ = {
      isDesktop: true,
      filePath: null,
      fileKind: 'docx',
      loadDocument: async () => {
        throw new Error('not used');
      },
      save: async () => null,
      saveAs: async () => null,
      setDirty: (dirty: boolean) => {
        w.__deskDirtyCalls.push(dirty);
      },
      dismissBoot: () => undefined,
    };
  });

  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.focus();

  // Type some text (this also marks dirty), then clear the record so the
  // assertion isolates the TOOLBAR edit — the case the old heuristic missed.
  await editor.typeText('Hello world');
  await page.evaluate(() => {
    (window as unknown as { __deskDirtyCalls: boolean[] }).__deskDirtyCalls.length = 0;
  });

  // Toolbar-only edit: select via the API + click the Bold toolbar button.
  // No keypress that the old input/keydown heuristic would have caught.
  await editor.selectText('Hello');
  await editor.applyBold();

  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __deskDirtyCalls: boolean[] }).__deskDirtyCalls,
      ),
    )
    .toContain(true);
});
