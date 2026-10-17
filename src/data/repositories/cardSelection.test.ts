import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../test/db';
import { createDeckRepository } from './deckRepository';
import { createCardRepository } from './cardRepository';
import type { Database } from '../database/Database';

let db: Database;
let decks: ReturnType<typeof createDeckRepository>;
let cards: ReturnType<typeof createCardRepository>;

beforeEach(async () => {
  db = await createTestDatabase();
  decks = createDeckRepository(db);
  cards = createCardRepository(db);
});

/** Two decks; the first has three cards, the first of which has been studied. */
async function seed() {
  const a = await decks.create({ title: 'A' });
  const b = await decks.create({ title: 'B' });
  const [c1, c2, c3] = await cards.createMany(a.id, [
    { reference: 'John 3:16', verseText: 'one', note: 'my note' },
    { reference: 'John 3:17', verseText: 'two' },
    { reference: 'John 3:18', verseText: 'three' },
  ]);
  await db.run(`INSERT INTO card_schedule VALUES (?, 'recall', 1000, 4.5, 5.5, 2, 3, 1, 0, 7, 900, 'v')`, [c1!.id]);
  await db.run(`INSERT INTO review_logs (id, card_id, kind, reviewed_at, rating, study_mode, state_before, due_before, stability, difficulty, scheduled_days, elapsed_days)
                VALUES ('r1', ?, 'recall', 900, 3, 'type', 0, 800, 4.5, 5.5, 7, 0)`, [c1!.id]);
  return { a, b, c1: c1!, c2: c2!, c3: c3! };
}
const ids = async (deckId: string) => (await cards.listByDeck(deckId)).map((c) => c.reference);
const count = async (sql: string) => ((await db.query<{ n: number }>(sql))[0]!.n);

describe('deleting several cards, and undoing it', () => {
  it('deletes the chosen cards only, with their progress', async () => {
    const { a, c1, c3 } = await seed();
    await cards.deleteMany([c1.id, c3.id]);
    expect(await ids(a.id)).toEqual(['John 3:17']);
    expect(await count('SELECT COUNT(*) n FROM card_schedule')).toBe(0);
    expect(await count('SELECT COUNT(*) n FROM review_logs')).toBe(0);
  });

  it('hands back the deleted cards, in the order asked', async () => {
    const { c1, c3 } = await seed();
    const deleted = await cards.deleteMany([c3.id, c1.id, 'not-a-card']);
    expect(deleted.cards.map((c) => c.reference)).toEqual(['John 3:18', 'John 3:16']);
  });

  it('restore brings back the cards, their notes, their place in the deck, their schedule and their history', async () => {
    const { a, c1, c2 } = await seed();
    const before = await cards.listByDeck(a.id);
    const schedule = await db.query('SELECT * FROM card_schedule');
    const deleted = await cards.deleteMany([c1.id, c2.id]);
    await cards.restore(deleted);
    expect(await cards.listByDeck(a.id)).toEqual(before); // same cards, same order
    expect((await cards.get(c1.id))!.note).toBe('my note');
    expect(await db.query('SELECT * FROM card_schedule')).toEqual(schedule);
    expect(await count('SELECT COUNT(*) n FROM review_logs')).toBe(1);
  });

  it('restoring twice does not duplicate anything', async () => {
    const { a, c1 } = await seed();
    const deleted = await cards.deleteMany([c1.id]);
    await cards.restore(deleted);
    await cards.restore(deleted);
    expect(await ids(a.id)).toHaveLength(3);
    expect(await count('SELECT COUNT(*) n FROM card_schedule')).toBe(1);
  });

  it('in a published deck, deleting queues the removal and undoing cancels it (and the card is sent again)', async () => {
    const { a, c1 } = await seed();
    await db.run("UPDATE decks SET publish_id = 'pub-a' WHERE id = ?", [a.id]);
    await db.run("UPDATE deck_cards SET synced_hash = 'sent'");
    const deleted = await cards.deleteMany([c1.id]);
    expect(await count("SELECT COUNT(*) n FROM sync_tombstones WHERE publish_id = 'pub-a'")).toBe(1);
    await cards.restore(deleted);
    expect(await count('SELECT COUNT(*) n FROM sync_tombstones')).toBe(0);
    expect(await count("SELECT COUNT(*) n FROM deck_cards WHERE card_id = '" + c1.id + "' AND synced_hash IS NULL")).toBe(1);
  });
});

