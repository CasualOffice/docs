/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * M1b editing-experience contract — ROUND-TRIP THROUGH EDIT.
 *
 * Open a real fixture, make an edit, serialize to .docx and re-parse it
 * (fromProseDoc → OOXML → toProseDoc), and assert both the pre-existing
 * content AND the new edit survive. This is the strongest contract: the
 * editing surface must produce a model that round-trips losslessly, which
 * the canvas migration must preserve byte-for-behavior.
 *
 * Uses the in-memory save→reload path (window.__editorRef.save() +
 * loadDocumentBuffer), the same path the highlight/theme roundtrip specs
 * use, so no file download is required.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';
import { docText, marksOnText, saveAndReload } from './_model';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LETTER = path.join(__dirname, '..', 'fixtures', 'repr-letter.docx');
const WITH_TABLES = path.join(__dirname, '..', 'fixtures', 'with-tables.docx');

test.describe('Round-trip through edit', () => {
  let ed: EditorPage;

  test.beforeEach(async ({ page }) => {
    ed = new EditorPage(page);
    await ed.goto();
    await ed.waitForReady();
  });

  test('letter fixture: appended text survives save → reload', async ({ page }) => {
    await ed.loadDocxFile(LETTER);
    await page.waitForTimeout(400);

    const original = (await docText(page)).trim();
    expect(original.length).toBeGreaterThan(0);

    // Append a unique marker at the very end of the document.
    await ed.focus();
    const isMac = await page.evaluate(() => /Mac/i.test(navigator.platform));
    await page.keyboard.press(`${isMac ? 'Meta' : 'Control'}+End`);
    await page.waitForTimeout(100);
    const marker = 'ZZ-roundtrip-marker-42';
    await ed.typeText(' ' + marker);
    await page.waitForTimeout(150);
    expect(await docText(page)).toContain(marker);

    await saveAndReload(page);

    const after = await docText(page);
    // Both the original body AND the new edit are preserved.
    expect(after).toContain(marker);
    // A representative slice of the original content is still present.
    const sample = original.slice(0, 20);
    expect(after).toContain(sample);
  });

  test('letter fixture: a formatting edit survives save → reload', async ({ page }) => {
    await ed.loadDocxFile(LETTER);
    await page.waitForTimeout(400);

    // Bold the first run of real text in the document.
    await ed.focus();
    const firstWord = (await docText(page)).trim().split(/\s+/)[0];
    expect(firstWord?.length).toBeGreaterThan(0);
    await ed.selectText(firstWord);
    await ed.applyBold();
    await page.waitForTimeout(150);
    expect(await marksOnText(page, firstWord)).toContain('bold');

    await saveAndReload(page);

    expect(await marksOnText(page, firstWord)).toContain('bold');
  });

  test('table fixture: an edited cell survives save → reload', async ({ page }) => {
    await ed.loadDocxFile(WITH_TABLES);
    await page.waitForTimeout(500);
    expect(await ed.getTableCount()).toBeGreaterThanOrEqual(1);

    // Append a unique marker into the first cell (no select-all: Ctrl+A in a
    // cell selects the whole doc and would replace the table).
    await ed.clickTableCell(0, 0, 0);
    await page.waitForTimeout(100);
    const cellMarker = 'CELLMARK99';
    await ed.typeText(cellMarker);
    await page.waitForTimeout(150);
    expect(await docText(page)).toContain(cellMarker);

    await saveAndReload(page);
    await page.waitForTimeout(300);

    // The table is still a table and the cell edit survived.
    expect(await ed.getTableCount()).toBeGreaterThanOrEqual(1);
    expect(await docText(page)).toContain(cellMarker);
  });
});
