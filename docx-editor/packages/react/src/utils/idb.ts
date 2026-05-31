/**
 * Shared IndexedDB handle for editor-local state — autosave, recent
 * files, future per-doc version history, etc. Lives in one named DB
 * (`casual-docs`) with multiple object stores so the version handshake
 * stays in one place; modules import the opener instead of touching
 * `indexedDB.open` directly.
 *
 * Mirrors `services/sheet/apps/web/src/autosave/store.ts`'s "modules
 * share this IDB; MUST agree on a single version" pattern.
 *
 * On version bump: add the new `objectStore` creation here (idempotent
 * via the `contains()` guard) and increment `VERSION`.
 */

export const DOCS_DB_NAME = 'casual-docs';

// v1: autosave store
// v2: recent-files store added
export const DOCS_DB_VERSION = 2;

export const STORE_AUTOSAVE = 'autosave';
export const STORE_RECENT_FILES = 'recent-files';

export function openDocsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DOCS_DB_NAME, DOCS_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Idempotent — each existing store is preserved across upgrades.
      if (!db.objectStoreNames.contains(STORE_AUTOSAVE)) {
        db.createObjectStore(STORE_AUTOSAVE);
      }
      if (!db.objectStoreNames.contains(STORE_RECENT_FILES)) {
        const os = db.createObjectStore(STORE_RECENT_FILES, {
          keyPath: 'id',
          autoIncrement: true,
        });
        os.createIndex('openedAt', 'openedAt', { unique: false });
        os.createIndex('name', 'name', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('open db failed'));
  });
}
