import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../test/db';
import { createDeckRepository } from '../../data/repositories/deckRepository';
import { createCardRepository } from '../../data/repositories/cardRepository';
import { createSharingRepository } from '../../data/repositories/sharingRepository';
import type { Database } from '../../data/database/Database';
import { PublishBlockedError, blockReason, createSyncEngine } from './syncEngine';
import { createFakeCloud } from './fakeCloud';

let db: Database;
let decks: ReturnType<typeof createDeckRepository>;
let cards: ReturnType<typeof createCardRepository>;
let sharing: ReturnType<typeof createSharingRepository>;
let cloud: ReturnType<typeof createFakeCloud>;
let signedIn = true;
let engine: ReturnType<typeof createSyncEngine>;

beforeEach(async () => {
  db = await createTestDatabase();
  let tick = 1000; // every action happens a millisecond after the last, so cards keep a definite order
  const clock = () => tick++;
  decks = createDeckRepository(db, clock);
  cards = createCardRepository(db, clock);
  sharing = createSharingRepository(db);
  cloud = createFakeCloud();
  signedIn = true;
  engine = createSyncEngine({ sharing, cloud, ready: () => signedIn, delayMs: 5 });
});

async function psalms(translationCode: string | null = 'KJV', n = 3) {
  const d = await decks.create({ title: 'Psalms', description: 'Shepherd', translationCode, bibleLanguage: translationCode === 'OWN' ? 'es' : null });
  const made = [];
  for (let i = 1; i <= n; i++) made.push(await cards.create(d.id, { reference: `Psalm 23:${i}`, verseText: `Verse ${i} text.` }));
  return { deck: d, cards: made };
}
const publishId = async (deckId: string) => (await sharing.getDeck(deckId))!.publishId!;
const sent = () => cloud.log.filter((l) => !l.startsWith('removeDeck'));

describe('who may publish what', () => {
  it('needs an open translation, in a language we know, and a sensible number of cards', () => {
    expect(blockReason({ translationCode: 'KJV', bibleLanguage: null }, 3)).toBeNull();
    expect(blockReason({ translationCode: 'RV1909', bibleLanguage: null }, 3)).toBeNull();
    expect(blockReason({ translationCode: 'OWN', bibleLanguage: 'es' }, 3)).toBeNull();
    expect(blockReason({ translationCode: null, bibleLanguage: null }, 3)).toBe('no-translation');
    expect(blockReason({ translationCode: 'NIV', bibleLanguage: 'en' }, 3)).toBe('copyrighted');
    expect(blockReason({ translationCode: 'OWN', bibleLanguage: null }, 3)).toBe('no-language');
    expect(blockReason({ translationCode: 'OWN', bibleLanguage: 'fr' }, 3)).toBe('no-language');
    expect(blockReason({ translationCode: 'KJV', bibleLanguage: null }, 1001)).toBe('too-many-cards');
    expect(blockReason({ translationCode: 'KJV', bibleLanguage: null }, 1000)).toBeNull();
  });

  it('refuses to publish a copyrighted or untranslated deck, and marks nothing', async () => {
    for (const code of ['NIV', null]) {
      const { deck } = await psalms(code);
      await expect(engine.publish(deck.id)).rejects.toBeInstanceOf(PublishBlockedError);
      expect((await sharing.getDeck(deck.id))!.publishId).toBeNull();
    }
    expect(cloud.log).toEqual([]);
  });
});

