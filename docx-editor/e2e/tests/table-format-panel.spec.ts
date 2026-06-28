/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Table appearance controls (border / border color / width / cell fill) live in
 * the Format (properties) panel, NOT scattered into the formatting toolbar.
 * Regression: they used to append to the toolbar when the caret entered a table.
 */
import { test, expect } from '@playwright/test';
import { join } from 'path';

test('table border/color/fill render in the Format panel, not the toolbar', async ({ page }) => {
  await page.goto('http://localhost:5173/?e2e=1', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="docx-editor"]', { timeout: 25000 });
  const input = page.locator('input[type="file"][accept*=".docx"]').first();
  await input.setInputFiles(join(process.cwd(), 'e2e/fixtures/medical-incident-form.docx'));
  await page.waitForSelector('.layout-page', { timeout: 30000 });
  await page.waitForTimeout(1200);

  // Place the caret inside a table cell.
  await page.getByText('Date and time of the incident', { exact: false }).first().click();
  await page.waitForTimeout(700);

  // Table group is active (so the toolbar absence below is meaningful)…
  await expect(page.locator('[data-testid="toolbar-table-more"]')).toHaveCount(1);
  // …but the border picker is NOT in the toolbar anymore.
  await expect(page.locator('[data-testid="toolbar-table-borders"]')).toHaveCount(0);

  // Open the table Format chip → the properties panel.
  await page.locator('[data-testid="table-format-chip"]').click({ timeout: 2500 });
  await page.waitForTimeout(700);

  const section = page.locator('[data-testid="properties-table-section"]');
  await expect(section).toHaveCount(1);
  // The border picker now lives inside the panel.
  await expect(section.locator('[data-testid="toolbar-table-borders"]')).toHaveCount(1);
});
