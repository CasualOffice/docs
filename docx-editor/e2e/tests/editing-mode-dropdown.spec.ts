import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// Regression: the Editing/Suggesting/Viewing mode dropdown has bespoke
// positioning. Its triggerRef was swallowed by the <Tooltip> wrapper, so the
// position effect bailed and the menu rendered pinned at {0,0} — top-left,
// overlapping the menubar — instead of under its right-aligned trigger.
// Position is now computed in onClick from e.currentTarget.
test.describe('Editing mode dropdown', () => {
  test('opens anchored under its trigger, not at the page corner', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();

    const trigger = page.getByRole('button', { name: /Ctrl\+Shift\+E/ }).first();
    await expect(trigger).toHaveCount(1);
    const tb = await trigger.boundingBox();
    await trigger.click();
    await page.waitForTimeout(150);

    const drop = await page.evaluate(() => {
      const divs = Array.from(document.querySelectorAll('div')) as HTMLElement[];
      const d = divs.find(
        (e) =>
          getComputedStyle(e).position === 'fixed' &&
          +getComputedStyle(e).zIndex >= 9999 &&
          !!e.querySelector('button')
      );
      if (!d) return null;
      const r = d.getBoundingClientRect();
      return { top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right), vw: innerWidth };
    });

    expect(drop, 'mode dropdown should be open').not.toBeNull();
    // Not pinned to the top-left corner.
    expect(drop!.top).toBeGreaterThan(40);
    expect(drop!.left).toBeGreaterThan(400);
    // Just below the trigger, fully within the viewport.
    expect(Math.abs(drop!.top - Math.round((tb?.y ?? 0) + (tb?.height ?? 0)))).toBeLessThan(12);
    expect(drop!.right).toBeLessThanOrEqual(drop!.vw);
  });
});
