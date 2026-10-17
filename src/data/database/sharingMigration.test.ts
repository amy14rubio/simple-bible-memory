import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../test/db';
import { createDeckRepository } from '../repositories/deckRepository';
import { createCardRepository } from '../repositories/cardRepository';
import type { Database } from './Database';

let db: Database;
beforeEach(async () => { db = await createTestDatabase(); });

const tombstones = () => db.query<{ publish_id: string; card_id: string }>('SELECT publish_id, card_id FROM sync_tombstones ORDER BY card_id');

describe('remembering what the public copy has not heard yet', () => {
  it('deleting a card from a published deck leaves a tombstone, even through the cascade', async () => {
    const decks = createDeckRepository(db);
    const cards = createCardRepository(db);
    const d = await decks.create({ title: 'Published' });
    const a = await cards.create(d.id, { reference: 'A 1:1', verseText: 'a' });
    await cards.create(d.id, { reference: 'B 1:1', verseText: 'b' });
    await db.run("UPDATE decks SET publish_id = 'pub1' WHERE id = ?", [d.id]);

    await cards.delete(a.id);
    expect(await tombstones()).toEqual([{ publish_id: 'pub1', card_id: a.id }]);
  });

  it('a card in an unpublished deck leaves nothing behind', async () => {
    const decks = createDeckRepository(db);
    const cards = createCardRepository(db);
    const d = await decks.create({ title: 'Private' });
    const a = await cards.create(d.id, { reference: 'A 1:1', verseText: 'a' });
    await cards.delete(a.id);
    expect(await tombstones()).toEqual([]);
  });

  it('a card shared by two decks only leaves a tombstone for the published one', async () => {
    const decks = createDeckRepository(db);
    const cards = createCardRepository(db);
    const pub = await decks.create({ title: 'Published' });
    const priv = await decks.create({ title: 'Private' });
    const a = await cards.create(pub.id, { reference: 'A 1:1', verseText: 'a' });
    await db.run('INSERT INTO deck_cards (deck_id, card_id, added_at) VALUES (?, ?, 0)', [priv.id, a.id]);
    await db.run("UPDATE decks SET publish_id = 'pub1' WHERE id = ?", [pub.id]);
    await cards.delete(a.id);
    expect(await tombstones()).toEqual([{ publish_id: 'pub1', card_id: a.id }]);
  });

  it('deleting a published deck leaves one whole-deck tombstone', async () => {
    const decks = createDeckRepository(db);
    const cards = createCardRepository(db);
    const d = await decks.create({ title: 'Published' });
    await cards.create(d.id, { reference: 'A 1:1', verseText: 'a' });
    await db.run("UPDATE decks SET publish_id = 'pub9' WHERE id = ?", [d.id]);
    await decks.delete(d.id);
    expect((await tombstones()).some((t) => t.publish_id === 'pub9' && t.card_id === '')).toBe(true);
  });

  it('deleting an unpublished deck leaves nothing behind', async () => {
    const decks = createDeckRepository(db);
    const d = await decks.create({ title: 'Private' });
    await decks.delete(d.id);
    expect(await tombstones()).toEqual([]);
  });
});
