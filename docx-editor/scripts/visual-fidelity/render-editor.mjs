#!/usr/bin/env node
/**
 * Phase 0 visual-fidelity harness — EDITOR render stage.
 *
 * Loads every fixture .docx in the running editor (dev server at BASE_URL)
 * and screenshots each rendered page (`.layout-page`) to a PNG.
 *
 * Output: <outDir>/editor/<fixture>-p<NN>.png
 *
 * Requires the dev server to already be up (the orchestrator `run.mjs`
 * starts it). Run standalone with:
 *   BASE_URL=http://localhost:5173 node scripts/visual-fidelity/render-editor.mjs
 */
import { chromium } from '@playwright/test';
import { readdirSync, mkdirSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FIXTURE_DIR = join(ROOT, 'e2e/fixtures');
const OUT_DIR = join(ROOT, process.env.VF_OUT ?? 'visual-fidelity-out', 'editor');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173';
const ONLY = process.env.VF_ONLY?.split(',').map((s) => s.trim()).filter(Boolean);

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const fixtures = readdirSync(FIXTURE_DIR)
  .filter((f) => f.endsWith('.docx'))
  .filter((f) => !ONLY || ONLY.includes(basename(f, '.docx')));

const browser = await chromium.launch();
const ctx = await browser.newContext({ deviceScaleFactor: 2 });
const page = await ctx.newPage();

const summary = [];
for (const fixture of fixtures) {
  const name = basename(fixture, '.docx');
  try {
    await page.goto(`${BASE_URL}/?e2e=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="docx-editor"]', { timeout: 20000 });
    await page.evaluate(() => document.fonts.ready);

    // Hide editor chrome that floats over the page (ruler, status bar,
    // selection caret) so the page screenshot is clean page content only —
    // otherwise it contaminates the pixel comparison vs the reference PDF.
    await page.addStyleTag({
      content: `[class*="ruler"],[data-testid="status-bar"],
                .paged-editor__decoration-overlay,.ep-caret,.ProseMirror-gapcursor
                { display: none !important; visibility: hidden !important; }`,
    });

    const input = page.locator('input[type="file"][accept*=".docx"]').first();
    await input.setInputFiles(join(FIXTURE_DIR, fixture));

    // Wait for at least one painted page, then for the page COUNT to settle.
    // The layout pipeline re-runs after load (re-measure → re-paginate),
    // briefly tearing pages down and back up; screenshotting during that
    // window gives a false 0/low count. Poll until the count is non-zero
    // and unchanged across consecutive samples before capturing.
    await page.waitForSelector('.layout-page', { timeout: 30000 });
    const pages = page.locator('.layout-page');
    let count = 0;
    let stable = 0;
    for (let i = 0; i < 40 && stable < 3; i++) {
      await page.waitForTimeout(250);
      const c = await pages.count();
      stable = c > 0 && c === count ? stable + 1 : 0;
      count = c;
    }
    for (let i = 0; i < count; i++) {
      const el = pages.nth(i);
      await el.scrollIntoViewIfNeeded();
      const num = String(i + 1).padStart(2, '0');
      await el.screenshot({ path: join(OUT_DIR, `${name}-p${num}.png`) });
    }
    summary.push({ name, pages: count, ok: true });
    console.log(`[editor] ${name}: ${count} page(s)`);
  } catch (err) {
    summary.push({ name, pages: 0, ok: false, error: String(err).split('\n')[0] });
    console.error(`[editor] ${name}: FAILED — ${String(err).split('\n')[0]}`);
  }
}

await browser.close();
console.log(`\n[editor] rendered ${summary.filter((s) => s.ok).length}/${summary.length} fixtures → ${OUT_DIR}`);
