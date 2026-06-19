import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

test.describe('Help menu', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
  });

  test('Help > Report issue opens GitHub issues URL with pre-filled body', async ({ page }) => {
    await page.evaluate(() => {
      (window as unknown as { __lastOpenedUrl?: string }).__lastOpenedUrl = undefined;
      window.open = ((url?: string | URL) => {
        (window as unknown as { __lastOpenedUrl?: string }).__lastOpenedUrl = String(url ?? '');
        return null;
      }) as typeof window.open;
    });

    await page.getByRole('button', { name: 'Help' }).click();
    await page.getByRole('menuitem', { name: 'Report issue' }).click();

    // DocxEditor.handleReportBug dynamically imports report-bug.ts, so
    // window.open fires on a microtask after the click. Wait for the
    // stub to capture the URL instead of reading immediately.
    await page.waitForFunction(
      () => (window as unknown as { __lastOpenedUrl?: string }).__lastOpenedUrl !== undefined,
      { timeout: 5000 }
    );
    const openedUrl = await page.evaluate(
      () => (window as unknown as { __lastOpenedUrl?: string }).__lastOpenedUrl
    );
    expect(openedUrl).toBeDefined();

    const url = new URL(openedUrl!);
    // Help > Report issue points at this fork's tracker via
    // packages/react/src/components/report-bug.ts (the DocxEditor's
    // onReportBug handler dynamic-imports it).
    expect(url.origin + url.pathname).toBe('https://github.com/CasualOffice/docs/issues/new');

    // report-bug.ts routes to GitHub's structured issue form (bug.yml)
    // and labels the issue; the pre-fill happens via the form fields,
    // not body text. The env param carries browser + viewport for triage.
    expect(url.searchParams.get('template')).toBe('bug.yml');
    expect(url.searchParams.get('labels')).toBe('bug');
    expect(url.searchParams.get('url')).toBeTruthy();
    const env = url.searchParams.get('env') ?? '';
    expect(env).toContain('viewport');
  });

  test('Help > Search the menus opens the command palette', async ({ page }) => {
    await page.getByRole('button', { name: 'Help' }).click();
    await page.getByRole('menuitem', { name: 'Search the menus' }).click();
    await expect(page.getByTestId('command-palette-input')).toBeVisible({ timeout: 3000 });
  });

  test('Help > Keyboard shortcuts opens the shortcuts dialog', async ({ page }) => {
    await page.getByRole('button', { name: 'Help' }).click();
    await page.getByRole('menuitem', { name: 'Keyboard shortcuts' }).click();
    await expect(page.getByRole('dialog', { name: 'Keyboard Shortcuts' })).toBeVisible({
      timeout: 3000,
    });
  });

  // X3 — menu items must show a visible focus ring under keyboard navigation
  // (MenuDropdown moves DOM focus between items on Arrow keys).
  test('menu items show a focus ring on keyboard navigation', async ({ page }) => {
    await page.getByRole('button', { name: 'Help' }).click();
    await page.keyboard.press('ArrowDown');
    const ring = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return { role: null as string | null, width: '0px', style: 'none' };
      const cs = getComputedStyle(el);
      return {
        role: el.getAttribute('role'),
        width: cs.outlineWidth,
        style: cs.outlineStyle,
      };
    });
    expect(ring.role).toBe('menuitem');
    expect(parseFloat(ring.width)).toBeGreaterThan(0);
    expect(ring.style).toBe('solid');
  });
});
