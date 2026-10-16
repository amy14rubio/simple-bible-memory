import type { Database } from './database/Database';

/** Lets the rest of the app hear that something was saved, without the data layer knowing who is listening. */
const listeners = new Set<() => void>();
export const onDatabaseWrite = (callback: () => void) => { listeners.add(callback); return () => { listeners.delete(callback); }; };

/** The same database, but every write (a statement that changes data, or a finished transaction) is announced. */
export function watchWrites(db: Database): Database {
  const announce = () => listeners.forEach((l) => l());
  return {
    query: (sql, params) => db.query(sql, params),
    run: async (sql, params) => { await db.run(sql, params); announce(); },
    transaction: async (fn) => { const result = await db.transaction(fn); announce(); return result; },
    close: () => db.close(),
  };
}
