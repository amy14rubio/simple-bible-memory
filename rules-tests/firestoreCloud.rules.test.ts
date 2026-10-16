import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, type Firestore } from 'firebase/firestore';
import { createFirestoreCloud } from '../src/features/sharing/firestoreCloud';
import type { CloudCard, CloudDeckMeta } from '../src/features/sharing/types';

/** The app's own write calls, run against the real security rules. */
let env: RulesTestEnvironment;
beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-simple-bible-memory', firestore: { rules: readFileSync('firestore.rules', 'utf8') } }); });
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const as = (uid: string) => createFirestoreCloud(env.authenticatedContext(uid).firestore() as unknown as Firestore, () => uid);
const reader = () => env.unauthenticatedContext().firestore() as unknown as Firestore;

const meta = (over: Partial<CloudDeckMeta> = {}): CloudDeckMeta => ({ title: 'Psalm 23', description: 'The shepherd psalm', translation: 'KJV', language: 'en', cardCount: 2, ...over });
const cards = (n: number): CloudCard[] => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, reference: `Psalm 23:${i + 1}`, verseText: `Verse ${i + 1}.`, note: i === 0 ? 'KJV' : null, position: i }));
const cardIds = async (id: string) => (await getDocs(collection(reader(), 'publicDecks', id, 'cards'))).docs.map((d) => d.id).sort();

describe('the app\'s calls, under the real rules', () => {
  it('publishes a deck, anyone can read it, and the owner id is an opaque id, not a name or email', async () => {
    const alice = as('alice');
    await alice.createDeck('d1', meta());
    await alice.putCards('d1', cards(2));
    const deck = (await getDoc(doc(reader(), 'publicDecks', 'd1'))).data()!;
    expect(deck).toMatchObject({ ownerId: 'alice', title: 'Psalm 23', titleLower: 'psalm 23', translation: 'KJV', language: 'en', cardCount: 2 });
    expect(Object.keys(deck).sort()).toEqual(['cardCount', 'createdAt', 'description', 'language', 'ownerId', 'title', 'titleLower', 'translation', 'updatedAt']);
    expect(await cardIds('d1')).toEqual(['c0', 'c1']);
  });

  it('updates the details and the cards, and removes cards', async () => {
    const alice = as('alice');
    await alice.createDeck('d1', meta());
    await alice.putCards('d1', cards(3));
    await alice.updateDeck('d1', meta({ title: 'Renamed', cardCount: 2 }));
    await alice.removeCards('d1', ['c2']);
    expect((await getDoc(doc(reader(), 'publicDecks', 'd1'))).data()).toMatchObject({ title: 'Renamed', titleLower: 'renamed', cardCount: 2 });
    expect(await cardIds('d1')).toEqual(['c0', 'c1']);
  });

  it('sends a big deck in chunks', async () => {
    const alice = as('alice');
    await alice.createDeck('big', meta({ cardCount: 950 }));
    await alice.putCards('big', cards(950));
    expect((await cardIds('big')).length).toBe(950);
    await alice.removeDeck('big');
    expect((await getDoc(doc(reader(), 'publicDecks', 'big'))).exists()).toBe(false);
    expect((await cardIds('big')).length).toBe(0);
  });

  it('removes a deck with all its cards, and removing one that is already gone is fine', async () => {
    const alice = as('alice');
    await alice.createDeck('d1', meta());
    await alice.putCards('d1', cards(2));
    await alice.removeDeck('d1');
    expect((await getDoc(doc(reader(), 'publicDecks', 'd1'))).exists()).toBe(false);
    expect(await cardIds('d1')).toEqual([]);
    await expect(alice.removeDeck('d1')).resolves.toBeUndefined();
  });

  it('refuses a copyrighted translation, even if the app were to send it', async () => {
    await expect(as('alice').createDeck('d1', meta({ translation: 'NIV' }))).rejects.toThrow();
  });

  it('another person cannot change or remove it, and cannot add cards', async () => {
    await as('alice').createDeck('d1', meta());
    await as('alice').putCards('d1', cards(1));
    const bob = as('bob');
    await expect(bob.updateDeck('d1', meta({ title: 'Hijacked' }))).rejects.toThrow();
    await expect(bob.putCards('d1', cards(2))).rejects.toThrow();
    await expect(bob.removeCards('d1', ['c0'])).rejects.toThrow();
    await expect(bob.removeDeck('d1')).rejects.toThrow();
    expect((await getDoc(doc(reader(), 'publicDecks', 'd1'))).data()!.title).toBe('Psalm 23');
    expect(await cardIds('d1')).toEqual(['c0']);
  });

  it('"remove everything of mine" removes my decks and leaves everyone else\'s', async () => {
    const alice = as('alice');
    const bob = as('bob');
    await alice.createDeck('a1', meta()); await alice.putCards('a1', cards(2));
    await alice.createDeck('a2', meta({ title: 'Second' })); await alice.putCards('a2', cards(1));
    await bob.createDeck('b1', meta({ title: 'Bob\'s', cardCount: 1 })); await bob.putCards('b1', cards(1));
    await alice.removeAllMine();
    const left = (await getDocs(collection(reader(), 'publicDecks'))).docs.map((d) => d.id);
    expect(left).toEqual(['b1']);
    expect(await cardIds('b1')).toEqual(['c0']);
  });
});
