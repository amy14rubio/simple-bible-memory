import { describe, it, expect, beforeEach } from 'vitest';
import { openWaSqlite } from './wasqlite';
import { migrate, MIGRATIONS } from './migrate';
import { readFileSync } from 'node:fs';
import type { Database } from './Database';

const wasmBinary = readFileSync('node_modules/wa-sqlite/dist/wa-sqlite-async.wasm').buffer as ArrayBuffer;

let db: Database;
let n = 0;
beforeEach(async () => {
  db = await openWaSqlite({ name: `test-${n++}`, storage: 'memory', wasmBinary });
});

describe('migrations', () => {
  it('applies all migrations and sets user_version', async () => {
    const v = await migrate(db);
    expect(v).toBe(MIGRATIONS.at(-1)!.version);
    const [row] = await db.query<{ user_version: number }>('PRAGMA user_version');
    expect(row!.user_version).toBe(v);
  });

  it('is idempotent: running twice does not fail or change data', async () => {
    await migrate(db);
    await db.run("INSERT INTO settings (key, value) VALUES ('a', '1')");
    await migrate(db);
    expect(await db.query('SELECT * FROM settings')).toHaveLength(1);
  });

  it('rolls back a failing migration, including the version bump', async () => {
    const bad = [{ version: 1, sql: 'CREATE TABLE t (id TEXT); THIS IS NOT SQL;' }];
    await expect(migrate(db, bad)).rejects.toThrow();
    const [row] = await db.query<{ user_version: number }>('PRAGMA user_version');
    expect(row!.user_version).toBe(0);
    expect(await db.query("SELECT name FROM sqlite_master WHERE name = 't'")).toHaveLength(0);
  });

  it('upgrades an existing database without losing data', async () => {
    await migrate(db);
    await db.run("INSERT INTO settings (key, value) VALUES ('keep', '\"me\"')");
    const next = [...MIGRATIONS, { version: 99, sql: 'ALTER TABLE decks ADD COLUMN extra TEXT' }];
    await migrate(db, next);
    expect(await db.query("SELECT value FROM settings WHERE key = 'keep'")).toEqual([{ value: '"me"' }]);
  });
});

describe('migration 0002 (card kinds)', () => {
  it('keeps existing schedules and reviews, assigning them to the recall kind', async () => {
    await migrate(db, MIGRATIONS.filter((m) => m.version === 1)); // a database from before card kinds
    await db.run("INSERT INTO decks (id, title, created_at, updated_at) VALUES ('d', 'D', 0, 0)");
    await db.run("INSERT INTO cards (id, reference, verse_text, created_at, updated_at) VALUES ('c', 'John 3:16', 'x', 0, 0)");
    await db.run("INSERT INTO deck_cards (deck_id, card_id, added_at) VALUES ('d', 'c', 0)");
    await db.run("INSERT INTO card_schedule VALUES ('c', 123, 4.5, 6.7, 2, 3, 1, 0, 9, 100, 'old-engine')");
    await db.run("INSERT INTO review_logs VALUES ('l', 'c', 100, 3, 'type', 1, 50, 4.5, 6.7, 9, 2)");

    expect(await migrate(db)).toBe(MIGRATIONS.at(-1)!.version); // runs migration 0002 (and any after it) on top of version 1

    expect(await db.query('SELECT * FROM card_schedule')).toEqual([
      { card_id: 'c', kind: 'recall', due: 123, stability: 4.5, difficulty: 6.7, state: 2, reps: 3, lapses: 1, learning_steps: 0, scheduled_days: 9, last_review: 100, scheduler_version: 'old-engine' },
    ]);
    expect(await db.query<{ id: string; kind: string; rating: number }>('SELECT id, kind, rating FROM review_logs')).toEqual([{ id: 'l', kind: 'recall', rating: 3 }]);
    // the new schedule key allows a second card kind for the same verse, but not a duplicate of the same kind
    await db.run("INSERT INTO card_schedule VALUES ('c', 'identify', 1, 1, 1, 0, 0, 0, 0, 0, NULL, 'x')");
    await expect(db.run("INSERT INTO card_schedule VALUES ('c', 'identify', 1, 1, 1, 0, 0, 0, 0, 0, NULL, 'x')")).rejects.toThrow();
    await expect(db.run("INSERT INTO card_schedule VALUES ('c', 'bogus', 1, 1, 1, 0, 0, 0, 0, 0, NULL, 'x')")).rejects.toThrow();
  });

  it('deleting a card removes both of its schedules', async () => {
    await migrate(db);
    await db.run("INSERT INTO cards (id, reference, verse_text, created_at, updated_at) VALUES ('c', 'r', 'v', 0, 0)");
    for (const kind of ['recall', 'identify']) await db.run(`INSERT INTO card_schedule VALUES ('c', '${kind}', 1, 1, 1, 0, 0, 0, 0, 0, NULL, 'x')`);
    await db.run("DELETE FROM cards WHERE id = 'c'");
    expect(await db.query('SELECT 1 FROM card_schedule')).toHaveLength(0);
  });
});

