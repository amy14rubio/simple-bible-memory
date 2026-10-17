import type { Database, SqlValue } from '../database/Database';

type Row = Record<string, SqlValue>;

export interface PublishedDeckRow {
  id: string;
  title: string;
  description: string | null;
  translationCode: string | null;
  bibleLanguage: string | null;
  publishId: string | null;
  syncedMeta: string | null;
}

export interface SyncCardRow {
  id: string;
  reference: string;
  verseText: string;
  note: string | null;
  syncedHash: string | null;
}

/** The local half of publishing: which decks are published, what was last sent, and which deletions are still owed. */
export interface SharingRepository {
  getDeck(deckId: string): Promise<PublishedDeckRow | undefined>;
  /** Ids of the decks that are published. */
  publishedDeckIds(): Promise<string[]>;
  /** The deck's cards in order. */
  cardsOf(deckId: string): Promise<SyncCardRow[]>;
  publish(deckId: string, publishId: string): Promise<void>;
  /** Forgets everything about the deck's public copy (it stays as a normal local deck). */
  unpublish(deckId: string): Promise<void>;
  markSynced(deckId: string, state: { cardHashes: Record<string, string>; meta: string }): Promise<void>;
  /** Card ids still to be removed from a public copy. */
  pendingCardRemovals(publishId: string): Promise<string[]>;
  clearCardRemovals(publishId: string, cardIds: string[]): Promise<void>;
  /** Public copies whose local deck was deleted. */
  pendingDeckRemovals(): Promise<string[]>;
  clearDeckRemoval(publishId: string): Promise<void>;
}

export function createSharingRepository(db: Database): SharingRepository {
  return {
    async getDeck(deckId) {
      const [r] = await db.query<Row>('SELECT id, title, description, translation_code, bible_language, publish_id, synced_meta FROM decks WHERE id = ?', [deckId]);
      return r && {
        id: r.id as string, title: r.title as string, description: (r.description as string | null) ?? null,
        translationCode: (r.translation_code as string | null) ?? null, bibleLanguage: (r.bible_language as string | null) ?? null,
        publishId: (r.publish_id as string | null) ?? null, syncedMeta: (r.synced_meta as string | null) ?? null,
      };
    },

    async publishedDeckIds() {
      return (await db.query<Row>('SELECT id FROM decks WHERE publish_id IS NOT NULL')).map((r) => r.id as string);
    },

    async cardsOf(deckId) {
      const rows = await db.query<Row>(
        `SELECT c.id, c.reference, c.verse_text, c.note, dc.synced_hash
           FROM cards c JOIN deck_cards dc ON dc.card_id = c.id
          WHERE dc.deck_id = ? ORDER BY dc.added_at, c.created_at, c.id`,
        [deckId],
      );
      return rows.map((r) => ({ id: r.id as string, reference: r.reference as string, verseText: r.verse_text as string, note: (r.note as string | null) ?? null, syncedHash: (r.synced_hash as string | null) ?? null }));
    },

    async publish(deckId, publishId) {
      await db.run('UPDATE decks SET publish_id = ?, synced_meta = NULL, updated_at = ? WHERE id = ?', [publishId, Date.now(), deckId]);
      await db.run('UPDATE deck_cards SET synced_hash = NULL WHERE deck_id = ?', [deckId]);
    },

    async unpublish(deckId) {
      await db.transaction(async (tx) => {
        const [r] = await tx.query<Row>('SELECT publish_id FROM decks WHERE id = ?', [deckId]);
        const publishId = r?.publish_id as string | null | undefined;
        await tx.run('UPDATE decks SET publish_id = NULL, synced_meta = NULL, updated_at = ? WHERE id = ?', [Date.now(), deckId]);
        await tx.run('UPDATE deck_cards SET synced_hash = NULL WHERE deck_id = ?', [deckId]);
        if (publishId) await tx.run('DELETE FROM sync_tombstones WHERE publish_id = ?', [publishId]);
      });
    },

    async markSynced(deckId, { cardHashes, meta }) {
      await db.transaction(async (tx) => {
        for (const [cardId, hash] of Object.entries(cardHashes)) {
          await tx.run('UPDATE deck_cards SET synced_hash = ? WHERE deck_id = ? AND card_id = ?', [hash, deckId, cardId]);
        }
        await tx.run('UPDATE decks SET synced_meta = ? WHERE id = ?', [meta, deckId]);
      });
    },

    async pendingCardRemovals(publishId) {
      return (await db.query<Row>("SELECT card_id FROM sync_tombstones WHERE publish_id = ? AND card_id <> ''", [publishId])).map((r) => r.card_id as string);
    },

    async clearCardRemovals(publishId, cardIds) {
      for (const id of cardIds) await db.run('DELETE FROM sync_tombstones WHERE publish_id = ? AND card_id = ?', [publishId, id]);
    },

    async pendingDeckRemovals() {
      return (await db.query<Row>("SELECT publish_id FROM sync_tombstones WHERE card_id = ''")).map((r) => r.publish_id as string);
    },

    async clearDeckRemoval(publishId) {
      await db.run('DELETE FROM sync_tombstones WHERE publish_id = ?', [publishId]);
    },
  };
}
