import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../test/db';
import { createDeckRepository, type DeckRepository } from './deckRepository';
import { createCardRepository, type CardRepository } from './cardRepository';
import { createReviewRepository, type ReviewRepository } from './reviewRepository';
import { createStatsRepository, type StatsRepository } from './statsRepository';
import { createScheduler } from '../../domain/scheduling/scheduler';
import type { Database } from '../database/Database';

const DAY = 86_400_000;
const NOON = new Date(2026, 5, 10, 12, 0, 0).getTime();

let db: Database, decks: DeckRepository, cards: CardRepository, reviews: ReviewRepository, stats: StatsRepository, clock: number;

beforeEach(async () => {
  db = await createTestDatabase();
  clock = NOON;
  decks = createDeckRepository(db, () => clock);
  cards = createCardRepository(db, () => clock);
  reviews = createReviewRepository(db, createScheduler(), () => clock);
  stats = createStatsRepository(db, () => clock);
});

describe('overview()', () => {
  it('is all zeros with no cards', async () => {
    expect(await stats.overview(null, ['recall'])).toEqual({
      totalCards: 0, memorized: 0, mastered: 0, daysSinceStarting: 0,
      counts: { new: 0, learning: 0, young: 0, mature: 0 }, books: [],
    });
  });

  it('counts card states, memorized and mastered', async () => {
    const d = await decks.create({ title: 'D' });
    const [a, b, c, e] = await Promise.all(['John 3:16', 'John 3:17', 'Genesis 1:1', 'Psalm 23:1'].map((r) => cards.create(d.id, { reference: r, verseText: 'x' })));
    await reviews.record({ cardId: a!.id, kind: 'recall', rating: 3, mode: 'flashcard' }); // learning
    await reviews.record({ cardId: b!.id, kind: 'recall', rating: 4, mode: 'flashcard' }); // review, young
    await reviews.record({ cardId: c!.id, kind: 'recall', rating: 4, mode: 'flashcard' }); // review...
    await db.run('UPDATE card_schedule SET scheduled_days = 40 WHERE card_id = ?', [c!.id]); // ...made mature directly
    const o = await stats.overview(d.id, ['recall']);
    expect(o).toMatchObject({ totalCards: 4, memorized: 2, mastered: 1, counts: { new: 1, learning: 1, young: 1, mature: 1 } });
    expect(e).toBeDefined();
  });

  it('groups by book in Bible order, ignoring references it cannot parse', async () => {
    const d = await decks.create({ title: 'D' });
    for (const r of ['Salmos 23:1', 'John 3:16', 'Juan 3:17', 'Genesis 1:1', 'My own label']) await cards.create(d.id, { reference: r, verseText: 'x' });
    const o = await stats.overview(d.id, ['recall']);
    expect(o.books).toEqual([
      { book: 'Genesis', total: 1, memorized: 0 },
      { book: 'Psalm', total: 1, memorized: 0 },
      { book: 'John', total: 2, memorized: 0 },
    ]);
    expect(o.totalCards).toBe(5); // unparsable references still count as cards
  });

  it('book progress counts memorized cards', async () => {
    const d = await decks.create({ title: 'D' });
    const c = await cards.create(d.id, { reference: 'John 3:16', verseText: 'x' });
    await cards.create(d.id, { reference: 'John 3:17', verseText: 'x' });
    await reviews.record({ cardId: c.id, kind: 'recall', rating: 4, mode: 'type' });
    expect((await stats.overview(d.id, ['recall'])).books).toEqual([{ book: 'John', total: 2, memorized: 1 }]);
  });

  it('can be scoped to one deck or all decks; a card in two decks counts once overall', async () => {
    const d1 = await decks.create({ title: 'One' });
    const d2 = await decks.create({ title: 'Two' });
    const shared = await cards.create(d1.id, { reference: 'John 3:16', verseText: 'x' });
    await db.run('INSERT INTO deck_cards (deck_id, card_id, added_at) VALUES (?, ?, 0)', [d2.id, shared.id]);
    await cards.create(d2.id, { reference: 'Psalm 1:1', verseText: 'x' });
    expect((await stats.overview(d1.id, ['recall'])).totalCards).toBe(1);
    expect((await stats.overview(d2.id, ['recall'])).totalCards).toBe(2);
    expect((await stats.overview(null, ['recall'])).totalCards).toBe(2);
  });

  it('days since starting counts calendar days from the first review', async () => {
    const d = await decks.create({ title: 'D' });
    const c = await cards.create(d.id, { reference: 'John 3:16', verseText: 'x' });
    expect((await stats.overview(d.id, ['recall'])).daysSinceStarting).toBe(0); // nothing reviewed yet
    await reviews.record({ cardId: c.id, kind: 'recall', rating: 3, mode: 'flashcard' });
    expect((await stats.overview(d.id, ['recall'])).daysSinceStarting).toBe(0); // same day
    clock = NOON + 3 * DAY;
    expect((await stats.overview(d.id, ['recall'])).daysSinceStarting).toBe(3);
    expect((await stats.overview(null, ['recall'])).daysSinceStarting).toBe(3);
  });
});

