import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../test/db';
import { createDeckRepository, type DeckRepository } from './deckRepository';
import { createCardRepository, type CardRepository } from './cardRepository';
import { createReviewRepository, type ReviewRepository } from './reviewRepository';
import { createScheduler, SCHEDULER_VERSION, CardState } from '../../domain/scheduling/scheduler';
import type { Database } from '../database/Database';

const MIN = 60_000, DAY = 86_400_000;
// Local noon so "today" is unambiguous in any time zone.
const NOON = new Date(2026, 5, 10, 12, 0, 0).getTime();

let db: Database, decks: DeckRepository, cards: CardRepository, reviews: ReviewRepository, clock: number;
const scheduler = createScheduler();

beforeEach(async () => {
  db = await createTestDatabase();
  clock = NOON;
  decks = createDeckRepository(db, () => clock);
  cards = createCardRepository(db, () => clock);
  reviews = createReviewRepository(db, scheduler, () => clock);
});

const mk = async (n = 1, deckTitle = 'D') => {
  const deck = await decks.create({ title: deckTitle });
  const made = [];
  for (let i = 0; i < n; i++) { clock += 1; made.push(await cards.create(deck.id, { reference: `R ${i}`, verseText: `text ${i}` })); }
  clock = NOON;
  return { deck, cards: made };
};

describe('record()', () => {
  it('creates the schedule and a review log together on the first review', async () => {
    const { cards: [c] } = await mk();
    const s = await reviews.record({ cardId: c!.id, kind: 'recall', rating: 3, mode: 'flashcard' });
    expect(s).toMatchObject({ state: CardState.Learning, reps: 1, due: NOON + 10 * MIN, lastReview: NOON });
    expect(await reviews.getSchedule(c!.id, 'recall')).toEqual(s);
    const logs = await db.query<Record<string, number | string>>('SELECT * FROM review_logs');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ card_id: c!.id, rating: 3, study_mode: 'flashcard', state_before: 0, reviewed_at: NOON, due_before: NOON });
    const [row] = await db.query<{ scheduler_version: string }>('SELECT scheduler_version FROM card_schedule');
    expect(row!.scheduler_version).toBe(SCHEDULER_VERSION);
  });

  it('updates the single schedule row and appends a log on every later review', async () => {
    const { cards: [c] } = await mk();
    await reviews.record({ cardId: c!.id, kind: 'recall', rating: 3, mode: 'type' });
    clock += 10 * MIN;
    const s2 = await reviews.record({ cardId: c!.id, kind: 'recall', rating: 3, mode: 'blanks' });
    expect(s2.state).toBe(CardState.Review);
    expect(await db.query('SELECT 1 FROM card_schedule')).toHaveLength(1);
    const logs = await db.query<{ study_mode: string; state_before: number }>('SELECT study_mode, state_before FROM review_logs ORDER BY reviewed_at');
    expect(logs).toEqual([{ study_mode: 'type', state_before: 0 }, { study_mode: 'blanks', state_before: 1 }]);
  });

  it('persisted state gives the same next result as the in-memory scheduler (restore works)', async () => {
    const { cards: [c] } = await mk();
    const first = await reviews.record({ cardId: c!.id, kind: 'recall', rating: 3, mode: 'flashcard' });
    clock = first.due;
    const viaDb = await reviews.record({ cardId: c!.id, kind: 'recall', rating: 2, mode: 'flashcard' });
    expect(viaDb).toEqual(scheduler.review(first, 2, first.due).schedule);
  });

  it('is all-or-nothing: an unknown card writes neither schedule nor log', async () => {
    await expect(reviews.record({ cardId: 'missing', kind: 'recall', rating: 3, mode: 'flashcard' })).rejects.toThrow();
    expect(await db.query('SELECT 1 FROM card_schedule')).toHaveLength(0);
    expect(await db.query('SELECT 1 FROM review_logs')).toHaveLength(0);
  });

  it('an invalid rating writes nothing', async () => {
    const { cards: [c] } = await mk();
    await expect(reviews.record({ cardId: c!.id, kind: 'recall', rating: 7 as never, mode: 'flashcard' })).rejects.toThrow(RangeError);
    expect(await db.query('SELECT 1 FROM review_logs')).toHaveLength(0);
  });

  it('lapses are counted', async () => {
    const { cards: [c] } = await mk();
    await reviews.record({ cardId: c!.id, kind: 'recall', rating: 4, mode: 'flashcard' }); // Easy: straight to Review
    clock = (await reviews.getSchedule(c!.id, 'recall'))!.due;
    const lapsed = await reviews.record({ cardId: c!.id, kind: 'recall', rating: 1, mode: 'flashcard' });
    expect(lapsed).toMatchObject({ state: CardState.Relearning, lapses: 1 });
  });

  it('deleting the card removes its schedule and history (no orphans)', async () => {
    const { cards: [c] } = await mk();
    await reviews.record({ cardId: c!.id, kind: 'recall', rating: 3, mode: 'flashcard' });
    await cards.delete(c!.id);
    expect(await db.query('SELECT 1 FROM card_schedule')).toHaveLength(0);
    expect(await db.query('SELECT 1 FROM review_logs')).toHaveLength(0);
  });
});

