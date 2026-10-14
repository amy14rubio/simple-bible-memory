import type { Database, SqlValue } from '../database/Database';
import type { Card, CardInput } from '../../domain/types';
import { requireText, optionalText, type Clock } from './util';

type Row = Record<string, SqlValue>;

export const toCard = (r: Row): Card => ({
  id: r.id as string,
  reference: r.reference as string,
  verseText: r.verse_text as string,
  note: r.note as string | null,
  createdAt: r.created_at as number,
  updatedAt: r.updated_at as number,
});

export interface CardRepository {
  listByDeck(deckId: string): Promise<Card[]>;
  get(id: string): Promise<Card | undefined>;
  create(deckId: string, input: CardInput): Promise<Card>;
  /** Creates several cards in one go, in order. All of them are saved or none are. */
  createMany(deckId: string, inputs: CardInput[]): Promise<Card[]>;
  update(id: string, input: CardInput): Promise<void>;
  delete(id: string): Promise<void>;
}

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

    async get(id) {
      const rows = await db.query<Row>('SELECT * FROM cards WHERE id = ?', [id]);
      return rows[0] ? toCard(rows[0]) : undefined;
    },

    async create(deckId, input) {
      const t = now();
      const card: Card = {
        id: crypto.randomUUID(),
        reference: requireText(input.reference, 'Reference'),
        // Verse text is stored exactly as typed (only outer whitespace trimmed).
        verseText: requireText(input.verseText, 'Verse text'),
        note: optionalText(input.note),
        createdAt: t,
        updatedAt: t,
      };
      // Card + membership succeed or fail together; the FK rejects an unknown deck.
      await db.transaction(async (tx) => {
        await tx.run(
          'INSERT INTO cards (id, reference, verse_text, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
          [card.id, card.reference, card.verseText, card.note, t, t],
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
        reference: requireText(input.reference, 'Reference'),
        verseText: requireText(input.verseText, 'Verse text'),
        note: optionalText(input.note),
        createdAt: t + i,
        updatedAt: t + i,
      }));
      await db.transaction(async (tx) => {
        for (const card of cards) {
          await tx.run(
            'INSERT INTO cards (id, reference, verse_text, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            [card.id, card.reference, card.verseText, card.note, card.createdAt, card.updatedAt],
          );
          await tx.run('INSERT INTO deck_cards (deck_id, card_id, added_at) VALUES (?, ?, ?)', [deckId, card.id, card.createdAt]);
        }
      });
      return cards;
    },

    async update(id, input) {
      await db.run('UPDATE cards SET reference = ?, verse_text = ?, note = ?, updated_at = ? WHERE id = ?', [
        requireText(input.reference, 'Reference'),
        requireText(input.verseText, 'Verse text'),
        optionalText(input.note),
        now(),
        id,
      ]);
    },

    async delete(id) {
      await db.run('DELETE FROM cards WHERE id = ?', [id]); // cascades to memberships, schedule, logs
    },
  };
}