describe('publishing', () => {
  it('sends the deck and every card, in order, in the deck\'s language', async () => {
    const { deck, cards: made } = await psalms('RV1909');
    await engine.publish(deck.id);
    const id = await publishId(deck.id);
    const copy = cloud.decks.get(id)!;
    expect(copy.meta).toEqual({ title: 'Psalms', description: 'Shepherd', translation: 'RV1909', language: 'es', cardCount: 3 });
    expect([...copy.cards.values()].map((c) => [c.id, c.position, c.reference])).toEqual(made.map((c, i) => [c.id, i, c.reference]));
    expect(engine.status(deck.id)).toEqual({ state: 'synced' });
  });

  it('a second pass with nothing changed sends nothing', async () => {
    const { deck } = await psalms();
    await engine.publish(deck.id);
    const before = cloud.log.length;
    await engine.syncAll();
    expect(cloud.log.length).toBe(before);
  });

  it('big decks go out in chunks of 400', async () => {
    const { deck } = await psalms('KJV', 0);
    await cards.createMany(deck.id, Array.from({ length: 450 }, (_, i) => ({ reference: `X ${i + 1}:1`, verseText: `t${i}` })));
    await engine.publish(deck.id);
    expect(cloud.log.filter((l) => l.startsWith('putCards'))).toEqual(['putCards 400', 'putCards 50']);
    expect(cloud.decks.get(await publishId(deck.id))!.cards.size).toBe(450);
  });
});

describe('keeping the copy in step', () => {
  it('editing one card sends just that card', async () => {
    const { deck, cards: made } = await psalms();
    await engine.publish(deck.id);
    cloud.log.length = 0;
    await cards.update(made[1]!.id, { reference: 'Psalm 23:2', verseText: 'Changed text.' });
    await engine.syncAll();
    expect(cloud.log).toEqual(['putCards 1']);
    expect(cloud.decks.get(await publishId(deck.id))!.cards.get(made[1]!.id)!.verseText).toBe('Changed text.');
  });

  it('renaming the deck sends just the details', async () => {
    const { deck } = await psalms();
    await engine.publish(deck.id);
    cloud.log.length = 0;
    await decks.update(deck.id, { title: 'Psalm 23, renamed', description: 'Shepherd' });
    await engine.syncAll();
    expect(cloud.log).toEqual([`updateDeck ${await publishId(deck.id)}`]);
    expect(cloud.decks.get(await publishId(deck.id))!.meta.title).toBe('Psalm 23, renamed');
  });

  it('adding a card sends it and the new card count', async () => {
    const { deck } = await psalms();
    await engine.publish(deck.id);
    cloud.log.length = 0;
    await cards.create(deck.id, { reference: 'Psalm 23:4', verseText: 'Yea, though I walk.' });
    await engine.syncAll();
    expect(cloud.log).toEqual(['putCards 1', `updateDeck ${await publishId(deck.id)}`]);
    expect(cloud.decks.get(await publishId(deck.id))!.meta.cardCount).toBe(4);
  });

  it('deleting a card removes it from the copy, and the cards after it keep the right positions', async () => {
    const { deck, cards: made } = await psalms();
    await engine.publish(deck.id);
    cloud.log.length = 0;
    await cards.delete(made[0]!.id);
    await engine.syncAll();
    const copy = cloud.decks.get(await publishId(deck.id))!;
    expect([...copy.cards.keys()].sort()).toEqual([made[1]!.id, made[2]!.id].sort());
    expect(copy.cards.get(made[1]!.id)!.position).toBe(0);
    expect(copy.cards.get(made[2]!.id)!.position).toBe(1);
    expect(copy.meta.cardCount).toBe(2);
    expect(await sharing.pendingCardRemovals(await publishId(deck.id))).toEqual([]); // the debt is paid
  });

  it('changing the translation to a copyrighted one stops the sync and says why', async () => {
    const { deck } = await psalms();
    await engine.publish(deck.id);
    cloud.log.length = 0;
    await decks.update(deck.id, { title: 'Psalms', translationCode: 'NIV' });
    await engine.syncAll();
    expect(cloud.log).toEqual([]);
    expect(engine.status(deck.id)).toEqual({ state: 'blocked', reason: 'copyrighted' });
  });

  it('an unpublished deck is never sent', async () => {
    const { deck } = await psalms();
    await engine.syncAll();
    expect(cloud.log).toEqual([]);
    expect(engine.status(deck.id)).toBeUndefined();
  });
});