describe('overview() with two study cards per verse', () => {
  const BOTH = ['recall', 'identify'] as const;

  it('counts study cards by stage, but verses for the totals', async () => {
    const d = await decks.create({ title: 'D' });
    await cards.create(d.id, { reference: 'John 3:16', verseText: 'x' });
    await cards.create(d.id, { reference: 'Psalm 23:1', verseText: 'x' });
    const o = await stats.overview(d.id, [...BOTH]);
    expect(o.totalCards).toBe(2);
    expect(o.counts).toEqual({ new: 4, learning: 0, young: 0, mature: 0 });
    expect((await stats.overview(d.id, ['recall'])).counts.new).toBe(2);
  });

  it('a verse is memorized only when every card in use is in Review', async () => {
    const d = await decks.create({ title: 'D' });
    const c = await cards.create(d.id, { reference: 'John 3:16', verseText: 'x' });
    await reviews.record({ cardId: c.id, kind: 'recall', rating: 4, mode: 'type' });
    expect((await stats.overview(d.id, [...BOTH])).memorized).toBe(0); // identify not learned yet
    expect((await stats.overview(d.id, ['recall'])).memorized).toBe(1); // only recall is in use
    await reviews.record({ cardId: c.id, kind: 'identify', rating: 4, mode: 'type' });
    const o = await stats.overview(d.id, [...BOTH]);
    expect(o.memorized).toBe(1);
    expect(o.books).toEqual([{ book: 'John', total: 1, memorized: 1 }]);
  });

  it('mastered needs every card in use to be mature', async () => {
    const d = await decks.create({ title: 'D' });
    const c = await cards.create(d.id, { reference: 'John 3:16', verseText: 'x' });
    for (const kind of BOTH) await reviews.record({ cardId: c.id, kind, rating: 4, mode: 'type' });
    await db.run("UPDATE card_schedule SET scheduled_days = 40 WHERE kind = 'recall'");
    expect((await stats.overview(d.id, [...BOTH])).mastered).toBe(0);
    await db.run("UPDATE card_schedule SET scheduled_days = 40 WHERE kind = 'identify'");
    expect((await stats.overview(d.id, [...BOTH])).mastered).toBe(1);
  });
});

describe('overview() after a mistake on a mature verse', () => {
  it('moves the card from mature to learning, and the verse out of memorized and mastered, then back as young', async () => {
    const d = await decks.create({ title: 'D' });
    const c = await cards.create(d.id, { reference: 'John 3:16', verseText: 'x' });
    const recall = ['recall'] as const;
    const study = async (rating: 1 | 2 | 3 | 4) => { await reviews.record({ cardId: c.id, kind: 'recall', rating, mode: 'type' }); };
    const dueNow = async () => { clock = (await reviews.getSchedule(c.id, 'recall'))!.due; };

    await study(4); await dueNow(); await study(4); await dueNow(); await study(4); // Easy x3: mature
    let o = await stats.overview(d.id, [...recall]);
    expect(o.counts).toEqual({ new: 0, learning: 0, young: 0, mature: 1 });
    expect([o.memorized, o.mastered]).toEqual([1, 1]);

    await dueNow(); await study(1); // a big mistake: Again
    o = await stats.overview(d.id, [...recall]);
    expect(o.counts).toEqual({ new: 0, learning: 1, young: 0, mature: 0 });
    expect([o.memorized, o.mastered]).toEqual([0, 0]);

    await dueNow(); await study(3); // recovers with Good
    o = await stats.overview(d.id, [...recall]);
    expect(o.counts).toEqual({ new: 0, learning: 0, young: 1, mature: 0 }); // young, not mature
    expect([o.memorized, o.mastered]).toEqual([1, 0]);
  });
});
