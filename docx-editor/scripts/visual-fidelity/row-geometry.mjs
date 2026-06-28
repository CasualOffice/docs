/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Phase 0 (VF-to-80 initiative, docs/internal/21) — editor row geometry probe.
 *
 * Loads a fixture in the live editor and extracts every painted table row's
 * top + height (per page, page-relative px) plus a short text label, so we can
 * diff per-row-type heights against the LibreOffice reference and correct the
 * exact rows that drift — instead of guessing global ratios.
 *
 *   BASE_URL=http://localhost:5173 node scripts/visual-fidelity/row-geometry.mjs <fixture>
 *
 * Output: JSON to stdout — { fixture, pages: [{ page, rows: [{y,h,t}] }] }.
 */
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173';
const fixture = process.argv[2] ?? 'medical-incident-form';

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
await page.goto(`${BASE_URL}/?e2e=1`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="docx-editor"]', { timeout: 25000 });
await page
  .locator('input[type="file"][accept*=".docx"]')
  .first()
  .setInputFiles(join(ROOT, 'e2e', 'fixtures', `${fixture}.docx`));
await page.waitForSelector('.layout-page', { timeout: 45000 });
await page.waitForTimeout(1800);

const data = await page.evaluate(() => {
  const pages = [...document.querySelectorAll('.layout-page')];
  return pages.map((pg, pi) => {
    const pr = pg.getBoundingClientRect();
    const rows = [...pg.querySelectorAll('.layout-table-row')].map((r) => {
      const rr = r.getBoundingClientRect();
      return {
        y: Math.round(rr.top - pr.top),
        h: Math.round(rr.height),
        t: (r.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24),
      };
    });
    return { page: pi + 1, rows };
  });
});

await browser.close();
console.log(JSON.stringify({ fixture, pages: data }, null, 1));