describe('buildQueue()', () => {
  it('new cards are introduced up to newPerDay, in the order they were added', async () => {
    const { deck, cards: made } = await mk(5);
    const q = await reviews.buildQueue(deck.id, { newPerDay: 3, kinds: ['recall'] });
    expect(q.map((e) => e.card.id)).toEqual(made.slice(0, 3).map((c) => c.id));
    expect(q.every((e) => e.schedule === null)).toBe(true);
  });

  it('newPerDay 0 introduces nothing new', async () => {
    const { deck } = await mk(2);
    expect(await reviews.buildQueue(deck.id, { newPerDay: 0, kinds: ['recall'] })).toEqual([]);
  });

  it('cards introduced today use up the daily allowance, across decks; tomorrow it resets', async () => {
    const a = await mk(3, 'A');
    const b = await mk(3, 'B');
    await reviews.record({ cardId: a.cards[0]!.id, kind: 'recall', rating: 3, mode: 'flashcard' }); // 1 new card introduced today
    await reviews.record({ cardId: b.cards[0]!.id, kind: 'recall', rating: 3, mode: 'flashcard' }); // 2
    const today = await reviews.buildQueue(a.deck.id, { newPerDay: 3, kinds: ['recall'] });
    expect(today.filter((e) => e.schedule === null)).toHaveLength(1); // allowance 3 - 2 = 1
    clock = NOON + DAY;
    const tomorrow = await reviews.buildQueue(a.deck.id, { newPerDay: 3, kinds: ['recall'] });
    expect(tomorrow.filter((e) => e.schedule === null)).toHaveLength(2); // the other 2 not-yet-seen cards
  });

  it('re-reviewing a learning card does not use up more of the new-card allowance', async () => {
    const { deck, cards: made } = await mk(3);
    await reviews.record({ cardId: made[0]!.id, kind: 'recall', rating: 1, mode: 'flashcard' });
    clock += 2 * MIN;
    await reviews.record({ cardId: made[0]!.id, kind: 'recall', rating: 1, mode: 'flashcard' });
    const q = await reviews.buildQueue(deck.id, { newPerDay: 2, kinds: ['recall'] });
    expect(q.filter((e) => e.schedule === null)).toHaveLength(1);
  });

  it('only cards that are due (or learning and about to be) are included, oldest due first, ahead of new cards', async () => {
    const { deck, cards: made } = await mk(3);
    await reviews.record({ cardId: made[0]!.id, kind: 'recall', rating: 3, mode: 'flashcard' }); // due +10m
    await reviews.record({ cardId: made[1]!.id, kind: 'recall', rating: 1, mode: 'flashcard' }); // due +1m
    // both are learning cards due within the look-ahead, so they count already (leaving a session early must not hide them)
    expect((await reviews.buildQueue(deck.id, { newPerDay: 0, kinds: ['recall'] })).map((e) => e.card.id)).toEqual([made[1]!.id, made[0]!.id]);
    clock = NOON + 20 * MIN;
    const q = await reviews.buildQueue(deck.id, { newPerDay: 5, kinds: ['recall'] });
    expect(q.map((e) => e.card.id)).toEqual([made[1]!.id, made[0]!.id, made[2]!.id]); // due 1m, due 10m, then new
    expect(q[0]!.schedule).not.toBeNull();
    expect(q[2]!.schedule).toBeNull();
  });

  it('counts a learning card that is due within 20 minutes, but not one further away, and not a card in review', async () => {
    const { deck, cards: made } = await mk(3);
    await reviews.record({ cardId: made[0]!.id, kind: 'recall', rating: 3, mode: 'flashcard' }); // learning, due +10m
    const soon = await reviews.buildQueue(deck.id, { newPerDay: 0, kinds: ['recall'] });
    expect(soon.map((e) => e.card.id)).toEqual([made[0]!.id]);
    clock = NOON - 11 * MIN; // the same card is now 21 minutes away
    expect(await reviews.buildQueue(deck.id, { newPerDay: 0, kinds: ['recall'] })).toEqual([]);
    clock = NOON + 11 * MIN; // graduate it: now it is a review card, due in days
    await reviews.record({ cardId: made[0]!.id, kind: 'recall', rating: 3, mode: 'flashcard' });
    clock += MIN;
    expect(await reviews.buildQueue(deck.id, { newPerDay: 0, kinds: ['recall'] })).toEqual([]);
  });

  it('is scoped to the deck', async () => {
    const a = await mk(2, 'A');
    const b = await mk(2, 'B');
    const q = await reviews.buildQueue(a.deck.id, { newPerDay: 10, kinds: ['recall'] });
    expect(q.map((e) => e.card.id).sort()).toEqual(a.cards.map((c) => c.id).sort());
    expect(b.cards).toHaveLength(2);
  });

  it('nextDue() is the soonest card that is not yet due, or null', async () => {
    const { deck, cards: made } = await mk(2);
    expect(await reviews.nextDue(deck.id, ['recall'])).toBeNull(); // nothing scheduled yet
    await reviews.record({ cardId: made[0]!.id, kind: 'recall', rating: 3, mode: 'flashcard' }); // due +10m
    await reviews.record({ cardId: made[1]!.id, kind: 'recall', rating: 1, mode: 'flashcard' }); // due +1m
    expect(await reviews.nextDue(deck.id, ['recall'])).toBe(NOON + 1 * MIN);
    clock = NOON + 5 * MIN; // the 1m card is now due, so the next one is the 10m card
    expect(await reviews.nextDue(deck.id, ['recall'])).toBe(NOON + 10 * MIN);
    clock = NOON + DAY;
    expect(await reviews.nextDue(deck.id, ['recall'])).toBeNull(); // both are due, none upcoming
  });
});

