import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, addDoc, collection, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, deleteDoc, type Firestore } from 'firebase/firestore';
import { createFirestoreDiscover } from '../src/features/discover/firestoreDiscover';
import { NO_FILTERS, PAGE_SIZE } from '../src/features/discover/types';

/** Browsing the public catalogue and reporting a deck, as a stranger who is not signed in. */
let env: RulesTestEnvironment;
beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-simple-bible-memory', firestore: { rules: readFileSync('firestore.rules', 'utf8') } }); });
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const stranger = () => env.unauthenticatedContext().firestore() as unknown as Firestore;
const discover = () => createFirestoreDiscover(stranger());

/** Publishes decks with the rules switched off: [id, title, translation, language, created at]. */
async function seed(decks: [string, string, string, string, number][]) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [id, title, translation, language, at] of decks) {
      await setDoc(doc(db, 'publicDecks', id), { ownerId: 'alice', title, titleLower: title.toLowerCase(), description: null, translation, language, cardCount: 2, createdAt: Timestamp.fromMillis(at), updatedAt: Timestamp.fromMillis(at) });
      await setDoc(doc(db, 'publicDecks', id, 'cards', 'b'), { reference: `${title} 2`, verseText: 'second', position: 1 });
      await setDoc(doc(db, 'publicDecks', id, 'cards', 'a'), { reference: `${title} 1`, verseText: 'first', position: 0 });
    }
  });
}
const titles = async (filters = NO_FILTERS) => (await discover().listDecks(filters)).decks.map((d) => d.title);

