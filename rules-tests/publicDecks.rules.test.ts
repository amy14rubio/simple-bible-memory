import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

/** Tries to break the Firestore rules, the way a stranger or a buggy app would. Run with `npm run test:rules`. */
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-simple-bible-memory', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const alice = () => env.authenticatedContext('alice').firestore();
const bob = () => env.authenticatedContext('bob').firestore();
const stranger = () => env.unauthenticatedContext().firestore();

const newDeck = (over: Record<string, unknown> = {}) => ({
  ownerId: 'alice', title: 'Psalm 23', titleLower: 'psalm 23', description: 'The shepherd psalm', translation: 'KJV', language: 'en',
  cardCount: 2, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...over,
});
const card = (over: Record<string, unknown> = {}) => ({ reference: 'Psalm 23:1', verseText: 'The Lord is my shepherd; I shall not want.', position: 0, ...over });

/** A published deck owned by alice, written with the rules switched off. */
const seed = (id = 'd1') => env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'publicDecks', id), { ...newDeck(), createdAt: Timestamp.fromMillis(1000), updatedAt: Timestamp.fromMillis(1000) });
  await setDoc(doc(db, 'publicDecks', id, 'cards', 'c1'), card());
});

describe('reading', () => {
  it('anyone can read public decks and their cards, signed in or not', async () => {
    await seed();
    for (const db of [stranger(), alice(), bob()]) {
      await assertSucceeds(getDoc(doc(db, 'publicDecks', 'd1')));
      await assertSucceeds(getDoc(doc(db, 'publicDecks', 'd1', 'cards', 'c1')));
      await assertSucceeds(getDocs(collection(db, 'publicDecks', 'd1', 'cards')));
    }
  });

  it('anyone can list decks, newest first', async () => {
    await seed();
    await assertSucceeds(getDocs(query(collection(stranger(), 'publicDecks'), orderBy('createdAt', 'desc'))));
  });

  it('nothing outside public decks can be read or written, by anyone', async () => {
    for (const db of [stranger(), alice()]) {
      await assertFails(getDoc(doc(db, 'users', 'alice')));
      await assertFails(setDoc(doc(db, 'users', 'alice'), { anything: true }));
      await assertFails(getDocs(collection(db, 'reports')));
      await assertFails(setDoc(doc(db, 'somethingElse', 'x'), { a: 1 }));
    }
  });
});

