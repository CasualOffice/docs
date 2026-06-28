/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { test, expect } from '@playwright/test';

// Recent files section on Home — IDB-backed; seed a record, reload,
// assert the section renders the right card.
test('Home shows a Recent section seeded from IndexedDB', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

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
    const tx = db.transaction('recent-files', 'readwrite');
    tx.objectStore('recent-files').add({
      name: 'Quarterly report',
      buffer: new ArrayBuffer(2048),
      size: 2048,
      openedAt: Date.now() - 2 * 60_000,
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });

  await page.reload();
  await page.waitForLoadState('domcontentloaded');

  const section = page.getByTestId('home-recent');
  await expect(section).toBeVisible();
  await expect(section).toContainText('Quarterly report');
  await expect(section).toContainText(/2 min ago/);
});
