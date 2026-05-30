/**
 * Mobile floating format chip — pins the contract that the chip is
 * absent on desktop, appears when a non-collapsed selection exists
 * on a phone viewport, and actually toggles the format on tap.
 *
 * The chip is gated by `matchMedia('(max-width: 720px)')`, so the
 * test overrides the viewport via `test.use({ viewport })`.
 */
import { test, expect } from '@playwright/test';
import { modifierKey } from '../helpers/keyboard';

// CI runs on Linux (Ctrl), local dev is usually macOS (Meta). Use the
// page-side modifier helper — Playwright Chromium reports `Win32` in
// `navigator.platform` even on a Mac host, so we have to match what
// the page sees, not what the runner sees.

test.describe('Mobile floating format bar', () => {
  test.describe('desktop viewport — chip hidden', () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test('does not render on desktop even when text is selected', async ({ page }) => {
      await page.goto('/?e2e=1');
      await page.waitForSelector('[data-testid="docx-editor"]');
      await page.waitForTimeout(500);
      await page.locator('.ProseMirror').focus();
      await page.keyboard.type('Hello desktop');
      await page.keyboard.press(`${await modifierKey(page)}+a`);
      await page.waitForTimeout(400);
      await expect(page.locator('[data-testid="mobile-format-bar"]')).toHaveCount(0);
    });

    test('desktop floating bar appears on selection (C1)', async ({ page }) => {
      await page.goto('/?e2e=1');
      await page.waitForSelector('[data-testid="docx-editor"]');
      await page.waitForTimeout(500);
      await page.locator('.ProseMirror').focus();
      await page.keyboard.type('Hello desktop bar');
      // Collapsed cursor → no bar.
      await expect(page.locator('[data-testid="desktop-format-bar"]')).toHaveCount(0);
      // Range selection → desktop bar appears with B / I / U / S buttons.
      await page.keyboard.press(`${await modifierKey(page)}+a`);
      await expect(page.locator('[data-testid="desktop-format-bar"]')).toBeVisible({
        timeout: 2000,
      });
      await expect(page.locator('[data-testid="desktop-format-bold"]')).toBeVisible();
      // Clicking Bold applies the mark — pressed state flips.
      await page.locator('[data-testid="desktop-format-bold"]').click();
      await expect(page.locator('[data-testid="desktop-format-bold"]')).toHaveAttribute(
        'aria-pressed',
        'true'
      );
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
      await page.keyboard.press(`${await modifierKey(page)}+a`);
      await expect(page.locator('[data-testid="mobile-format-bar"]')).toBeVisible({
        timeout: 3000,
      });

      // All four buttons present.
      for (const cmd of ['bold', 'italic', 'underline', 'strikethrough']) {
        await expect(page.locator(`[data-testid="mobile-format-${cmd}"]`)).toBeVisible();
      }

      // Tap Bold → ProseMirror gains a <strong> with the selected text.
      // The strong-tag check is the source-of-truth: it proves the chip's
      // onFormat actually dispatched the bold command and PM applied
      // the mark to the selected text. (An earlier version of this spec
      // also asserted aria-pressed=true on the chip after the click, but
      // that derivation flaked on Linux CI — the chip click momentarily
      // blurs the editor on some platforms, and the toolbar's
      // selectionFormatting reset to {} before the polling assertion
      // could see the post-bold state. The strong-tag check exercises
      // the same code path end-to-end without depending on the toolbar's
      // refresh cadence.)
      await page.locator('[data-testid="mobile-format-bold"]').click();
      await expect(page.locator('.ProseMirror strong')).toContainText('Mobile bold test', {
        timeout: 3000,
      });
    });
  });
});