describe('browsing', () => {
  const CATALOGUE: [string, string, string, string, number][] = [
    ['1', 'Psalm 23', 'KJV', 'en', 1000], ['2', 'Proverbs', 'WEB', 'en', 3000], ['3', 'Salmos', 'RV1909', 'es', 2000],
    ['4', 'psalm 91', 'KJV', 'en', 4000], ['5', 'Mis versículos', 'OWN', 'es', 5000],
  ];

  it('lists newest first, with the details people need', async () => {
    await seed(CATALOGUE);
    const { decks, cursor } = await discover().listDecks(NO_FILTERS);
    expect(decks.map((d) => d.title)).toEqual(['Mis versículos', 'psalm 91', 'Proverbs', 'Salmos', 'Psalm 23']);
    expect(decks[0]).toMatchObject({ id: '5', translation: 'OWN', language: 'es', cardCount: 2, createdAt: 5000, description: null });
    expect(cursor).toBeNull();
  });

  it('filters by language, by translation, and by both', async () => {
    await seed(CATALOGUE);
    expect(await titles({ ...NO_FILTERS, language: 'es' })).toEqual(['Mis versículos', 'Salmos']);
    expect(await titles({ ...NO_FILTERS, translation: 'KJV' })).toEqual(['psalm 91', 'Psalm 23']);
    expect(await titles({ ...NO_FILTERS, language: 'en', translation: 'WEB' })).toEqual(['Proverbs']);
    expect(await titles({ ...NO_FILTERS, language: 'es', translation: 'KJV' })).toEqual([]);
  });

  it('searches the start of the title, ignoring case, in title order', async () => {
    await seed(CATALOGUE);
    expect(await titles({ ...NO_FILTERS, query: 'ps' })).toEqual(['Psalm 23', 'psalm 91']);
    expect(await titles({ ...NO_FILTERS, query: 'PSALM 9' })).toEqual(['psalm 91']);
    expect(await titles({ ...NO_FILTERS, query: 'salmo' })).toEqual(['Salmos']);
    expect(await titles({ ...NO_FILTERS, query: 'nothing' })).toEqual([]);
    expect(await titles({ ...NO_FILTERS, query: 'ps', translation: 'KJV', language: 'en' })).toEqual(['Psalm 23', 'psalm 91']); // search and filters together
  });

  it('comes in pages, with no deck repeated and none missing', async () => {
    const many = Array.from({ length: PAGE_SIZE + 5 }, (_, i): [string, string, string, string, number] => [`d${i}`, `Deck ${String(i).padStart(2, '0')}`, 'KJV', 'en', 1000 + i]);
    await seed(many);
    const first = await discover().listDecks(NO_FILTERS);
    expect(first.decks).toHaveLength(PAGE_SIZE);
    expect(first.cursor).not.toBeNull();
    const second = await discover().listDecks(NO_FILTERS, first.cursor);
    expect(second.decks).toHaveLength(5);
    expect(second.cursor).toBeNull();
    const ids = [...first.decks, ...second.decks].map((d) => d.id);
    expect(new Set(ids).size).toBe(PAGE_SIZE + 5);
    // searching pages too
    const a = await discover().listDecks({ ...NO_FILTERS, query: 'deck' });
    const b = await discover().listDecks({ ...NO_FILTERS, query: 'deck' }, a.cursor);
    expect(new Set([...a.decks, ...b.decks].map((d) => d.id)).size).toBe(PAGE_SIZE + 5);
  });

  it('opens one deck with its cards in order, and a missing deck is simply null', async () => {
    await seed([['1', 'Psalm 23', 'KJV', 'en', 1000]]);
    expect(await discover().getDeck('1')).toMatchObject({ title: 'Psalm 23', translation: 'KJV' });
    expect((await discover().getCards('1')).map((c) => [c.position, c.reference])).toEqual([[0, 'Psalm 23 1'], [1, 'Psalm 23 2']]);
    expect(await discover().getDeck('nope')).toBeNull();
  });

  it('a stranger can read but not change anything they find', async () => {
    await seed([['1', 'Psalm 23', 'KJV', 'en', 1000]]);
    const db = stranger();
    await assertFails(updateDoc(doc(db, 'publicDecks', '1'), { title: 'Hijacked', titleLower: 'hijacked', updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(db, 'publicDecks', '1')));
    await assertFails(setDoc(doc(db, 'publicDecks', '1', 'cards', 'x'), { reference: 'a', verseText: 'b', position: 0 }));
  });
});

describe('reporting', () => {
  it('anyone can report a deck, without signing in', async () => {
    await expect(discover().report('1', 'copyright', 'This is the NIV')).resolves.toBeUndefined();
    await expect(discover().report('1', 'inappropriate', '')).resolves.toBeUndefined();
    await expect(discover().report('1', 'other', 'x'.repeat(900))).resolves.toBeUndefined(); // long notes are cut to the limit before sending
  });

  it('but nobody can read, change or remove reports', async () => {
    const db = stranger();
    await assertSucceeds(addDoc(collection(db, 'reports'), { deckId: '1', reason: 'other', createdAt: serverTimestamp() }));
    await assertFails(getDocs(collection(db, 'reports')));
    await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), 'reports', 'r1'), { deckId: '1', reason: 'other', createdAt: Timestamp.now() }); });
    await assertFails(getDoc(doc(db, 'reports', 'r1')));
    await assertFails(updateDoc(doc(db, 'reports', 'r1'), { reason: 'copyright' }));
    await assertFails(deleteDoc(doc(db, 'reports', 'r1')));
    const alice = env.authenticatedContext('alice').firestore();
    await assertFails(getDoc(doc(alice, 'reports', 'r1'))); // not even signed-in people
  });

  it('a report must be well-formed', async () => {
    const db = stranger();
    const base = { deckId: '1', reason: 'copyright', details: 'x', createdAt: serverTimestamp() };
    await assertSucceeds(addDoc(collection(db, 'reports'), base));
    for (const bad of [{ reason: 'spam' }, { reason: '' }, { deckId: '' }, { deckId: 5 }, { details: 'x'.repeat(501) }, { details: 5 }, { createdAt: Timestamp.fromMillis(5) }, { extra: 'nope' }, { email: 'a@b.c' }]) {
      await assertFails(addDoc(collection(db, 'reports'), { ...base, ...bad }));
    }
    const { createdAt: _c, ...noDate } = base;
    await assertFails(addDoc(collection(db, 'reports'), noDate));
  });
});
