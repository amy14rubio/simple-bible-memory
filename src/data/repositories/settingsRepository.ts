import type { Database } from '../database/Database';

export interface SettingsRepository {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
}

/** Values are stored JSON-encoded so any setting can be a string, number, object, etc. */
export function createSettingsRepository(db: Database, now: () => number = Date.now): SettingsRepository {
  return {
    async get<T>(key: string) {
      const rows = await db.query<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
      return rows[0] ? (JSON.parse(rows[0].value) as T) : undefined;
    },
    async set(key, value) {
      await db.run(
        'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
        [key, JSON.stringify(value), now()],
      );
    },
  };
}