describe('when it cannot reach the cloud', () => {
  it('signed out: waits, sends nothing, then catches up when signed in', async () => {
    const { deck } = await psalms();
    await engine.publish(deck.id);
    cloud.log.length = 0;
    signedIn = false;
    await cards.create(deck.id, { reference: 'Psalm 23:5', verseText: 'Thou preparest.' });
    await engine.syncAll();
    expect(cloud.log).toEqual([]);
    expect(engine.status(deck.id)).toEqual({ state: 'waiting' });
    signedIn = true;
    await engine.syncAll();
    expect(cloud.decks.get(await publishId(deck.id))!.cards.size).toBe(4);
    expect(engine.status(deck.id)).toEqual({ state: 'synced' });
  });

  it('a failed send is retried, and nothing is marked sent that was not', async () => {
    const { deck, cards: made } = await psalms();
    await engine.publish(deck.id);
    await cards.delete(made[0]!.id);
    cloud.failNext();
    await engine.syncAll();
    expect(engine.status(deck.id)).toEqual({ state: 'waiting' });
    expect(cloud.decks.get(await publishId(deck.id))!.cards.has(made[0]!.id)).toBe(true); // still there: the removal did not go through
    await engine.syncAll();
    expect(cloud.decks.get(await publishId(deck.id))!.cards.has(made[0]!.id)).toBe(false);
    expect(engine.status(deck.id)).toEqual({ state: 'synced' });
  });

  it('a first publish that fails part-way can be completed by publishing again', async () => {
    const { deck } = await psalms();
    cloud.failNext();
    await expect(engine.publish(deck.id)).rejects.toThrow('offline');
    expect(engine.status(deck.id)).toEqual({ state: 'waiting' });
    await engine.syncAll();
    expect(cloud.decks.get(await publishId(deck.id))!.cards.size).toBe(3);
  });
});

describe('taking it down', () => {
  it('unpublishing removes the public copy and keeps the deck', async () => {
    const { deck } = await psalms();
    await engine.publish(deck.id);
    const id = await publishId(deck.id);
    await engine.unpublish(deck.id);
    expect(cloud.decks.has(id)).toBe(false);
    expect((await sharing.getDeck(deck.id))!.publishId).toBeNull();
    expect(await cards.listByDeck(deck.id)).toHaveLength(3);
    cloud.log.length = 0;
    await cards.create(deck.id, { reference: 'Psalm 23:6', verseText: 'Surely goodness.' });
    await engine.syncAll();
    expect(cloud.log).toEqual([]); // no longer synced
  });

  it('unpublishing offline fails and leaves the deck published', async () => {
    const { deck } = await psalms();
    await engine.publish(deck.id);
    cloud.failNext();
    await expect(engine.unpublish(deck.id)).rejects.toThrow('offline');
    expect((await sharing.getDeck(deck.id))!.publishId).not.toBeNull();
  });

  it('deleting a published deck locally removes the public copy too', async () => {
    const { deck } = await psalms();
    await engine.publish(deck.id);
    const id = await publishId(deck.id);
    await decks.delete(deck.id);
    await engine.syncAll();
    expect(cloud.decks.has(id)).toBe(false);
    expect(await sharing.pendingDeckRemovals()).toEqual([]);
  });

  it('if it cannot be removed right away (offline), it is removed when it can be', async () => {
    const { deck } = await psalms();
    await engine.publish(deck.id);
    const id = await publishId(deck.id);
    await decks.delete(deck.id);
    cloud.failNext();
    await engine.syncAll();
    expect(cloud.decks.has(id)).toBe(true);
    expect(await sharing.pendingDeckRemovals()).toEqual([id]);
    await engine.syncAll();
    expect(cloud.decks.has(id)).toBe(false);
  });
});

describe('scheduling', () => {
  it('a burst of edits is sent once, a moment later', async () => {
    const { deck, cards: made } = await psalms();
    await engine.publish(deck.id);
    cloud.log.length = 0;
    for (let i = 0; i < 5; i++) { await cards.update(made[0]!.id, { reference: 'Psalm 23:1', verseText: `Edit ${i}` }); engine.schedule(); }
    expect(sent()).toEqual([]); // not yet
    await new Promise((r) => setTimeout(r, 60));
    expect(sent()).toEqual(['putCards 1']);
  });
});
