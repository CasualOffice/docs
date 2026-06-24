import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// Autosave + restore banner. The banner only appears when a record
// exists in IndexedDB. We seed a record by stuffing the IDB directly,
// then reload and assert the banner shows with the right prompt.
test.describe('Autosave restore banner', () => {
  test('hidden when no autosave record exists', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await expect(page.getByTestId('autosave-banner')).toHaveCount(0);
  });

  test('shows after a record is written; Discard hides it', async ({ page }) => {
    // First boot to ensure the IDB is open.
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();

    // Stuff a tiny record into IDB directly. The buffer content doesn't
    // matter for the banner's display logic — only the name + savedAt.
    await page.evaluate(async () => {
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
      const tx = db.transaction('autosave', 'readwrite');
      tx.objectStore('autosave').put(
        {
          name: 'My draft.docx',
          buffer: new ArrayBuffer(8),
          savedAt: Date.now() - 5 * 60_000, // 5 minutes ago
        },
        'current'
      );
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    });

    await page.reload();
    await editor.waitForReady();
    const banner = page.getByTestId('autosave-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('My draft.docx');
    await expect(banner).toContainText(/5 min ago|moments ago/);

    await page.getByTestId('autosave-discard').click();
    await expect(banner).toHaveCount(0);
  });

  test('stale records (>24h) are auto-discarded', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();

    await page.evaluate(async () => {
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
      const tx = db.transaction('autosave', 'readwrite');
      tx.objectStore('autosave').put(
        {
          name: 'Ancient.docx',
          buffer: new ArrayBuffer(8),
          savedAt: Date.now() - 48 * 60 * 60 * 1000, // 48 h ago
        },
        'current'
      );
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    });

    await page.reload();
    await editor.waitForReady();
    await expect(page.getByTestId('autosave-banner')).toHaveCount(0);
  });
});
