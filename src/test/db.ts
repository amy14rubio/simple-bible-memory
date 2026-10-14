import { readFileSync } from 'node:fs';
import { openWaSqlite } from '../data/database/wasqlite';
import { migrate } from '../data/database/migrate';
import type { Database } from '../data/database/Database';

const wasmBinary = readFileSync('node_modules/wa-sqlite/dist/wa-sqlite-async.wasm').buffer as ArrayBuffer;
let n = 0;

/** Fresh, migrated, in-memory database for tests. */
export async function createTestDatabase(): Promise<Database> {
  const db = await openWaSqlite({ name: `t${n++}`, storage: 'memory', wasmBinary });
  await migrate(db);
  return db;
}
