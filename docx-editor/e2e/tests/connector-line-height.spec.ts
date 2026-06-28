/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * A grouped "Straight Connector" (prst="line", cy=0) with a fill must render
 * as a thin rule, NOT a content-height filled box. Regression: the medical-
 * incident-form header divider rendered as a ~10px gray bar because the line
 * shape was given an empty placeholder paragraph + default text-box insets,
 * which inflated its height. See textBoxEnricher.extractShapeFromWsp.
 */
import { test, expect } from '@playwright/test';
import { join } from 'path';

test('grouped connector line renders thin, not as a tall filled bar', async ({ page }) => {
  await page.goto('http://localhost:5173/?e2e=1', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="docx-editor"]', { timeout: 20000 });
  const input = page.locator('input[type="file"][accept*=".docx"]').first();
  await input.setInputFiles(join(process.cwd(), 'e2e/fixtures/medical-incident-form.docx'));
  await page.waitForSelector('.layout-page', { timeout: 30000 });
  await page.waitForTimeout(800);
  // The gray (bg1+lumMod85% = rgb(217,217,217)) divider must be a thin line.
  const grayHeights = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.layout-textbox'))
      .filter((e) => getComputedStyle(e as HTMLElement).backgroundColor.includes('217, 217, 217'))
      .map((e) => Math.round((e as HTMLElement).getBoundingClientRect().height))
  );
  expect(grayHeights.length).toBeGreaterThan(0);
  for (const h of grayHeights) expect(h).toBeLessThanOrEqual(4);
});
