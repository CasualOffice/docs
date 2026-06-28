/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';
import { modifierKey } from '../helpers/keyboard';

// The features added this session (Dictionary, Translate, Explore,
// Citations, Building blocks, Watermark, Convert to table, Shape, etc.)
// are now discoverable via Cmd+Shift+P. This spec asserts the headline
// new entries appear without hand-rolling a check per entry.
test('Command palette surfaces the new Tools and Insert entries', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.newDocument();
  await editor.focus();
  const mod = await modifierKey(page);
  await page.keyboard.press(`${mod}+Shift+p`);

  const input = page.getByTestId('command-palette-input');

  const expectFirstResult = async (query: string, label: RegExp) => {
    await input.fill(query);
    const first = page.locator('[data-cp-index]').first();
    await expect(first).toContainText(label);
  };

  await expectFirstResult('Dictionary', /Dictionary/i);
  await expectFirstResult('Translate', /Translate/i);
  await expectFirstResult('Explore', /Explore/i);
  await expectFirstResult('Citations', /Citations/i);
  await expectFirstResult('Building blocks', /Building blocks/i);
  await expectFirstResult('Watermark', /Watermark/i);
  await expectFirstResult('Convert selection', /Convert selection to table/i);
  await expectFirstResult('Shape Ellipse', /Shape.*Ellipse/i);
  await expectFirstResult('Email as attachment', /Email as attachment/i);
});
