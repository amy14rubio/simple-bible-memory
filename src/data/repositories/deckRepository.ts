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
  /** Decks never ordered by hand first (A to Z, so a new deck is at the top), then the ones the person has ordered, in their order. */
  list(): Promise<DeckSummary[]>;
  /** Saves the order the person chose: every deck id, top to bottom. Ids that are not decks are ignored. */
  reorder(orderedIds: string[]): Promise<void>;
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
          ORDER BY (d.sort_order IS NOT NULL), d.sort_order, d.title COLLATE NOCASE`,
      );
      return rows.map((r) => ({ ...toDeck(r), cardCount: r.card_count as number }));
    },

    async reorder(orderedIds) {
      // Not "touching" updated_at: the order is the person's, on this device, and is never part of a deck's published or backed-up copy.
      await db.transaction(async (tx) => {
        for (const [position, id] of orderedIds.entries()) await tx.run('UPDATE decks SET sort_order = ? WHERE id = ?', [position, id]);
      });
    },

    async get(id) {
      const rows = await db.query<Row>('SELECT * FROM decks WHERE id = ?', [id]);
      return rows[0] ? toDeck(rows[0]) : undefined;
    },

    async create(input) {
      const t = now();
      const deck: Deck = {
        id: crypto.randomUUID(),
        title: requireText(input.title, 'Deck title', 'deck-title-required'),
        description: optionalText(input.description),
        bibleLanguage: optionalText(input.bibleLanguage),
        translationCode: optionalText(input.translationCode),
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
      const sets = ['title = ?', 'description = ?', 'updated_at = ?'];
      const params: SqlValue[] = [requireText(input.title, 'Deck title', 'deck-title-required'), optionalText(input.description), now()];
      // Translation and language are only touched when they are given (null clears them).
      if (input.translationCode !== undefined) { sets.push('translation_code = ?'); params.push(optionalText(input.translationCode)); }
      if (input.bibleLanguage !== undefined) { sets.push('bible_language = ?'); params.push(optionalText(input.bibleLanguage)); }
      await db.run(`UPDATE decks SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
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
