import { test, expect } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * ODT open from the Home picker.
 *
 * The Home file picker was DOCX-only (`accept=".docx"`) and `handleOpenFromHome`
 * fed the raw bytes straight to the parser, so picking a `.odt` either couldn't
 * be selected or rendered as garbage. The fix widens the accept list and routes
 * foreign formats (.odt/.md/.txt) through the WASM converter before the editor
 * loads them — mirroring the editor's own File → Open path.
 *
 * This drives the REAL Home picker → WASM conversion → painted pages, asserting
 * the document's text actually rendered (proving the convert-to-DOCX round-trip
 * ran, not just that a file was accepted).
 */

const ODT_FIXTURE = path.join(__dirname, '..', 'fixtures', 'casual-sample.odt');

test('opens a .odt file from the Home picker and renders its text', async ({ page }) => {
  // Plain `/` lands on Home; `?e2e=1` would force the editor and skip the picker.
  await page.goto('/');

  // Home view renders the picker (DOCX-only accept would have excluded .odt).
  const fileInput = page.getByTestId('home-file-input');
  await expect(fileInput).toHaveAttribute('accept', /\.odt/);

  await fileInput.setInputFiles(ODT_FIXTURE);

  // Editor mounts once the WASM converter returns DOCX bytes. The 7 MB WASM is
  // lazy-loaded on first conversion, so allow a generous mount window.
  await page.waitForSelector('[data-testid="docx-editor"]', { timeout: 45000 });
  await page.waitForFunction(() => document.fonts.ready);

  // The converted document's text must appear in the painted pages — this is
  // the real proof the .odt was decoded, not just accepted.
  const pages = page.locator('.paged-editor__pages');
  await expect(pages).toContainText('Casual ODT Fixture Heading', { timeout: 15000 });
  await expect(pages).toContainText('This paragraph proves ODT open works end to end');
});
