import SQLiteAsyncESMFactory from 'wa-sqlite/dist/wa-sqlite-async.mjs';
import * as SQLite from 'wa-sqlite';
import { IDBBatchAtomicVFS } from 'wa-sqlite/src/examples/IDBBatchAtomicVFS.js';
import { MemoryAsyncVFS } from 'wa-sqlite/src/examples/MemoryAsyncVFS.js';
import type { Database, SqlValue } from './Database';

export interface WaSqliteOptions {
  /** Database name. With 'idb' this becomes the IndexedDB database name. */
  name: string;
  /**
   * 'idb': persistent (SQLite pages stored in IndexedDB) - used in the browser.
   * 'memory': throwaway - used by unit tests.
   */
  storage: 'idb' | 'memory';
  /** Tests (Node) pass the .wasm bytes; browsers fetch them automatically. */
  wasmBinary?: ArrayBuffer;
}

export async function openWaSqlite({ name, storage, wasmBinary }: WaSqliteOptions): Promise<Database> {
  const module = await SQLiteAsyncESMFactory(wasmBinary ? { wasmBinary } : undefined);
  const sqlite3 = SQLite.Factory(module);

  const vfs =
    storage === 'idb'
      ? new IDBBatchAtomicVFS(`${name}-idb`, { durability: 'strict' })
      : new MemoryAsyncVFS();
  sqlite3.vfs_register(vfs as unknown as SQLiteVFS, true);

  const handle = await sqlite3.open_v2(`${name}.db`);

  // One statement at a time: SQLite has one connection, so we queue calls
  // (like a mutex). Without this, two overlapping transactions would interleave.
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
    const result = queue.then(fn, fn);
    queue = result.catch(() => undefined);
    return result;
  };

  const rawQuery = async <T>(sql: string, params: SqlValue[] = []): Promise<T[]> => {
    const rows: T[] = [];
    for await (const stmt of sqlite3.statements(handle, sql)) {
      if (params.length > 0) sqlite3.bind_collection(stmt, params);
      const columns = sqlite3.column_names(stmt);
      while ((await sqlite3.step(stmt)) === SQLite.SQLITE_ROW) {
        const values = sqlite3.row(stmt);
        rows.push(Object.fromEntries(columns.map((c, i) => [c, values[i]])) as T);
      }
    }
    return rows;
  };

  // Foreign keys are OFF by default in SQLite and are per-connection.
  await rawQuery('PRAGMA foreign_keys = ON');

  const inner: Database = {
    query: rawQuery,
    run: async (sql, params) => void (await rawQuery(sql, params)),
    transaction: () => {
      throw new Error('Nested transactions are not supported');
    },
    close: async () => {},
  };

  return {
    query: (sql, params) => enqueue(() => rawQuery(sql, params)),
    run: (sql, params) => enqueue(async () => void (await rawQuery(sql, params))),
    transaction: (fn) =>
      enqueue(async () => {
        await rawQuery('BEGIN');
        try {
          const result = await fn(inner);
          await rawQuery('COMMIT');
          return result;
        } catch (err) {
          await rawQuery('ROLLBACK');
          throw err;
        }
      }),
    close: () => enqueue(async () => void (await sqlite3.close(handle))),
  };
}
