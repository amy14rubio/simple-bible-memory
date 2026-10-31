import type { Database, SqlValue } from '../database/Database';
import type { Card, CardInput } from '../../domain/types';
import { isLicensed, licensedSql } from '../../domain/bible/sources';
import { ValidationError } from '../../domain/errors';
import { requireText, optionalText, type Clock } from './util';

type Row = Record<string, SqlValue>;

export const toCard = (r: Row): Card => ({
  id: r.id as string,
  reference: r.reference as string,
  verseText: r.verse_text as string,
  note: r.note as string | null,
  translationCode: (r.translation_code as string | null) ?? null,
  createdAt: r.created_at as number,
  updatedAt: r.updated_at as number,
});

/**
 * The text of a card. Required, except for a licensed translation, whose text is fetched from the publisher later and is
 * simply empty until then (and can never be typed in by hand: whatever is given is kept only if it was fetched).
 */
function cardText(value: string, translationCode: string | null | undefined): string {
  if (isLicensed(translationCode)) return value.trim();
  const v = value.trim();
  if (!v) throw new ValidationError('verse-text-required', 'Verse text is required');
  return v;
}

export interface CardRepository {
  listByDeck(deckId: string): Promise<Card[]>;
  /** Every card in every deck, each once (a card that lives in several decks is not repeated), oldest first. */
  listAll(): Promise<Card[]>;
  get(id: string): Promise<Card | undefined>;
  /** Licensed cards whose text has not been fetched to this device yet (new, restored, imported, or emptied). */
  listMissingText(): Promise<Card[]>;
  /** Keeps text fetched from a publisher on this device. It is not an edit: it does not count as a change to sync. */
  setFetchedText(id: string, text: string): Promise<void>;
  /** Empties the saved text of licensed cards (all of them, or only these translations): "off" for a translation. */
  clearFetchedText(codes?: string[]): Promise<number>;
  create(deckId: string, input: CardInput): Promise<Card>;
  /** Creates several cards in one go, in order. All of them are saved or none are. */
  createMany(deckId: string, inputs: CardInput[]): Promise<Card[]>;
  update(id: string, input: CardInput): Promise<void>;
  delete(id: string): Promise<void>;
  /**
   * Deletes several cards (with their schedules and review history) in one go and hands back everything it removed,
   * so `restore` can put them back exactly as they were (this is what "Undo" uses).
   */
  deleteMany(ids: string[]): Promise<DeletedCards>;
  /** Puts back what `deleteMany` removed. Cards that already exist again are left alone. */
  restore(deleted: DeletedCards): Promise<void>;
  /**
   * Files the cards in another deck, in the order given (after the cards already there). A card's study progress belongs
   * to the card, so it moves with it. A card ends up only in the destination deck.
   */
  moveMany(ids: string[], toDeckId: string): Promise<MovedCards>;
  /** Puts moved cards back in the decks, and in the places, they came from. */
  undoMove(moved: MovedCards): Promise<void>;
}

/** Where each moved card was, so a move can be undone. */
export interface MovedCards {
  toDeckId: string;
  from: { cardId: string; memberships: { deckId: string; addedAt: number }[] }[];
}

/** Whole rows of everything a deleted card had, so deleting can be undone. */
export interface DeletedCards {
  cards: Card[];
  rows: { table: DeletedTable; row: Row }[];
}
const DELETED_TABLES = ['cards', 'deck_cards', 'card_schedule', 'review_logs'] as const;
type DeletedTable = (typeof DELETED_TABLES)[number];
// A published deck's per-card "last sent" fingerprint is not restored: the card is simply sent again.
const NOT_RESTORED = new Set(['synced_hash']);

/** A card that comes back to a published deck no longer needs its removal sent to the public copy. */
const forgetRemoval = (tx: Database, deckId: string, cardId: string) =>
  tx.run('DELETE FROM sync_tombstones WHERE card_id = ? AND publish_id = (SELECT publish_id FROM decks WHERE id = ?)', [cardId, deckId]);

