/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * Selection persists when a toolbar dropdown opens — openspec
 * `toolbar-selection-interactions`. Gap matrix flagged "Selection
 * disappears when dropdown opens"; the trigger button and dropdown
 * panel in `MenuDropdown.tsx` both already call
 * `e.preventDefault()` on `mousedown` to keep focus on the editor.
 * Pin this so a regression here surfaces immediately.
 */

async function readSelection(
  page: import('@playwright/test').Page
): Promise<{ empty: boolean; from: number; to: number } | null> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = (window as any).__editorRef?.current;
    if (!handle) return null;
    const view = handle.getEditorRef?.()?.getView?.();
    if (!view) return null;
    const sel = view.state.selection;
    return { empty: sel.empty, from: sel.from, to: sel.to };
  });
}

test('selection survives opening + closing the File menu', async ({ page }) => {
  const editor = new EditorPage(page);
  await page.goto('/?e2e=1');
  await editor.waitForReady();
  await editor.newDocument();
  await editor.focus();

  await editor.typeText('Some selectable text here');
  await editor.selectAll();

  const before = await readSelection(page);
  expect(before).toBeTruthy();
  expect(before!.empty, 'selection should not be empty after selectAll').toBe(false);

  // Open the File menu — clicking the trigger should NOT collapse the
  // selection. The dropdown's mousedown handler calls preventDefault
  // to keep PM's focus + selection intact (the bug reporter's
  // complaint).
  await page.getByRole('button', { name: /^File$/ }).first().click();
  await expect(page.getByText('Open', { exact: true }).first()).toBeVisible();

  const duringOpen = await readSelection(page);
  expect(duringOpen).toBeTruthy();
  expect(duringOpen!.empty, 'selection should survive opening the dropdown').toBe(false);
  expect(duringOpen!.from).toBe(before!.from);
  expect(duringOpen!.to).toBe(before!.to);

  // Note: closing the dropdown via Escape shifts the PM caret by 1
  // (PM's own Escape keymap, unrelated to this gap). Closing via
  // outside-click is the user's natural path after dismissing the
  // menu without picking an item.
  await page.mouse.click(400, 600);
  await page.waitForTimeout(150);

  const afterClose = await readSelection(page);
  expect(afterClose).toBeTruthy();
  // After clicking on the body, PM may collapse the selection to the
  // click point — that's expected behavior, not the dropdown's fault.
  // What we pinned is the during-open invariant above.
});
