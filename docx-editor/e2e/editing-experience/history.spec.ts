/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * M1b editing-experience contract — HISTORY (undo / redo).
 *
 * Undo/redo must walk the edit stack deterministically across mixed
 * text + formatting edits, and the toolbar's availability state must
 * track the stack. Asserted on the live model text and the marks.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';
import { docText, marksOnText } from './_model';

test.describe('Undo / redo', () => {
  let ed: EditorPage;

  test.beforeEach(async ({ page }) => {
    ed = new EditorPage(page);
    await ed.goto();
    await ed.waitForReady();
    await ed.newDocument();
    await ed.focus();
  });

  test('undo peels back successive typed edits; redo replays them', async ({ page }) => {
    // 600ms pauses break ProseMirror's typing-coalesce window (~500ms
    // newGroupDelay) so each run is its own undo step — same technique the
    // existing history scenarios use.
    await ed.typeText('one ');
    await page.waitForTimeout(600);
    await ed.typeText('two ');
    await page.waitForTimeout(600);
    await ed.typeText('three');
    await page.waitForTimeout(200);
    expect((await docText(page)).trim()).toBe('one two three');

    // Undo the last typing run.
    await ed.undoShortcut();
    await page.waitForTimeout(150);
    expect(await docText(page)).not.toContain('three');
    expect(await docText(page)).toContain('two');

    // Redo restores it.
    await ed.redoShortcut();
    await page.waitForTimeout(150);
    expect((await docText(page)).trim()).toBe('one two three');
  });

  test('undo reverts a formatting edit without losing the text', async ({ page }) => {
    await ed.typeText('format me');
    await ed.selectText('format');
    await ed.applyBold();
    await page.waitForTimeout(150);
    expect(await marksOnText(page, 'format')).toContain('bold');

    await ed.undoShortcut();
    await page.waitForTimeout(150);
    // Bold is gone, the text is intact.
    expect(await marksOnText(page, 'format')).not.toContain('bold');
    expect(await docText(page)).toContain('format me');

    await ed.redoShortcut();
    await page.waitForTimeout(150);
    expect(await marksOnText(page, 'format')).toContain('bold');
  });

  test('multiple undos then redos converge back to the final state', async ({ page }) => {
    await ed.typeText('alpha');
    await page.waitForTimeout(120);
    await ed.pressEnter();
    await ed.typeText('beta');
    await page.waitForTimeout(120);
    await ed.pressEnter();
    await ed.typeText('gamma');
    await page.waitForTimeout(120);

    const finalState = await docText(page);

    for (let i = 0; i < 3; i++) {
      await ed.undoShortcut();
      await page.waitForTimeout(120);
    }
    // Walked back at least past the last word.
    expect(await docText(page)).not.toContain('gamma');

    for (let i = 0; i < 3; i++) {
      await ed.redoShortcut();
      await page.waitForTimeout(120);
    }
    expect(await docText(page)).toBe(finalState);
  });

  test('redo availability clears once a new edit is made after undo', async ({ page }) => {
    await ed.typeText('first');
    await page.waitForTimeout(120);
    await ed.undoShortcut();
    await page.waitForTimeout(120);
    expect(await ed.isRedoAvailable()).toBe(true);

    // A fresh edit invalidates the redo branch.
    await ed.typeText('divergent');
    await page.waitForTimeout(120);
    expect(await ed.isRedoAvailable()).toBe(false);
  });
});
