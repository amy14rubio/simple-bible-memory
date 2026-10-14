import type { Database } from './Database';
import { migrate } from './migrate';
import { openWaSqlite } from './wasqlite';

export type { Database } from './Database';

/**
 * Single place that picks the platform adapter.
 * Browser: wa-sqlite on IndexedDB. Capacitor native adapter arrives in Phase 7.
 */
let opening: Promise<Database> | undefined;

/** Opens (and migrates) once per page load; later calls share the same connection. */
export function openAppDatabase(): Promise<Database> {
  opening ??= (async () => {
    const db = await openWaSqlite({ name: 'simple-bible-memory', storage: 'idb' });
    await migrate(db);
    requestPersistentStorage();
    return db;
  })();
  return opening;
}

/**
 * Browsers may delete a site's data when the device is low on space. Asking for "persistent" storage makes
 * that much less likely. It is a request, not a guarantee, and failing is harmless (native apps don't need it).
 */
function requestPersistentStorage() {
  try {
    void navigator.storage?.persist?.().catch(() => undefined);
  } catch {
    /* unsupported: ignore */
  }
}