export function createCardRepository(db: Database, now: Clock = Date.now): CardRepository {
  return {
    async listByDeck(deckId) {
      const rows = await db.query<Row>(
        `SELECT c.* FROM cards c JOIN deck_cards dc ON dc.card_id = c.id
          WHERE dc.deck_id = ? ORDER BY dc.added_at, c.created_at`,
        [deckId],
      );
      return rows.map(toCard);
    },

    async listAll() {
      const rows = await db.query<Row>(
        `SELECT c.* FROM cards c WHERE EXISTS (SELECT 1 FROM deck_cards dc WHERE dc.card_id = c.id) ORDER BY c.created_at, c.id`,
      );
      return rows.map(toCard);
    },

    async get(id) {
      const rows = await db.query<Row>('SELECT * FROM cards WHERE id = ?', [id]);
      return rows[0] ? toCard(rows[0]) : undefined;
    },

    async listMissingText() {
      const licensed = licensedSql('c.translation_code');
      const rows = await db.query<Row>(`SELECT c.* FROM cards c WHERE c.verse_text = '' AND ${licensed.sql} ORDER BY c.created_at, c.id`, licensed.params);
      return rows.map(toCard);
    },

    async setFetchedText(id, text) {
      const licensed = licensedSql('translation_code');
      await db.run(`UPDATE cards SET verse_text = ? WHERE id = ? AND ${licensed.sql}`, [text.trim(), id, ...licensed.params]);
    },

    async clearFetchedText(codes) {
      const licensed = licensedSql('translation_code');
      const only = codes ? ` AND translation_code IN (${codes.map(() => '?').join(', ')})` : '';
      if (codes && codes.length === 0) return 0;
      const before = await db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM cards WHERE verse_text <> '' AND ${licensed.sql}${only}`, [...licensed.params, ...(codes ?? [])]);
      await db.run(`UPDATE cards SET verse_text = '' WHERE ${licensed.sql}${only}`, [...licensed.params, ...(codes ?? [])]);
      return Number(before[0]?.n ?? 0);
    },

    async create(deckId, input) {
      const t = now();
      const card: Card = {
        id: crypto.randomUUID(),
        reference: requireText(input.reference, 'Reference', 'reference-required'),
        // Verse text is stored exactly as typed (only outer whitespace trimmed).
        verseText: cardText(input.verseText, input.translationCode),
        note: optionalText(input.note),
        translationCode: input.translationCode ?? null,
        createdAt: t,
        updatedAt: t,
      };
      // Card + membership succeed or fail together; the FK rejects an unknown deck.
      await db.transaction(async (tx) => {
        await tx.run(
          'INSERT INTO cards (id, reference, verse_text, note, translation_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [card.id, card.reference, card.verseText, card.note, card.translationCode, t, t],
        );
        await tx.run('INSERT INTO deck_cards (deck_id, card_id, added_at) VALUES (?, ?, ?)', [deckId, card.id, t]);
      });
      return card;
    },

    async createMany(deckId, inputs) {
      const t = now();
      // Validate everything first, so a bad entry stops the whole batch before anything is written.
      // Each card is stamped one millisecond later than the last so they keep their order in the deck.
      const cards: Card[] = inputs.map((input, i) => ({
        id: crypto.randomUUID(),
        reference: requireText(input.reference, 'Reference', 'reference-required'),
        verseText: cardText(input.verseText, input.translationCode),
        note: optionalText(input.note),
        translationCode: input.translationCode ?? null,
        createdAt: t + i,
        updatedAt: t + i,
      }));
      await db.transaction(async (tx) => {
        for (const card of cards) {
          await tx.run(
            'INSERT INTO cards (id, reference, verse_text, note, translation_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [card.id, card.reference, card.verseText, card.note, card.translationCode, card.createdAt, card.updatedAt],
          );
          await tx.run('INSERT INTO deck_cards (deck_id, card_id, added_at) VALUES (?, ?, ?)', [deckId, card.id, card.createdAt]);
        }
      });
      return cards;
    },

    async update(id, input) {
      const translationCode = input.translationCode === undefined ? ((await db.query<Row>('SELECT translation_code FROM cards WHERE id = ?', [id]))[0]?.translation_code as string | null | undefined) ?? null : input.translationCode;
      await db.run('UPDATE cards SET reference = ?, verse_text = ?, note = ?, translation_code = ?, updated_at = ? WHERE id = ?', [
        requireText(input.reference, 'Reference', 'reference-required'),
        cardText(input.verseText, translationCode),
        optionalText(input.note),
        translationCode,
        now(),
        id,
      ]);
    },

    async delete(id) {
      await db.run('DELETE FROM cards WHERE id = ?', [id]); // cascades to memberships, schedule, logs
    },

    async deleteMany(ids) {
      return db.transaction(async (tx) => {
        const deleted: DeletedCards = { cards: [], rows: [] };
        for (const id of ids) {
          const card = await tx.query<Row>('SELECT * FROM cards WHERE id = ?', [id]);
          if (!card[0]) continue;
          deleted.cards.push(toCard(card[0]));
          for (const table of DELETED_TABLES) {
            const rows = await tx.query<Row>(`SELECT * FROM ${table} WHERE ${table === 'cards' ? 'id' : 'card_id'} = ?`, [id]);
            for (const row of rows) deleted.rows.push({ table, row });
          }
          await tx.run('DELETE FROM cards WHERE id = ?', [id]);
        }
        return deleted;
      });
    },

    async restore(deleted) {
      const t = now();
      await db.transaction(async (tx) => {
        // Cards first (memberships, schedules and history point at them), in the order they were collected.
        for (const table of DELETED_TABLES) {
          for (const { table: t, row } of deleted.rows) {
            if (t !== table) continue;
            const columns = Object.keys(row).filter((c) => !NOT_RESTORED.has(c));
            await tx.run(
              `INSERT OR IGNORE INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
              columns.map((c) => row[c] as SqlValue),
            );
            if (table === 'deck_cards') await forgetRemoval(tx, row.deck_id as string, row.card_id as string);
          }
        }
        // Restored cards count as just edited, so the person's other devices take them back too.
        for (const c of deleted.cards) await tx.run('UPDATE cards SET updated_at = ? WHERE id = ?', [t, c.id]);
      });
    },

    async moveMany(ids, toDeckId) {
      const t = now();
      return db.transaction(async (tx) => {
        const moved: MovedCards = { toDeckId, from: [] };
        for (const [i, id] of ids.entries()) {
          const was = await tx.query<Row>('SELECT deck_id, added_at FROM deck_cards WHERE card_id = ?', [id]);
          moved.from.push({ cardId: id, memberships: was.map((r) => ({ deckId: r.deck_id as string, addedAt: r.added_at as number })) });
          await tx.run('DELETE FROM deck_cards WHERE card_id = ? AND deck_id != ?', [id, toDeckId]);
          await tx.run('INSERT OR IGNORE INTO deck_cards (deck_id, card_id, added_at) VALUES (?, ?, ?)', [toDeckId, id, t + i]);
          await forgetRemoval(tx, toDeckId, id);
          await tx.run('UPDATE cards SET updated_at = ? WHERE id = ?', [t + i, id]); // so the move reaches the person's other devices
        }
        return moved;
      });
    },

    async undoMove(moved) {
      const t = now();
      await db.transaction(async (tx) => {
        for (const { cardId, memberships } of moved.from) {
          const origin = memberships.map((m) => m.deckId);
          // Leave the destination (unless the card was already there), then go back to every deck it came from.
          for (const d of (await tx.query<Row>('SELECT deck_id FROM deck_cards WHERE card_id = ?', [cardId])).map((r) => r.deck_id as string)) {
            if (!origin.includes(d)) await tx.run('DELETE FROM deck_cards WHERE card_id = ? AND deck_id = ?', [cardId, d]);
          }
          for (const m of memberships) {
            await tx.run('INSERT OR IGNORE INTO deck_cards (deck_id, card_id, added_at) VALUES (?, ?, ?)', [m.deckId, cardId, m.addedAt]);
            await forgetRemoval(tx, m.deckId, cardId);
          }
          await tx.run('UPDATE cards SET updated_at = ? WHERE id = ?', [t, cardId]);
        }
      });
    },
  };
}
