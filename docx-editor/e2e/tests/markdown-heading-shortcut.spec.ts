/**
 * Markdown heading shortcut: "# " / "## " / "### " at the start of a plain
 * paragraph applies Heading 1/2/3 (Google Docs / Notion autoformat). It sets
 * the real paragraph style (data-style-id), not just direct formatting, so the
 * heading appears in the outline and round-trips.
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

const PM = '.paged-editor__hidden-pm .ProseMirror';

test.describe('Markdown heading shortcut', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
  });

  for (const [marker, styleId, label] of [
    ['#', 'Heading1', 'H1'],
    ['##', 'Heading2', 'H2'],
    ['###', 'Heading3', 'H3'],
  ] as const) {
    test(`"${marker} " applies ${styleId}`, async ({ page }) => {
      await editor.typeText(`${marker} ${label} text`);
      const p = page.locator(`${PM} p[data-style-id="${styleId}"]`);
      await expect(p).toHaveCount(1, { timeout: 2000 });
      // Marker consumed; text kept.
      await expect(p).toContainText(`${label} text`);
      await expect(p).not.toContainText(`${marker} `);
    });
  }

  test('four hashes does NOT trigger a heading', async ({ page }) => {
    await editor.typeText('#### not a heading');
    await expect(page.locator(`${PM} p[data-style-id^="Heading"]`)).toHaveCount(0);
  });

  test('a hash mid-paragraph does NOT trigger a heading', async ({ page }) => {
    await editor.typeText('text # more');
    await expect(page.locator(`${PM} p[data-style-id^="Heading"]`)).toHaveCount(0);
  });
});
