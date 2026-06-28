/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * AutosaveStatus end-to-end: drives the useFileSourceAutoSave hook
 * via the `?e2e=autosave` fixture in examples/vite/src/App.tsx +
 * mocked /files/:id/contents, and asserts the AutosaveStatus
 * component reflects the lifecycle.
 *
 * The fixture exposes window.__autosaveE2E.flush() so the spec can
 * trigger a save deterministically (the hook's interval is disabled
 * with interval=0 inside the fixture to keep timing predictable).
 */
import { expect, test } from '@playwright/test';

async function mockAuthAlwaysSignedIn(page: import('@playwright/test').Page) {
  await page.route('**/auth/me', async (route) => {
    // collab wraps /auth/me as { user } with a numeric id + username.
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { id: 42, username: 'alex', isAdmin: false, createdAt: 1_700_000_000_000 },
      }),
    });
  });
}

async function flush(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    const hook = (window as unknown as { __autosaveE2E?: { flush: () => Promise<void> } })
      .__autosaveE2E;
    if (!hook) throw new Error('window.__autosaveE2E missing — fixture not wired');
    await hook.flush();
  });
}

test.describe('AutosaveStatus', () => {
  test('renders nothing before any save lands', async ({ page }) => {
    await mockAuthAlwaysSignedIn(page);
    // No /files/:id/contents route — there's no flush in this test,
    // so the route is never hit.
    await page.goto('/?e2e=autosave');
    await expect(page.getByTestId('signed-in-content')).toBeVisible();
    // The status component renders nothing on idle + no save yet.
    await expect(page.getByTestId('autosave-status')).toBeHidden();
  });

  test('saves PUT bytes + status transitions to "Saved just now"', async ({ page }) => {
    await mockAuthAlwaysSignedIn(page);
    let putCalled = false;
    let putSize = 0;
    await page.route('**/files/autosave-doc/contents', async (route) => {
      const req = route.request();
      putCalled = true;
      putSize = (req.postDataBuffer() ?? Buffer.from([])).byteLength;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ version: 3 }),
      });
    });
    await page.goto('/?e2e=autosave');
    await expect(page.getByTestId('signed-in-content')).toBeVisible();

    await flush(page);

    await expect(page.getByTestId('autosave-status')).toHaveAttribute('data-status', 'saved');
    await expect(page.getByTestId('autosave-status')).toContainText(/saved/i);
    expect(putCalled).toBe(true);
    expect(putSize).toBe(4);
  });

  test('status flips to "Save failed" on a 500 + recovers on next success', async ({ page }) => {
    await mockAuthAlwaysSignedIn(page);
    let failOnce = true;
    await page.route('**/files/autosave-doc/contents', async (route) => {
      if (failOnce) {
        failOnce = false;
        await route.fulfill({ status: 500, body: 'boom' });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ version: 2 }),
        });
      }
    });
    await page.goto('/?e2e=autosave');
    await expect(page.getByTestId('signed-in-content')).toBeVisible();

    await flush(page);
    await expect(page.getByTestId('autosave-status')).toHaveAttribute('data-status', 'error');
    await expect(page.getByTestId('autosave-status')).toContainText(/save failed/i);

    await flush(page);
    await expect(page.getByTestId('autosave-status')).toHaveAttribute('data-status', 'saved');
  });
});