describe('publishing a deck', () => {
  it('a signed-in person can publish a valid deck as themselves', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'publicDecks', 'd1'), newDeck()));
  });

  it('a stranger who is not signed in cannot publish', async () => {
    await assertFails(setDoc(doc(stranger(), 'publicDecks', 'd1'), newDeck()));
  });

  it('cannot publish as somebody else', async () => {
    await assertFails(setDoc(doc(bob(), 'publicDecks', 'd1'), newDeck({ ownerId: 'alice' })));
  });

  it('only open translations (or "my own words") are accepted, and must match the language', async () => {
    for (const translation of ['KJV', 'WEB', 'ASV', 'YLT', 'DARBY']) await assertSucceeds(setDoc(doc(alice(), 'publicDecks', `en-${translation}`), newDeck({ translation, language: 'en' })));
    await assertSucceeds(setDoc(doc(alice(), 'publicDecks', 'es'), newDeck({ translation: 'RV1909', language: 'es' })));
    await assertSucceeds(setDoc(doc(alice(), 'publicDecks', 'own-en'), newDeck({ translation: 'OWN', language: 'en' })));
    await assertSucceeds(setDoc(doc(alice(), 'publicDecks', 'own-es'), newDeck({ translation: 'OWN', language: 'es' })));

    for (const translation of ['NIV', 'ESV', 'RVR1960', 'NKJV', 'NLT', '', 'kjv']) await assertFails(setDoc(doc(alice(), 'publicDecks', `bad-${translation}`), newDeck({ translation })));
    await assertFails(setDoc(doc(alice(), 'publicDecks', 'x1'), newDeck({ translation: 'KJV', language: 'es' }))); // KJV is English
    await assertFails(setDoc(doc(alice(), 'publicDecks', 'x2'), newDeck({ translation: 'RV1909', language: 'en' })));
    await assertFails(setDoc(doc(alice(), 'publicDecks', 'x3'), newDeck({ translation: 'OWN', language: 'fr' })));
    await assertFails(setDoc(doc(alice(), 'publicDecks', 'x4'), newDeck({ translation: null })));
  });

  it('a missing translation is refused', async () => {
    const { translation: _t, ...without } = newDeck();
    await assertFails(setDoc(doc(alice(), 'publicDecks', 'd1'), without));
  });

  it('bad titles, descriptions and counts are refused', async () => {
    const cases: Record<string, unknown>[] = [
      { title: '', titleLower: '' }, { title: 'x'.repeat(201), titleLower: 'x'.repeat(201) }, { title: 42, titleLower: '42' },
      { titleLower: 'something else' }, // must be the lower-case title
      { description: 'x'.repeat(2001) }, { description: 42 },
      { cardCount: -1 }, { cardCount: 1001 }, { cardCount: 1.5 }, { cardCount: '2' },
    ];
    for (const [i, over] of cases.entries()) await assertFails(setDoc(doc(alice(), 'publicDecks', `bad${i}`), newDeck(over)));
    await assertSucceeds(setDoc(doc(alice(), 'publicDecks', 'edge1'), newDeck({ title: 'x'.repeat(200), titleLower: 'x'.repeat(200), cardCount: 1000 })));
    await assertSucceeds(setDoc(doc(alice(), 'publicDecks', 'edge2'), newDeck({ description: null })));
  });

  it('the dates must be the server time, not whatever the app claims', async () => {
    await assertFails(setDoc(doc(alice(), 'publicDecks', 'd1'), newDeck({ createdAt: Timestamp.fromMillis(5) })));
    await assertFails(setDoc(doc(alice(), 'publicDecks', 'd2'), newDeck({ updatedAt: Timestamp.fromMillis(5) })));
  });

  it('extra fields are refused, so nothing sneaks in', async () => {
    await assertFails(setDoc(doc(alice(), 'publicDecks', 'd1'), newDeck({ email: 'alice@example.com' })));
    await assertFails(setDoc(doc(alice(), 'publicDecks', 'd2'), newDeck({ isFeatured: true })));
  });
});

