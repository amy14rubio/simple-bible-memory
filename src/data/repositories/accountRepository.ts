import type { Database, SqlValue } from '../database/Database';
import { SETTING_KEYS, itemKey, makeItem, type Doc, type Entity, type Item } from '../../domain/account/items';

type Row = Record<string, SqlValue>;

/** What was last agreed with the account for one item. */
export interface AgreedState { hash: string; updatedAt: number }

/**
 * The local half of keeping an account's data in step: reads everything that is backed up in its canonical form, writes
 * what arrives from the account into the normal tables, and remembers what was last agreed so only changes are sent.
 * It uses the plain database (not the one that announces writes): the sync engine announces once after it has applied
 * a whole batch.
 */
export interface AccountRepository {
  /** Everything on this device that is backed up. */
  items(): Promise<Item[]>;
  item(entity: Entity, id: string): Promise<Item | undefined>;
  agreed(): Promise<Map<string, AgreedState>>;
  setAgreed(entries: { key: string; hash: string; updatedAt: number }[]): Promise<void>;
  forget(keys: string[]): Promise<void>;
  /** Writes what the account has into the tables. `null` removes it. */
  apply(entity: Entity, id: string, doc: Doc | null): Promise<void>;
  getMeta(key: string): Promise<string | undefined>;
  setMeta(key: string, value: string | null): Promise<void>;
  /** Forgets what was agreed (but keeps the data), so the next pass sends everything. */
  resetAgreed(): Promise<void>;
  hasDecks(): Promise<boolean>;
  /** Removes every deck, card and schedule from this device (and what was agreed). Settings stay. */
  wipe(): Promise<void>;
}

