/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * M1b editing-experience contract — FORMATTING TRIGGERS.
 *
 * Each formatting gesture (toolbar button or plugin-api command) must
 * mutate the document MODEL — marks on runs, attrs on paragraphs — not
 * just paint a style. These assertions read the live PM doc so they hold
 * regardless of which renderer paints the result.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';
import * as assertions from '../helpers/assertions';
import { marksOnText, readParagraphs } from './_model';

test.describe('Formatting triggers mutate the model', () => {
  let ed: EditorPage;

  test.beforeEach(async ({ page }) => {
    ed = new EditorPage(page);
    await ed.goto();
    await ed.waitForReady();
    await ed.newDocument();
    await ed.focus();
  });

  test('bold adds and removes the bold mark on the run', async ({ page }) => {
    await ed.typeText('make me bold');
    await ed.selectText('bold');
    await ed.applyBold();
    await page.waitForTimeout(120);
    expect(await marksOnText(page, 'bold')).toContain('bold');

    // Re-select and toggle off.
    await ed.selectText('bold');
    await ed.applyBold();
    await page.waitForTimeout(120);
    expect(await marksOnText(page, 'bold')).not.toContain('bold');
  });

  test('italic adds the italic mark on the run', async ({ page }) => {
    await ed.typeText('make me italic');
    await ed.selectText('italic');
    await ed.applyItalic();
    await page.waitForTimeout(120);
    expect(await marksOnText(page, 'italic')).toContain('italic');
  });

  test('heading style sets the paragraph styleId', async ({ page }) => {
    await ed.typeText('Section title');
    await page.waitForTimeout(80);
    await ed.applyHeading1();
    await page.waitForTimeout(150);

    const paras = await readParagraphs(page);
    const heading = paras.find((p) => p.text.includes('Section title'));
    expect(heading?.styleId).toBe('Heading1');
  });

  test('bullet list turns the paragraph into a bulleted list item', async ({ page }) => {
    await ed.typeText('a bullet line');
    await page.waitForTimeout(80);
    await ed.toggleBulletList();
    await page.waitForTimeout(150);
    await assertions.assertParagraphIsList(page, 0, 'bullet');
  });

  test('numbered list turns the paragraph into a numbered list item', async ({ page }) => {
    await ed.typeText('a numbered line');
    await page.waitForTimeout(80);
    await ed.toggleNumberedList();
    await page.waitForTimeout(150);
    await assertions.assertParagraphIsList(page, 0, 'numbered');
  });

  test('alignment sets the paragraph alignment attr', async ({ page }) => {
    await ed.typeText('center this paragraph');
    await page.waitForTimeout(80);
    await ed.alignCenter();
    await page.waitForTimeout(150);

    let paras = await readParagraphs(page);
    expect(paras[0]?.alignment).toBe('center');

    await ed.alignRight();
    await page.waitForTimeout(150);
    paras = await readParagraphs(page);
    expect(paras[0]?.alignment).toBe('right');
  });

  test('bold + italic compose on the same run', async ({ page }) => {
    await ed.typeText('combo text');
    await ed.selectText('combo');
    await ed.applyBold();
    await page.waitForTimeout(80);
    await ed.selectText('combo');
    await ed.applyItalic();
    await page.waitForTimeout(120);

    const marks = await marksOnText(page, 'combo');
    expect(marks).toContain('bold');
    expect(marks).toContain('italic');
  });
});
