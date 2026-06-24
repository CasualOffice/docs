/**
 * Mobile pinch-to-zoom — pins the contract that a two-finger pinch
 * gesture on the editor area updates the zoom indicator in the
 * toolbar. Playwright doesn't have a direct multi-touch helper, so
 * we synthesize TouchEvent objects manually with two touch points.
 *
 * Desktop check: a pinch dispatched on desktop is ignored (the hook
 * is gated by matchMedia('(max-width: 720px)')).
 */
import { test, expect } from '@playwright/test';

/**
 * Dispatch start → move → end on the target element with two fingers,
 * simulating a pinch-out (zoom-in) by widening the finger distance.
 */
async function pinchOut(page: import('@playwright/test').Page, selector: string) {
  await page.evaluate((sel) => {
    const target = document.querySelector(sel) as HTMLElement;
    if (!target) throw new Error(`pinch target not found: ${sel}`);
    const rect = target.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const mk = (id: number, x: number, y: number): Touch =>
      // The Touch ctor signature varies by browser; this is the
      // Chromium-supported shape and is enough for our hook.
      new Touch({
        identifier: id,
        target,
        clientX: x,
        clientY: y,
        pageX: x,
        pageY: y,
        screenX: x,
        screenY: y,
        radiusX: 1,
        radiusY: 1,
        rotationAngle: 0,
        force: 1,
      });

    const dispatch = (type: string, touches: Touch[], changed: Touch[]) => {
      const ev = new TouchEvent(type, {
        cancelable: true,
        bubbles: true,
        touches,
        targetTouches: touches,
        changedTouches: changed,
      });
      target.dispatchEvent(ev);
    };

    // Start: fingers 40 px apart.
    const t1Start = mk(1, cx - 20, cy);
    const t2Start = mk(2, cx + 20, cy);
    dispatch('touchstart', [t1Start, t2Start], [t1Start, t2Start]);

    // Move: spread to 200 px apart → ratio = 5 → zoom should ×5,
    // then clamp by the hook to its MAX_ZOOM (3.0).
    const t1Mid = mk(1, cx - 100, cy);
    const t2Mid = mk(2, cx + 100, cy);
    dispatch('touchmove', [t1Mid, t2Mid], [t1Mid, t2Mid]);

    // End: lift both fingers.
    dispatch('touchend', [], [t1Mid, t2Mid]);
  }, selector);
}

test.describe('Mobile pinch-to-zoom', () => {
  test.describe('phone viewport — pinch updates zoom', () => {
    test.use({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });

    test('two-finger pinch-out raises the editor zoom', async ({ page }) => {
      await page.goto('/?e2e=1');
      await page.waitForSelector('[data-testid="docx-editor"]');
      await page.waitForTimeout(500);

      // Sample the initial zoom shown in the toolbar's zoom button.
      const initialZoomText = await page
        .locator('[data-testid="docx-editor"]')
        .locator('text=/^\\d+%$/')
        .first()
        .textContent();

      await pinchOut(page, '.ep-root.paged-editor');
      // The hook commits on touchend → React state update → toolbar re-renders.
      await page.waitForTimeout(400);

      const afterZoomText = await page
        .locator('[data-testid="docx-editor"]')
        .locator('text=/^\\d+%$/')
        .first()
        .textContent();

      const parsePct = (s: string | null) => Number((s ?? '').replace('%', ''));
      const initial = parsePct(initialZoomText);
      const after = parsePct(afterZoomText);
      // Pinch-out widens the fingers 5× → ratio 5 → zoom should jump
      // to MAX_ZOOM (300%) at the clamp.
      expect(after).toBeGreaterThan(initial);
      expect(after).toBeLessThanOrEqual(300);
    });
  });

  test.describe('desktop viewport — pinch ignored', () => {
    test.use({ viewport: { width: 1280, height: 800 }, hasTouch: true });

    test('two-finger pinch is a no-op (hook is mobile-gated)', async ({ page }) => {
      await page.goto('/?e2e=1');
      await page.waitForSelector('[data-testid="docx-editor"]');
      await page.waitForTimeout(500);

      const before = await page
        .locator('[data-testid="docx-editor"]')
        .locator('text=/^\\d+%$/')
        .first()
        .textContent();

      await pinchOut(page, '.ep-root.paged-editor');
      await page.waitForTimeout(400);

      const after = await page
        .locator('[data-testid="docx-editor"]')
        .locator('text=/^\\d+%$/')
        .first()
        .textContent();

      expect(after).toBe(before);
    });
  });
});
