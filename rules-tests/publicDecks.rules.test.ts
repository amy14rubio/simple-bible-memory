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
const card = (over: Record<string, unknown> = {}) => ({ reference: 'Psalm 23:1', verseText: 'The Lord is my shepherd; I shall not want.', note: null, position: 0, ...over });

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

  it('cards need a reference and text, within the size limits, and nothing extra', async () => {
    await seed();
    const cases: Record<string, unknown>[] = [
      { reference: '' }, { reference: 'x'.repeat(201) }, { verseText: '' }, { verseText: 'x'.repeat(20001) },
      { note: 'x'.repeat(501) }, { note: 5 }, { position: -1 }, { position: 1000 }, { position: 1.5 }, { extra: 'nope' },
    ];
    for (const [i, over] of cases.entries()) await assertFails(setDoc(doc(alice(), 'publicDecks', 'd1', 'cards', `bad${i}`), card(over)));
    await assertSucceeds(setDoc(doc(alice(), 'publicDecks', 'd1', 'cards', 'big'), card({ verseText: 'x'.repeat(20000), reference: 'x'.repeat(200), note: 'x'.repeat(500), position: 999 })));
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