describe('changing and removing a published deck', () => {
  it('the author can update it; the dates and owner stay put', async () => {
    await seed();
    await assertSucceeds(updateDoc(doc(alice(), 'publicDecks', 'd1'), { title: 'Psalm 23 (new)', titleLower: 'psalm 23 (new)', updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(alice(), 'publicDecks', 'd1'), { cardCount: 5, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(alice(), 'publicDecks', 'd1'), { ownerId: 'bob', updatedAt: serverTimestamp() })); // cannot give it away
    await assertFails(updateDoc(doc(alice(), 'publicDecks', 'd1'), { createdAt: serverTimestamp(), updatedAt: serverTimestamp() })); // cannot rewrite history
    await assertFails(updateDoc(doc(alice(), 'publicDecks', 'd1'), { translation: 'NIV', updatedAt: serverTimestamp() })); // still only open translations
    await assertFails(updateDoc(doc(alice(), 'publicDecks', 'd1'), { title: 'No new updatedAt', titleLower: 'no new updatedat' })); // updatedAt must move to now
  });

  it('nobody else can change or remove it, signed in or not', async () => {
    await seed();
    for (const db of [bob(), stranger()]) {
      await assertFails(updateDoc(doc(db, 'publicDecks', 'd1'), { title: 'Hijacked', titleLower: 'hijacked', updatedAt: serverTimestamp() }));
      await assertFails(deleteDoc(doc(db, 'publicDecks', 'd1')));
      await assertFails(setDoc(doc(db, 'publicDecks', 'd1'), newDeck({ ownerId: 'bob' })));
    }
    await assertSucceeds(getDoc(doc(alice(), 'publicDecks', 'd1'))); // still there
  });

  it('the author can delete it', async () => {
    await seed();
    await assertSucceeds(deleteDoc(doc(alice(), 'publicDecks', 'd1')));
  });
});

describe('cards in a published deck', () => {
  it('the author can add, change and remove cards', async () => {
    await seed();
    await assertSucceeds(setDoc(doc(alice(), 'publicDecks', 'd1', 'cards', 'c2'), card({ reference: 'Psalm 23:2', position: 1 })));
    await assertSucceeds(updateDoc(doc(alice(), 'publicDecks', 'd1', 'cards', 'c2'), { verseText: 'He maketh me to lie down in green pastures.' }));
    await assertSucceeds(deleteDoc(doc(alice(), 'publicDecks', 'd1', 'cards', 'c2')));
  });

  it('a batch of cards works, as the app writes them', async () => {
    await seed();
    const db = alice();
    const batch = writeBatch(db);
    for (let i = 0; i < 50; i++) batch.set(doc(db, 'publicDecks', 'd1', 'cards', `n${i}`), card({ reference: `Psalm 23:${i + 1}`, position: i }));
    await assertSucceeds(batch.commit());
  });

  it('nobody else can add, change or remove cards', async () => {
    await seed();
    for (const db of [bob(), stranger()]) {
      await assertFails(setDoc(doc(db, 'publicDecks', 'd1', 'cards', 'evil'), card()));
      await assertFails(updateDoc(doc(db, 'publicDecks', 'd1', 'cards', 'c1'), { verseText: 'Vandalised' }));
      await assertFails(deleteDoc(doc(db, 'publicDecks', 'd1', 'cards', 'c1')));
    }
  });

  it('cards need a reference and text, within the size limits, and nothing extra (a private note is never accepted)', async () => {
    await seed();
    const cases: Record<string, unknown>[] = [
      { reference: '' }, { reference: 'x'.repeat(201) }, { verseText: '' }, { verseText: 'x'.repeat(20001) },
      { note: 'my private reminder' }, { note: null }, { position: -1 }, { position: 1000 }, { position: 1.5 }, { extra: 'nope' },
    ];
    for (const [i, over] of cases.entries()) await assertFails(setDoc(doc(alice(), 'publicDecks', 'd1', 'cards', `bad${i}`), card(over)));
    await assertSucceeds(setDoc(doc(alice(), 'publicDecks', 'd1', 'cards', 'big'), card({ verseText: 'x'.repeat(20000), reference: 'x'.repeat(200), position: 999 })));
  });

  it('cards cannot be added to a deck that does not exist', async () => {
    await assertFails(setDoc(doc(alice(), 'publicDecks', 'ghost', 'cards', 'c1'), card()));
  });

  it('cards are removed before the deck: afterwards nobody owns them any more', async () => {
    await seed();
    await assertSucceeds(deleteDoc(doc(alice(), 'publicDecks', 'd1', 'cards', 'c1')));
    await assertSucceeds(deleteDoc(doc(alice(), 'publicDecks', 'd1')));
  });
});

describe('the format version (v) of a published deck', () => {
  const seedAt = (v: number) => env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'publicDecks', 'd1'), { ...newDeck({ v }), createdAt: Timestamp.fromMillis(1000), updatedAt: Timestamp.fromMillis(1000) });
    await setDoc(doc(db, 'publicDecks', 'd1', 'cards', 'c1'), card({ v }));
  });

  it('a deck and its cards may carry v (a whole number from 1), or none at all (published before versions existed)', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'publicDecks', 'a'), newDeck({ v: 1 })));
    await assertSucceeds(setDoc(doc(alice(), 'publicDecks', 'b'), newDeck()));
    await assertFails(setDoc(doc(alice(), 'publicDecks', 'c'), newDeck({ v: 0 })));
    await assertFails(setDoc(doc(alice(), 'publicDecks', 'c'), newDeck({ v: 1.5 })));
    await assertFails(setDoc(doc(alice(), 'publicDecks', 'c'), newDeck({ v: 'two' })));
    await assertSucceeds(setDoc(doc(alice(), 'publicDecks', 'a', 'cards', 'x'), card({ v: 1 })));
    await assertFails(setDoc(doc(alice(), 'publicDecks', 'a', 'cards', 'y'), card({ v: 0 })));
  });

  it('a deck saved in a newer format is never changed back to an older one, by its author or anyone', async () => {
    await seedAt(2);
    await assertFails(updateDoc(doc(alice(), 'publicDecks', 'd1'), { v: 1, updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(alice(), 'publicDecks', 'd1'), { v: 2, title: 'Still fine', titleLower: 'still fine', updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(alice(), 'publicDecks', 'd1'), { v: 3, updatedAt: serverTimestamp() }));
  });

  it('a card saved in a newer format cannot be replaced by an older one (an older app writes whole cards)', async () => {
    await seedAt(2);
    await assertFails(setDoc(doc(alice(), 'publicDecks', 'd1', 'cards', 'c1'), card({ v: 1, verseText: 'An older app' })));
    await assertFails(setDoc(doc(alice(), 'publicDecks', 'd1', 'cards', 'c1'), card({ verseText: 'An app with no versions' })));
    await assertSucceeds(setDoc(doc(alice(), 'publicDecks', 'd1', 'cards', 'c1'), card({ v: 2, verseText: 'The newer app' })));
    await assertSucceeds(setDoc(doc(alice(), 'publicDecks', 'd1', 'cards', 'c2'), card({ v: 1 }))); // a new card is a new card
  });
});