describe('stats()', () => {
  it('counts new, learning, young, mature and due', async () => {
    const { deck, cards: made } = await mk(4);
    expect(await reviews.stats(deck.id, ['recall'])).toEqual({ total: 4, new: 4, learning: 0, young: 0, mature: 0, due: 0 });
    await reviews.record({ cardId: made[0]!.id, kind: 'recall', rating: 3, mode: 'flashcard' }); // learning
    await reviews.record({ cardId: made[1]!.id, kind: 'recall', rating: 4, mode: 'flashcard' }); // review (young)
    // make one card mature directly, to avoid depending on exact FSRS intervals
    await reviews.record({ cardId: made[2]!.id, kind: 'recall', rating: 4, mode: 'flashcard' });
    await db.run('UPDATE card_schedule SET scheduled_days = 40 WHERE card_id = ?', [made[2]!.id]);
    const s = await reviews.stats(deck.id, ['recall']);
    expect(s).toMatchObject({ total: 4, new: 1, learning: 1, young: 1, mature: 1, due: 0 });
    clock = NOON + 11 * MIN;
    expect((await reviews.stats(deck.id, ['recall'])).due).toBe(1); // the learning card
  });
  it('an empty deck has all zeros', async () => {
    const deck = await decks.create({ title: 'E' });
    expect(await reviews.stats(deck.id, ['recall'])).toEqual({ total: 0, new: 0, learning: 0, young: 0, mature: 0, due: 0 });
  });
});

