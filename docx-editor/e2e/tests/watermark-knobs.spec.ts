/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// C5 follow-up — color / opacity / font-size / rotation knobs in the
// watermark dialog. The painter already reads these fields; this spec
// just verifies the dialog plumbs them through.
test.describe('Insert > Watermark (knobs)', () => {
  test('apply with custom color/opacity/size/rotation reaches the overlay', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();

    // Open the dialog.
    await page.getByRole('button', { name: 'Insert', exact: true }).click();
    await page.waitForSelector('[role="menu"]', { state: 'visible', timeout: 4000 });
    await page.getByRole('menuitem', { name: /Watermark/ }).click();

    const dlg = page.getByTestId('watermark-dialog');
    await expect(dlg).toBeVisible();

    // Fill all knobs. Color input takes "#rrggbb"; the dialog strips the
    // hash before persisting so the painter receives the bare "rrggbb"
    // it expects.
    await page.getByTestId('watermark-text-input').fill('PROTOTYPE');
    await page.getByTestId('watermark-color-input').fill('#ff0000');
    // <input type="range"> sliders take values via .fill().
    await page.getByTestId('watermark-opacity-input').fill('80');
    await page.getByTestId('watermark-size-input').fill('120');
    await page.getByTestId('watermark-rotation-input').fill('-30');
    await page.screenshot({ path: 'screenshots/c5-knobs-dialog.png' });
    await page.getByTestId('watermark-apply').click();

    // The painter renders the watermark overlay as a span inside
    // `.layout-page-watermark`. Inline styles carry the dialog values.
    const overlay = page.locator('.layout-page-watermark span').first();
    await expect(overlay).toHaveText('PROTOTYPE');
    const style = await overlay.evaluate((el) => {
      const s = (el as HTMLElement).style;
      return {
        color: s.color,
        opacity: s.opacity,
        fontSize: s.fontSize,
        transform: s.transform,
      };
    });
    expect(style.color).toMatch(/#ff0000|rgb\(255,\s*0,\s*0\)/i);
    expect(style.opacity).toBe('0.8');
    expect(style.fontSize).toBe('120px');
    expect(style.transform).toMatch(/rotate\(-30deg\)/);
    await page.screenshot({ path: 'screenshots/c5-knobs-applied.png' });
  });
});
