/**
 * A floating image anchored inside a table cell must be clickable/selectable.
 * Previously findImageElement only matched page-floating images, so clicking a
 * cell-floating one fell through and it couldn't be selected.
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

const CELL_IMG = '[data-testid="docx-editor"] .layout-cell-floating-image[data-pm-start]';

test('floating image in a table cell is selectable', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/table-float-image-test.docx');
  await page.waitForTimeout(1500);

  const img = page.locator(CELL_IMG).first();
  await expect(img).toBeAttached();
  const box = await img.boundingBox();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.waitForTimeout(400);

  // selecting an image shows its on-object Format chip (proves it's selected)
  await expect(page.locator('[data-testid="image-format-chip"]')).toBeVisible();
});