describe('schema constraints', () => {
  const deck = (id: string) =>
    db.run('INSERT INTO decks (id, title, created_at, updated_at) VALUES (?, ?, 0, 0)', [id, 't']);
  const card = (id: string) =>
    db.run('INSERT INTO cards (id, reference, verse_text, created_at, updated_at) VALUES (?, ?, ?, 0, 0)', [id, 'r', 'v']);
  const schedule = (id: string) =>
    db.run(
      `INSERT INTO card_schedule (card_id, kind, due, stability, difficulty, state, reps, lapses, learning_steps, scheduled_days, scheduler_version)
       VALUES (?, 'recall', 0, 0, 0, 0, 0, 0, 0, 0, 'x')`,
      [id],
    );
  const log = (id: string, cardId: string) =>
    db.run(
      `INSERT INTO review_logs (id, card_id, reviewed_at, rating, study_mode, state_before, due_before, stability, difficulty, scheduled_days, elapsed_days)
       VALUES (?, ?, 0, 3, 'flashcard', 0, 0, 1, 1, 1, 0)`,
      [id, cardId],
    );

  beforeEach(() => migrate(db));

  it('enforces foreign keys (no orphan schedule, logs or memberships)', async () => {
    await expect(schedule('missing')).rejects.toThrow();
    await expect(log('l1', 'missing')).rejects.toThrow();
    await expect(
      db.run('INSERT INTO deck_cards (deck_id, card_id, added_at) VALUES (?, ?, 0)', ['nope', 'nope']),
    ).rejects.toThrow();
  });

  it('deleting a card cascades to its schedule, logs and memberships', async () => {
    await deck('d'); await card('c'); await schedule('c'); await log('l', 'c');
    await db.run('INSERT INTO deck_cards (deck_id, card_id, added_at) VALUES (?, ?, 0)', ['d', 'c']);
    await db.run('DELETE FROM cards WHERE id = ?', ['c']);
    for (const t of ['card_schedule', 'review_logs', 'deck_cards']) {
      expect(await db.query(`SELECT 1 FROM ${t}`)).toHaveLength(0);
    }
  });

  it('rejects invalid ratings and modes', async () => {
    await card('c');
    await expect(
      db.run(`INSERT INTO review_logs VALUES ('x','c',0,5,'flashcard',0,0,1,1,1,0)`),
    ).rejects.toThrow();
    await expect(
      db.run(`INSERT INTO review_logs VALUES ('y','c',0,3,'speak',0,0,1,1,1,0)`),
    ).rejects.toThrow();
  });
});

describe('transactions', () => {
  it('commits on success and rolls back on error', async () => {
    await migrate(db);
    await db.transaction((tx) => tx.run("INSERT INTO settings VALUES ('ok', '1')"));
    await expect(
      db.transaction(async (tx) => {
        await tx.run("INSERT INTO settings VALUES ('lost', '1')");
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const keys = (await db.query<{ key: string }>('SELECT key FROM settings')).map((r) => r.key);
    expect(keys).toEqual(['ok']);
  });
});
