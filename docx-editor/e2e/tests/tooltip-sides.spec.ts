import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// `<Tooltip side="left">` was previously a no-op in the position math
// — `side` was typed but only `top` / `bottom` actually moved the
// card. The PanelRail uses side='left' so its tooltips need to land
// to the left of each rail button, not below it. Sanity-check the
// math by hovering the rail's Outline button and asserting the
// tooltip card's centerX is to the LEFT of the button's centerX.
test('PanelRail tooltip with side="left" renders to the left of the button', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.newDocument();

  const btn = page.getByTestId('rail-outline');
  const btnBox = await btn.boundingBox();
  if (!btnBox) throw new Error('rail-outline missing');

  await btn.hover();
  // Tooltip waits ~400ms by default.
  await page.waitForTimeout(550);

  const tooltip = page.getByRole('tooltip').first();
  await expect(tooltip).toBeVisible();
  const tipBox = await tooltip.boundingBox();
  if (!tipBox) throw new Error('tooltip box missing');

  // The tooltip's right edge should be at most the button's left edge
  // (small ±2px tolerance for sub-pixel rounding).
  expect(tipBox.x + tipBox.width).toBeLessThanOrEqual(btnBox.x + 4);
});
