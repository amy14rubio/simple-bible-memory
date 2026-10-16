import type { Database } from './Database';
import init from '../migrations/0001_init.sql?raw';
import cardKinds from '../migrations/0002_card_kinds.sql?raw';
import sharing from '../migrations/0003_sharing.sql?raw';
import importedFrom from '../migrations/0004_imported_from.sql?raw';

/**
 * Migrations run in order, once each. SQLite keeps a built-in integer called
 * `user_version`; we store "how many migrations have run" there.
 * Rule: never edit a migration that has shipped - add a new one.
 */
export const MIGRATIONS: { version: number; sql: string }[] = [
  { version: 1, sql: init },
  { version: 2, sql: cardKinds },
  { version: 3, sql: sharing },
  { version: 4, sql: importedFrom },
];

export async function migrate(db: Database, migrations = MIGRATIONS): Promise<number> {
  const [row] = await db.query<{ user_version: number }>('PRAGMA user_version');
  const current = Number(row?.user_version ?? 0);

  const pending = migrations.filter((m) => m.version > current).sort((a, b) => a.version - b.version);
  for (const m of pending) {
    // Each migration is all-or-nothing, including the version bump.
    await db.transaction(async (tx) => {
      // Re-check inside the transaction: another tab may have migrated since we looked.
      const [now] = await tx.query<{ user_version: number }>('PRAGMA user_version');
      if (Number(now?.user_version) >= m.version) return;
      await tx.run(m.sql);
      await tx.run(`PRAGMA user_version = ${m.version}`);
    });
  }
  return pending.at(-1)?.version ?? current;
}
