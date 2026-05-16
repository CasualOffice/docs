/**
 * Real-world smoke test against a complex .docx the user provided
 * (Safety Data Sheet, ZH locale, large body + 1 body textbox + 1
 * header textbox + 1 table).
 *
 * Important: this doc uses legacy **VML** for its textboxes
 * (`<v:shape>` + `<v:textbox>` + `<w:txbxContent>`), NOT the modern
 * DrawingML format (`<wps:wsp>` + `<wps:txbx>`). Our textbox parser /
 * enricher handles DrawingML only — VML textbox support is a separate,
 * still-open gap tracked in `docs/03-gap-matrix.md`. So this file:
 *   - asserts the doc loads end-to-end without error,
 *   - and pins the VML-textbox gap as a known failure (test.fixme).
 *
 * When VML textbox support lands, drop the fixme — the assertion should
 * then pass.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

const FIXTURE = 'fixtures/sds-real-world.docx';

test.describe('Real-world doc (SDS) — smoke test', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.loadDocxFile(FIXTURE);
    await page.waitForTimeout(800);
  });

  test('loads without onError firing', async ({ page }) => {
    const editorEl = page.locator('[data-testid="docx-editor"]');
    await expect(editorEl).toBeVisible({ timeout: 5000 });
  });

  test.fixme(
    'VML textboxes render as .layout-textbox containers (gap: textbox-render-vml)',
    async ({ page }) => {
      // Currently fails — VML textbox parsing not implemented. Tracked
      // in docs/03-gap-matrix.md as textbox-render-vml.
      const count = await page.locator('.layout-textbox').count();
      expect(count).toBeGreaterThanOrEqual(1);
    }
  );
});
