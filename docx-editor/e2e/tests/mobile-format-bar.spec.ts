/**
 * Mobile floating format chip — pins the contract that the chip is
 * absent on desktop, appears when a non-collapsed selection exists
 * on a phone viewport, and actually toggles the format on tap.
 *
 * The chip is gated by `matchMedia('(max-width: 720px)')`, so the
 * test overrides the viewport via `test.use({ viewport })`.
 */
import { test, expect } from '@playwright/test';

// CI runs on Linux (Ctrl), local dev is usually macOS (Meta). Use the
// platform modifier Playwright already detected so the same spec runs
// on both.
const SELECT_ALL_MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

test.describe('Mobile floating format bar', () => {
  test.describe('desktop viewport — chip hidden', () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test('does not render on desktop even when text is selected', async ({ page }) => {
      await page.goto('/?e2e=1');
      await page.waitForSelector('[data-testid="docx-editor"]');
      await page.waitForTimeout(500);
      await page.locator('.ProseMirror').focus();
      await page.keyboard.type('Hello desktop');
      await page.keyboard.press(`${SELECT_ALL_MOD}+a`);
      await page.waitForTimeout(400);
      await expect(page.locator('[data-testid="mobile-format-bar"]')).toHaveCount(0);
    });
  });

  test.describe('phone viewport — chip appears + tap formats', () => {
    test.use({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });

    test('chip appears on range selection, hides on collapse, bold applies on tap', async ({
      page,
    }) => {
      await page.goto('/?e2e=1');
      await page.waitForSelector('[data-testid="docx-editor"]');
      await page.waitForTimeout(500);
      await page.locator('.ProseMirror').focus();
      await page.keyboard.type('Mobile bold test');
      await page.waitForTimeout(300);

      // Caret (collapsed) — no chip yet.
      await expect(page.locator('[data-testid="mobile-format-bar"]')).toHaveCount(0);

      // Range selection — chip should appear.
      await page.keyboard.press(`${SELECT_ALL_MOD}+a`);
      await expect(page.locator('[data-testid="mobile-format-bar"]')).toBeVisible({
        timeout: 3000,
      });

      // All four buttons present.
      for (const cmd of ['bold', 'italic', 'underline', 'strikethrough']) {
        await expect(page.locator(`[data-testid="mobile-format-${cmd}"]`)).toBeVisible();
      }

      // Tap Bold → ProseMirror gains a <strong> with the selected text.
      await page.locator('[data-testid="mobile-format-bold"]').click();
      await expect(page.locator('.ProseMirror strong')).toContainText('Mobile bold test', {
        timeout: 3000,
      });

      // aria-pressed reflects the formatting at the *current* selection.
      // On some platforms the chip click can briefly blur the editor —
      // re-focus and re-select so the formatting derivation runs against
      // an active selection covering the (now-bold) text.
      await page.locator('.ProseMirror').focus();
      await page.keyboard.press(`${SELECT_ALL_MOD}+a`);
      await expect(page.locator('[data-testid="mobile-format-bold"]')).toHaveAttribute(
        'aria-pressed',
        'true',
        { timeout: 3000 }
      );
    });
  });
});