describe('moving cards to another deck', () => {
  it('files them in the destination, after what is already there, in the order given', async () => {
    const { a, b, c1, c2, c3 } = await seed();
    await cards.create(b.id, { reference: 'Psalm 1:1', verseText: 'x' });
    await cards.moveMany([c3.id, c1.id], b.id);
    expect(await ids(a.id)).toEqual(['John 3:17']);
    expect(await ids(b.id)).toEqual(['Psalm 1:1', 'John 3:18', 'John 3:16']);
    expect((await cards.listByDeck(a.id))[0]!.id).toBe(c2.id);
  });

  it('keeps study progress and history (they belong to the card)', async () => {
    const { b, c1 } = await seed();
    await cards.moveMany([c1.id], b.id);
    expect(await count(`SELECT COUNT(*) n FROM card_schedule WHERE card_id = '${c1.id}'`)).toBe(1);
    expect(await count(`SELECT COUNT(*) n FROM review_logs WHERE card_id = '${c1.id}'`)).toBe(1);
  });

  it('a card already in the destination is not duplicated', async () => {
    const { a, b, c1 } = await seed();
    await cards.moveMany([c1.id], b.id);
    await cards.moveMany([c1.id], b.id);
    expect(await ids(a.id)).toHaveLength(2);
    expect(await ids(b.id)).toEqual(['John 3:16']);
  });

  it('an unknown destination changes nothing', async () => {
    const { a, c1 } = await seed();
    await expect(cards.moveMany([c1.id], 'nope')).rejects.toThrow();
    expect(await ids(a.id)).toHaveLength(3);
  });

  it('between published decks: queues the removal in the source, and sends the card from the destination', async () => {
    const { a, b, c1 } = await seed();
    await db.run("UPDATE decks SET publish_id = 'pub-a' WHERE id = ?", [a.id]);
    await db.run("UPDATE decks SET publish_id = 'pub-b' WHERE id = ?", [b.id]);
    await db.run("UPDATE deck_cards SET synced_hash = 'sent'");
    await cards.moveMany([c1.id], b.id);
    expect(await count(`SELECT COUNT(*) n FROM sync_tombstones WHERE publish_id = 'pub-a' AND card_id = '${c1.id}'`)).toBe(1);
    expect(await count(`SELECT COUNT(*) n FROM deck_cards WHERE deck_id = '${b.id}' AND synced_hash IS NULL`)).toBe(1);
    // and back again: the pending removal in the destination (if any) is cancelled
    await cards.moveMany([c1.id], a.id);
    expect(await count(`SELECT COUNT(*) n FROM sync_tombstones WHERE publish_id = 'pub-a'`)).toBe(0);
    expect(await count(`SELECT COUNT(*) n FROM sync_tombstones WHERE publish_id = 'pub-b'`)).toBe(1);
  });
});

describe('undoing a move', () => {
  it('puts the cards back in their old deck and place, with their progress', async () => {
    const { a, b, c1, c3 } = await seed();
    const before = await cards.listByDeck(a.id);
    const moved = await cards.moveMany([c1.id, c3.id], b.id);
    await cards.undoMove(moved);
    expect(await cards.listByDeck(a.id)).toEqual(before); // same cards, same order
    expect(await ids(b.id)).toEqual([]);
    expect(await count(`SELECT COUNT(*) n FROM card_schedule WHERE card_id = '${c1.id}'`)).toBe(1);
  });

  it('a card that was already in the destination stays there', async () => {
    const { a, b, c1 } = await seed();
    await cards.moveMany([c1.id], b.id);
    const moved = await cards.moveMany([c1.id], b.id); // already there: nothing really changes
    await cards.undoMove(moved);
    expect(await ids(b.id)).toEqual(['John 3:16']);
    expect(await ids(a.id)).toHaveLength(2);
  });

  it('between published decks it cancels the pending removal in the old deck and queues one in the destination', async () => {
    const { a, b, c1 } = await seed();
    await db.run("UPDATE decks SET publish_id = 'pub-a' WHERE id = ?", [a.id]);
    await db.run("UPDATE decks SET publish_id = 'pub-b' WHERE id = ?", [b.id]);
    await db.run("UPDATE deck_cards SET synced_hash = 'sent'");
    const moved = await cards.moveMany([c1.id], b.id);
    await cards.undoMove(moved);
    expect(await count("SELECT COUNT(*) n FROM sync_tombstones WHERE publish_id = 'pub-a'")).toBe(0);
    expect(await count(`SELECT COUNT(*) n FROM sync_tombstones WHERE publish_id = 'pub-b' AND card_id = '${c1.id}'`)).toBe(1);
    expect(await count(`SELECT COUNT(*) n FROM deck_cards WHERE deck_id = '${a.id}' AND card_id = '${c1.id}' AND synced_hash IS NULL`)).toBe(1);
  });
});