describe('two study cards per verse (recall and identify)', () => {
  const BOTH = ['recall', 'identify'] as const;

  it('each kind has its own schedule and its own review history', async () => {
    const { cards: [c] } = await mk();
    await reviews.record({ cardId: c!.id, kind: 'recall', rating: 4, mode: 'type' });
    expect(await reviews.getSchedule(c!.id, 'identify')).toBeUndefined();
    await reviews.record({ cardId: c!.id, kind: 'identify', rating: 1, mode: 'flashcard' });
    const recall = await reviews.getSchedule(c!.id, 'recall');
    const identify = await reviews.getSchedule(c!.id, 'identify');
    expect(recall!.state).toBe(CardState.Review);
    expect(identify!.state).toBe(CardState.Learning);
    expect(await db.query('SELECT 1 FROM card_schedule')).toHaveLength(2);
    expect(await db.query<{ kind: string }>('SELECT kind FROM review_logs ORDER BY reviewed_at, kind')).toEqual([{ kind: 'identify' }, { kind: 'recall' }]);
  });

  it('rejects an unknown kind and writes nothing', async () => {
    const { cards: [c] } = await mk();
    await expect(reviews.record({ cardId: c!.id, kind: 'bogus' as never, rating: 3, mode: 'flashcard' })).rejects.toThrow();
    expect(await db.query('SELECT 1 FROM review_logs')).toHaveLength(0);
  });

  it("a verse's two cards can both be studied on the same day, recall first", async () => {
    const { deck, cards: made } = await mk(2);
    const q = await reviews.buildQueue(deck.id, { newPerDay: 10, kinds: [...BOTH] });
    expect(q.map((e) => [e.card.id, e.kind])).toEqual([
      [made[0]!.id, 'recall'], [made[0]!.id, 'identify'], [made[1]!.id, 'recall'], [made[1]!.id, 'identify'],
    ]);
  });

  it('studying one card of a verse does not hold back its other card', async () => {
    const { deck, cards: [c] } = await mk(1);
    await reviews.record({ cardId: c!.id, kind: 'recall', rating: 4, mode: 'type' }); // graduates, due in days
    const q = await reviews.buildQueue(deck.id, { newPerDay: 10, kinds: [...BOTH] });
    expect(q.map((e) => e.kind)).toEqual(['identify']); // still available today
  });

  it('new-card allowance counts study cards', async () => {
    const { deck } = await mk(3);
    expect(await reviews.buildQueue(deck.id, { newPerDay: 3, kinds: [...BOTH] })).toHaveLength(3);
    expect(await reviews.buildQueue(deck.id, { newPerDay: 0, kinds: [...BOTH] })).toEqual([]);
  });

  it('only the chosen kinds are studied', async () => {
    const { deck } = await mk(2);
    const onlyIdentify = await reviews.buildQueue(deck.id, { newPerDay: 10, kinds: ['identify'] });
    expect(onlyIdentify.map((e) => e.kind)).toEqual(['identify', 'identify']);
    expect(await reviews.buildQueue(deck.id, { newPerDay: 10, kinds: [] })).toEqual([]);
  });

  it('nextDue is the soonest upcoming due time, or null when nothing is scheduled', async () => {
    const { deck, cards: [c] } = await mk(1);
    expect(await reviews.nextDue(deck.id, [...BOTH])).toBeNull();
    await reviews.record({ cardId: c!.id, kind: 'recall', rating: 4, mode: 'type' });
    const due = (await reviews.getSchedule(c!.id, 'recall'))!.due;
    expect(await reviews.nextDue(deck.id, [...BOTH])).toBe(due);
    expect(await reviews.nextDue(deck.id, ['identify'])).toBeNull(); // identify cards are not scheduled yet
  });

  it('stats count study cards: two per verse when both kinds are in use', async () => {
    const { deck, cards: made } = await mk(2);
    expect(await reviews.stats(deck.id, [...BOTH])).toEqual({ total: 4, new: 4, learning: 0, young: 0, mature: 0, due: 0 });
    expect((await reviews.stats(deck.id, ['identify'])).total).toBe(2);
    await reviews.record({ cardId: made[0]!.id, kind: 'identify', rating: 4, mode: 'type' });
    expect(await reviews.stats(deck.id, [...BOTH])).toMatchObject({ total: 4, new: 3, young: 1 });
  });

  it('extra practice lists every study card and writes nothing', async () => {
    const { deck } = await mk(2);
    const before = await db.query('SELECT * FROM review_logs');
    const all = await reviews.listForExtraPractice(deck.id, [...BOTH]);
    expect(all).toHaveLength(4);
    expect(all.filter((e) => e.kind === 'identify')).toHaveLength(2);
    expect(await db.query('SELECT * FROM review_logs')).toEqual(before);
    expect(await db.query('SELECT 1 FROM card_schedule')).toHaveLength(0);
  });
});

describe('dueCounts()', () => {
  it('gives each deck its due-plus-new count and shares the new-card limit across decks', async () => {
    const a = await mk(2, 'A');
    const b = await mk(2, 'B');
    const empty = await decks.create({ title: 'C empty' });
    const kinds = ['recall'] as ('recall' | 'identify')[];
    expect(await reviews.dueCounts({ newPerDay: 10, kinds })).toEqual({ [a.deck.id]: 2, [b.deck.id]: 2, [empty.id]: 0 });
    // a limit of 3 is shared: deck A (first by title) takes 2, deck B gets what is left
    expect(await reviews.dueCounts({ newPerDay: 3, kinds })).toEqual({ [a.deck.id]: 2, [b.deck.id]: 1, [empty.id]: 0 });
  });

  it('counts due reviews and reflects what has been studied today', async () => {
    const a = await mk(2, 'A');
    const kinds = ['recall'] as ('recall' | 'identify')[];
    await reviews.record({ cardId: a.cards[0]!.id, kind: 'recall', rating: 1, mode: 'type' }); // due in 1m
    expect((await reviews.dueCounts({ newPerDay: 10, kinds }))[a.deck.id]).toBe(2); // one new left, and the learning card coming back within minutes
    clock = NOON + 2 * MIN;
    expect((await reviews.dueCounts({ newPerDay: 10, kinds }))[a.deck.id]).toBe(2); // the learning card is due again
  });

  it('is zero everywhere when no card kinds are in use', async () => {
    const a = await mk(1, 'A');
    expect(await reviews.dueCounts({ newPerDay: 10, kinds: [] })).toEqual({ [a.deck.id]: 0 });
  });
});