export function createAccountRepository(db: Database): AccountRepository {
  /** Reads items in their canonical form: everything, or just one thing (`only`). */
  async function itemsOf(q: Database, only?: { entity: Entity; id: string }): Promise<Item[]> {
    const items: Item[] = [];
    const push = (entity: Entity, id: string, raw: unknown) => { const it = makeItem(entity, id, raw); if (it) items.push(it); };
    const want = (entity: Entity) => !only || only.entity === entity;
    const where = (column: string, entity: Entity) => (only && only.entity === entity ? { sql: ` WHERE ${column} = ?`, params: [only.id] as SqlValue[] } : { sql: '', params: [] as SqlValue[] });

    if (want('deck')) {
      const w = where('id', 'deck');
      for (const r of await q.query<Row>(`SELECT id, title, description, bible_language, translation_code, created_at, updated_at, publish_id, imported_from FROM decks${w.sql}`, w.params)) {
        push('deck', r.id as string, { title: r.title, description: r.description, translation: r.translation_code, language: r.bible_language, publishId: r.publish_id, importedFrom: r.imported_from, createdAt: r.created_at, updatedAt: r.updated_at });
      }
    }

    if (want('card')) {
      const memberships = new Map<string, { deckId: string; addedAt: number }[]>();
      const w = where('card_id', 'card');
      for (const r of await q.query<Row>(`SELECT deck_id, card_id, added_at FROM deck_cards${w.sql}`, w.params)) {
        const list = memberships.get(r.card_id as string) ?? [];
        list.push({ deckId: r.deck_id as string, addedAt: r.added_at as number });
        memberships.set(r.card_id as string, list);
      }
      const wc = where('id', 'card');
      for (const r of await q.query<Row>(`SELECT id, reference, verse_text, note, created_at, updated_at FROM cards${wc.sql}`, wc.params)) {
        const decks = memberships.get(r.id as string);
        if (decks) push('card', r.id as string, { reference: r.reference, verseText: r.verse_text, note: r.note, createdAt: r.created_at, updatedAt: r.updated_at, decks });
      }
    }

    if (want('schedule')) {
      let sql = 'SELECT * FROM card_schedule WHERE card_id IN (SELECT card_id FROM deck_cards)';
      const params: SqlValue[] = [];
      if (only?.entity === 'schedule') {
        const cut = only.id.lastIndexOf('~');
        sql += ' AND card_id = ? AND kind = ?';
        params.push(only.id.slice(0, cut), only.id.slice(cut + 1));
      }
      for (const r of await q.query<Row>(sql, params)) {
        push('schedule', `${r.card_id}~${r.kind}`, {
          cardId: r.card_id, kind: r.kind, due: r.due, stability: r.stability, difficulty: r.difficulty, state: r.state, reps: r.reps, lapses: r.lapses,
          learningSteps: r.learning_steps, scheduledDays: r.scheduled_days, lastReview: r.last_review, version: r.scheduler_version, updatedAt: (r.last_review as number | null) ?? 0,
        });
      }
    }

    if (want('setting')) {
      const keys = only?.entity === 'setting' ? [only.id] : [...SETTING_KEYS];
      for (const r of await q.query<Row>(`SELECT key, value, updated_at FROM settings WHERE key IN (${keys.map(() => '?').join(',')})`, keys)) {
        let value: unknown;
        try { value = JSON.parse(r.value as string); } catch { continue; }
        push('setting', r.key as string, { key: r.key, value, updatedAt: r.updated_at });
      }
    }
    return items;
  }

  return {
    items: () => itemsOf(db),

    async item(entity, id) {
      return (await itemsOf(db, { entity, id }))[0];
    },

    async agreed() {
      const m = new Map<string, AgreedState>();
      for (const r of await db.query<Row>('SELECT item, hash, updated_at FROM account_sync_state')) m.set(r.item as string, { hash: r.hash as string, updatedAt: r.updated_at as number });
      return m;
    },

    async setAgreed(entries) {
      await db.transaction(async (tx) => {
        for (const e of entries) {
          await tx.run('INSERT INTO account_sync_state (item, hash, updated_at) VALUES (?, ?, ?) ON CONFLICT(item) DO UPDATE SET hash = excluded.hash, updated_at = excluded.updated_at', [e.key, e.hash, e.updatedAt]);
        }
      });
    },

    async forget(keys) {
      await db.transaction(async (tx) => { for (const k of keys) await tx.run('DELETE FROM account_sync_state WHERE item = ?', [k]); });
    },

    async apply(entity, id, doc) {
      await db.transaction(async (tx) => {
        if (entity === 'deck') {
          if (!doc) {
            const cardIds = (await tx.query<Row>('SELECT card_id FROM deck_cards WHERE deck_id = ?', [id])).map((r) => r.card_id as string);
            await tx.run('DELETE FROM decks WHERE id = ?', [id]); // memberships go with it
            for (const c of cardIds) await tx.run('DELETE FROM cards WHERE id = ? AND NOT EXISTS (SELECT 1 FROM deck_cards WHERE card_id = ?)', [c, c]);
            return;
          }
          const [was] = await tx.query<Row>('SELECT publish_id FROM decks WHERE id = ?', [id]);
          const publishId = doc.publishId as string | null;
          const wasPublishId = (was?.publish_id as string | null | undefined) ?? null;
          await tx.run(
            `INSERT INTO decks (id, title, description, bible_language, translation_code, created_at, updated_at, publish_id, imported_from) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET title = excluded.title, description = excluded.description, bible_language = excluded.bible_language, translation_code = excluded.translation_code,
               created_at = excluded.created_at, updated_at = excluded.updated_at, publish_id = excluded.publish_id, imported_from = excluded.imported_from`,
            [id, doc.title as string, doc.description as string | null, doc.language as string | null, doc.translation as string | null, doc.createdAt as number, doc.updatedAt as number, publishId, doc.importedFrom as string | null],
          );
          if (publishId !== wasPublishId) {
            // Published (or no longer published) on another device: this device's public-copy bookkeeping starts over.
            // "?" says "the copy exists already", so the public sync updates it instead of trying to create it.
            await tx.run('UPDATE decks SET synced_meta = ? WHERE id = ?', [publishId ? '?' : null, id]);
            await tx.run('UPDATE deck_cards SET synced_hash = NULL WHERE deck_id = ?', [id]);
            if (wasPublishId && !publishId) await tx.run('DELETE FROM sync_tombstones WHERE publish_id = ?', [wasPublishId]);
          }
          return;
        }

        if (entity === 'card') {
          if (!doc) { await tx.run('DELETE FROM cards WHERE id = ?', [id]); return; }
          const wanted: { deckId: string; addedAt: number }[] = [];
          for (const m of doc.decks as { deckId: string; addedAt: number }[]) {
            if ((await tx.query<Row>('SELECT 1 AS x FROM decks WHERE id = ?', [m.deckId])).length > 0) wanted.push(m);
          }
          if (wanted.length === 0) { await tx.run('DELETE FROM cards WHERE id = ?', [id]); return; } // its decks are gone
          await tx.run(
            `INSERT INTO cards (id, reference, verse_text, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET reference = excluded.reference, verse_text = excluded.verse_text, note = excluded.note, created_at = excluded.created_at, updated_at = excluded.updated_at`,
            [id, doc.reference as string, doc.verseText as string, doc.note as string | null, doc.createdAt as number, doc.updatedAt as number],
          );
          const have = new Map((await tx.query<Row>('SELECT deck_id, added_at FROM deck_cards WHERE card_id = ?', [id])).map((r) => [r.deck_id as string, r.added_at as number]));
          for (const deckId of have.keys()) if (!wanted.some((m) => m.deckId === deckId)) await tx.run('DELETE FROM deck_cards WHERE card_id = ? AND deck_id = ?', [id, deckId]);
          for (const m of wanted) {
            if (!have.has(m.deckId)) await tx.run('INSERT INTO deck_cards (deck_id, card_id, added_at) VALUES (?, ?, ?)', [m.deckId, id, m.addedAt]);
            else if (have.get(m.deckId) !== m.addedAt) await tx.run('UPDATE deck_cards SET added_at = ? WHERE deck_id = ? AND card_id = ?', [m.addedAt, m.deckId, id]);
          }
          return;
        }

        if (entity === 'schedule') {
          const [cardId, kind] = [id.slice(0, id.lastIndexOf('~')), id.slice(id.lastIndexOf('~') + 1)];
          if (!doc) { await tx.run('DELETE FROM card_schedule WHERE card_id = ? AND kind = ?', [cardId, kind]); return; }
          if ((await tx.query<Row>('SELECT 1 AS x FROM cards WHERE id = ?', [cardId])).length === 0) return;
          await tx.run(
            `INSERT INTO card_schedule (card_id, kind, due, stability, difficulty, state, reps, lapses, learning_steps, scheduled_days, last_review, scheduler_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(card_id, kind) DO UPDATE SET due = excluded.due, stability = excluded.stability, difficulty = excluded.difficulty, state = excluded.state, reps = excluded.reps,
               lapses = excluded.lapses, learning_steps = excluded.learning_steps, scheduled_days = excluded.scheduled_days, last_review = excluded.last_review, scheduler_version = excluded.scheduler_version`,
            [cardId, kind, doc.due as number, doc.stability as number, doc.difficulty as number, doc.state as number, doc.reps as number, doc.lapses as number, doc.learningSteps as number, doc.scheduledDays as number, doc.lastReview as number | null, doc.version as string],
          );
          return;
        }

        if (!doc) return; // settings are never removed
        await tx.run(
          'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
          [id, JSON.stringify(doc.value), doc.updatedAt as number],
        );
      });
    },

    async getMeta(key) {
      return (await db.query<Row>('SELECT value FROM account_sync_meta WHERE key = ?', [key]))[0]?.value as string | undefined;
    },

    async setMeta(key, value) {
      if (value === null) await db.run('DELETE FROM account_sync_meta WHERE key = ?', [key]);
      else await db.run('INSERT INTO account_sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
    },

    async resetAgreed() {
      await db.run('DELETE FROM account_sync_state');
    },

    async hasDecks() {
      return (await db.query<Row>('SELECT 1 AS x FROM decks LIMIT 1')).length > 0;
    },

    async wipe() {
      await db.transaction(async (tx) => {
        await tx.run('DELETE FROM decks');
        await tx.run('DELETE FROM cards'); // schedules, history and any leftover memberships go with them
        await tx.run('DELETE FROM sync_tombstones');
        await tx.run('DELETE FROM account_sync_state');
      });
    },
  };
}

export { itemKey };
