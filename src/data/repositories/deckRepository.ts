import type { Database, SqlValue } from '../database/Database';
import type { Deck, DeckInput, DeckSummary } from '../../domain/types';
import { requireText, optionalText, type Clock } from './util';

type Row = Record<string, SqlValue>;

const toDeck = (r: Row): Deck => ({
  id: r.id as string,
  title: r.title as string,
  description: r.description as string | null,
  bibleLanguage: r.bible_language as string | null,
  translationCode: r.translation_code as string | null,
  createdAt: r.created_at as number,
  updatedAt: r.updated_at as number,
});

export interface DeckRepository {
  list(): Promise<DeckSummary[]>;
  get(id: string): Promise<Deck | undefined>;
  create(input: DeckInput): Promise<Deck>;
  update(id: string, input: DeckInput): Promise<void>;
  /** Deletes the deck and every card that belongs to no other deck. */
  delete(id: string): Promise<void>;
}

export function createDeckRepository(db: Database, now: Clock = Date.now): DeckRepository {
  return {
    async list() {
      const rows = await db.query<Row>(
        `SELECT d.*, COUNT(dc.card_id) AS card_count
           FROM decks d LEFT JOIN deck_cards dc ON dc.deck_id = d.id
          GROUP BY d.id
          ORDER BY d.title COLLATE NOCASE`,
      );
      return rows.map((r) => ({ ...toDeck(r), cardCount: r.card_count as number }));
    },

    async get(id) {
      const rows = await db.query<Row>('SELECT * FROM decks WHERE id = ?', [id]);
      return rows[0] ? toDeck(rows[0]) : undefined;
    },

    async create(input) {
      const t = now();
      const deck: Deck = {
        id: crypto.randomUUID(),
        title: requireText(input.title, 'Deck title'),
        description: optionalText(input.description),
        bibleLanguage: null,
        translationCode: null,
        createdAt: t,
        updatedAt: t,
      };
      await db.run(
        'INSERT INTO decks (id, title, description, bible_language, translation_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [deck.id, deck.title, deck.description, deck.bibleLanguage, deck.translationCode, t, t],
      );
      return deck;
    },

    async update(id, input) {
      await db.run('UPDATE decks SET title = ?, description = ?, updated_at = ? WHERE id = ?', [
        requireText(input.title, 'Deck title'),
        optionalText(input.description),
        now(),
        id,
      ]);
    },

    async delete(id) {
      await db.transaction(async (tx) => {
        const members = await tx.query<{ card_id: string }>('SELECT card_id FROM deck_cards WHERE deck_id = ?', [id]);
        await tx.run('DELETE FROM decks WHERE id = ?', [id]); // cascades to deck_cards
        // Cards that were only in this deck would now be orphans: remove them (cascades to schedule + logs).
        for (const { card_id } of members) {
          await tx.run(
            'DELETE FROM cards WHERE id = ? AND NOT EXISTS (SELECT 1 FROM deck_cards WHERE card_id = ?)',
            [card_id, card_id],
          );
        }
      });
    },
  };
}
