/**
 * Block-geometry probe — dumps every painted top-level block (heading,
 * paragraph, list item, table) in the live editor with its page-relative
 * top + height + style class + a short text label. Complements
 * `row-geometry.mjs` (which only sees table rows) so prose / heading
 * vertical spacing can be attributed against the LibreOffice reference.
 *
 *   BASE_URL=http://localhost:5173 node scripts/visual-fidelity/block-geometry.mjs <fixture> [page]
 * Output: JSON to stdout — { fixture, page, blocks: [{y,h,cls,t}] }.
 */
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173';
const fixture = process.argv[2] ?? 'repr-weekly-status';
const pageIdx = Number(process.argv[3] ?? 1);

const browser = await chromium.launch();
const page = await (
  await browser.newContext({ viewport: { width: 1400, height: 1000 } })
).newPage();
await page.goto(`${BASE_URL}/?e2e=1`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="docx-editor"]', { timeout: 25000 });
await page
  .locator('input[type="file"][accept*=".docx"]')
  .first()
  .setInputFiles(join(ROOT, 'e2e', 'fixtures', `${fixture}.docx`));
await page.waitForSelector('.layout-page', { timeout: 30000 });
await page.waitForTimeout(1500);

const blocks = await page.evaluate((pIdx) => {
  const pages = document.querySelectorAll('.layout-page');
  const pg = pages[pIdx - 1];
  if (!pg) return [];
  const pageTop = pg.getBoundingClientRect().top;
  // Top-level painted blocks: paragraphs, headings, list items, tables.
  const sel = '.layout-paragraph, .layout-block-image, table';
  const out = [];
  pg.querySelectorAll(sel).forEach((el) => {
    // skip nested (only direct flow children of the page content)
    const r = el.getBoundingClientRect();
    if (r.height < 1) return;
    out.push({
      y: Math.round((r.top - pageTop) * (150 / 96)),
      h: Math.round(r.height * (150 / 96)),
      cls: el.className.replace(/layout-/g, '').slice(0, 40),
      t: (el.textContent || '').trim().slice(0, 34),
    });
  });
  return out;
}, pageIdx);

console.log(JSON.stringify({ fixture, page: pageIdx, blocks }, null, 0));
await browser.close();
