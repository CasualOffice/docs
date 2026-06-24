/**
 * Auto-reopen banner — Phase A from docs/internal/11-storage-modes.md.
 * "If there's a last-opened entry less than 7 days old, show
 * 'Reopen `report.docx`?' above the landing."
 *
 * The banner consumes the same IDB-backed recent-files store the
 * Recent section uses; tests seed that store via page.evaluate
 * (same pattern as home-recent-files.spec.ts).
 */
import { expect, test } from '@playwright/test';

async function seedRecent(
  page: import('@playwright/test').Page,
  opts: { name: string; openedAt: number },
) {
  await page.evaluate(async ({ name, openedAt }) => {
    // Keep in sync with packages/react/src/utils/idb.ts DOCS_DB_VERSION.
    const open = indexedDB.open('casual-docs', 3);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('autosave')) db.createObjectStore('autosave');
      if (!db.objectStoreNames.contains('recent-files')) {
        const os = db.createObjectStore('recent-files', { keyPath: 'id', autoIncrement: true });
        os.createIndex('openedAt', 'openedAt', { unique: false });
        os.createIndex('name', 'name', { unique: false });
      }
      if (!db.objectStoreNames.contains('versions')) {
        const os = db.createObjectStore('versions', { keyPath: 'id', autoIncrement: true });
        os.createIndex('savedAt', 'savedAt', { unique: false });
        os.createIndex('kind', 'kind', { unique: false });
        os.createIndex('docId', 'docId', { unique: false });
      }
    };
    await new Promise<void>((resolve, reject) => {
      open.onsuccess = () => resolve();
      open.onerror = () => reject(open.error);
    });
    const db = open.result;
    const tx = db.transaction('recent-files', 'readwrite');
    tx.objectStore('recent-files').add({
      name,
      buffer: new ArrayBuffer(2048),
      size: 2048,
      openedAt,
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }, opts);
}

test.describe('Auto-reopen banner', () => {
  test('renders when last-opened doc is fresh and reopens on click', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await seedRecent(page, {
      name: 'Project plan.docx',
      openedAt: Date.now() - 2 * 60_000, // 2 min ago
    });
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    const banner = page.getByTestId('auto-reopen-banner');
    await expect(banner).toBeVisible();
    await expect(page.getByTestId('auto-reopen-banner-name')).toContainText(
      'Project plan.docx',
    );

    // Reopen lands the user in the editor — the home page is gone.
    await page.getByTestId('auto-reopen-banner-open').click();
    await expect(page.getByTestId('home-page')).toBeHidden();
  });

  test('hides when the last-opened doc is older than 7 days', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await seedRecent(page, {
      name: 'Ancient draft.docx',
      // 8 days ago — past the 7-day window. Stays under the 60-day
      // stale cap so the Recent section still shows the card.
      openedAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
    });
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByTestId('home-page')).toBeVisible();
    await expect(page.getByTestId('auto-reopen-banner')).toBeHidden();
  });

  test('dismiss hides the banner + survives a reload via sessionStorage', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await seedRecent(page, {
      name: 'Drafts.docx',
      openedAt: Date.now() - 60_000,
    });
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByTestId('auto-reopen-banner')).toBeVisible();
    await page.getByTestId('auto-reopen-banner-dismiss').click();
    await expect(page.getByTestId('auto-reopen-banner')).toBeHidden();

    // Reload — dismissal is sticky for the session.
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('home-page')).toBeVisible();
    await expect(page.getByTestId('auto-reopen-banner')).toBeHidden();
  });

  test('renders nothing when no recent files exist', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('home-page')).toBeVisible();
    await expect(page.getByTestId('auto-reopen-banner')).toBeHidden();
  });
});