describe('decks with licensed cards: published as references, without the publisher\'s text', () => {
  const licensedCard = (over: Record<string, unknown> = {}) => ({ reference: 'John 3:16', verseText: '', position: 0, translation: 'NASB2020', v: 2, ...over });
  const licensedDeck = (over: Record<string, unknown> = {}) => newDeck({ translation: 'NASB2020', language: 'en', v: 2, ...over });

  it('a licensed card is accepted without text, and refused with it', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'publicDecks', 'a'), licensedDeck()));
    await assertSucceeds(setDoc(doc(alice(), 'publicDecks', 'a', 'cards', 'c1'), licensedCard()));
    await assertFails(setDoc(doc(alice(), 'publicDecks', 'a', 'cards', 'c2'), licensedCard({ verseText: 'For God so loved the world' })));
    await assertFails(setDoc(doc(alice(), 'publicDecks', 'a', 'cards', 'c3'), licensedCard({ v: 1 }))); // only in the newer format
    await assertFails(setDoc(doc(alice(), 'publicDecks', 'a', 'cards', 'c4'), licensedCard({ translation: 'YV2692', verseText: 'text' }))); // any licensed code
    await assertSucceeds(setDoc(doc(alice(), 'publicDecks', 'a', 'cards', 'c5'), licensedCard({ translation: 'YV2692' })));
  });

  it('an open card keeps its text, and may name its own open translation', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'publicDecks', 'a'), licensedDeck({ translation: 'MIXED' })));
    await assertSucceeds(setDoc(doc(alice(), 'publicDecks', 'a', 'cards', 'c1'), card({ translation: 'KJV', v: 2 })));
    await assertFails(setDoc(doc(alice(), 'publicDecks', 'a', 'cards', 'c2'), card({ translation: 'KJV', v: 2, verseText: '' })));
  });

  it('a deck can be labelled with a licensed translation, or MIXED, in any language, but only in the newer format', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'publicDecks', 'a'), licensedDeck({ translation: 'YV93', language: 'fr' })));
    await assertSucceeds(setDoc(doc(alice(), 'publicDecks', 'b'), licensedDeck({ translation: 'MIXED', language: 'es' })));
    await assertFails(setDoc(doc(alice(), 'publicDecks', 'c'), licensedDeck({ v: 1 })));
    await assertFails(setDoc(doc(alice(), 'publicDecks', 'd'), licensedDeck({ language: 'English' }))); // a language code
    await assertFails(setDoc(doc(alice(), 'publicDecks', 'e'), licensedDeck({ language: 'fr', translation: 'KJV' }))); // an open translation keeps its own language
  });
});
