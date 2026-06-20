/**
 * Form checkbox row-height fidelity (#11)
 *
 * Word/LibreOffice set form `w14:checkbox` content controls in a tall dingbat
 * font (e.g. Wingdings 2), so the table rows that hold them are tall — a 16pt
 * checkbox row is ~75px in LibreOffice. The editor substitutes a Unicode glyph
 * in a normal font, which collapsed those rows to ~34px and compressed every
 * form vertically. With the hardcoded symbol-font line metrics, the rows render
 * close to the reference again. This guards against regressing back to the
 * collapsed height.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEDICAL_DOCX = path.join(__dirname, '..', 'fixtures', 'medical-incident-form.docx');

test.describe('Form checkbox row height', () => {
  test('checkbox rows render tall (not collapsed) like the reference', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.loadDocxFile(MEDICAL_DOCX);
    await page.waitForSelector('.layout-page', { timeout: 30000 });
    await page.waitForTimeout(800);

    const heights = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.layout-table-row')];
      return rows
        .filter((r) => /Medication Error|Fall or Injury|Adverse Reaction/.test(r.textContent || ''))
        .map((r) => r.getBoundingClientRect().height);
    });

    expect(heights.length).toBeGreaterThanOrEqual(3);
    // LibreOffice renders these ~75px. Collapsed (the bug) was ~34px. Assert
    // they're clearly in the tall regime — a wide band so font-metric drift
    // across platforms doesn't make this flaky.
    for (const h of heights) {
      expect(h).toBeGreaterThan(60);
      expect(h).toBeLessThan(95);
    }
  });
});
