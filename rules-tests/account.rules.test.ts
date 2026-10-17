import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, deleteDoc, type Firestore } from 'firebase/firestore';
import { createFirestoreAccount } from '../src/features/account/firestoreAccount';
import type { OutItem, RemoteItem } from '../src/features/account/types';

/** A person's own backup (users/{uid}/items): private, shaped, and the newest edit always wins. */
let env: RulesTestEnvironment;
beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-simple-bible-memory', firestore: { rules: readFileSync('firestore.rules', 'utf8') } }); });
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const as = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore;
const stranger = () => env.unauthenticatedContext().firestore() as unknown as Firestore;
const backend = (uid: string) => createFirestoreAccount(as(uid), () => uid);

const deck = (id: string, updatedAt: number, title = 'Psalms'): OutItem => ({ entity: 'deck', id, deleted: false, updatedAt, doc: { title, description: null, translation: 'KJV', language: 'en', publishId: null, importedFrom: null, createdAt: 1, updatedAt } });
const card = (id: string, updatedAt: number): OutItem => ({ entity: 'card', id, deleted: false, updatedAt, doc: { reference: 'John 3:16', verseText: 'For God so loved', note: null, createdAt: 1, updatedAt, decks: [{ deckId: 'd1', addedAt: 5 }] } });
const schedule = (cardId: string, kind: string, updatedAt: number): OutItem => ({ entity: 'schedule', id: `${cardId}~${kind}`, deleted: false, updatedAt, doc: { cardId, kind, due: 10, stability: 4.5, difficulty: 5.5, state: 2, reps: 3, lapses: 1, learningSteps: 0, scheduledDays: 7, lastReview: updatedAt, version: 'v', updatedAt } });
const setting = (key: string, value: string | number, updatedAt: number): OutItem => ({ entity: 'setting', id: key, deleted: false, updatedAt, doc: { key, value, updatedAt } });
const gone = (entity: OutItem['entity'], id: string, updatedAt: number): OutItem => ({ entity, id, deleted: true, updatedAt, doc: null });

/** What listening gives, once it has settled. */
const heard = (uid: string, since = 0) => new Promise<RemoteItem[]>((resolve, reject) => {
  let stop: () => void = () => undefined;
  stop = backend(uid).listen(since, (items) => { stop(); resolve(items); }, reject);
  setTimeout(() => { stop(); resolve([]); }, 1500);
});

describe('saving and listening', () => {
  it('stores every kind of thing, and the person hears them back, oldest first', async () => {
    const b = backend('alice');
    await expect(b.push([deck('d1', 100), card('c1', 100), schedule('c1', 'recall', 100), schedule('c1', 'identify', 100), setting('card_kinds', 'both', 100), setting('new_cards_per_day', 5, 100)])).resolves.toEqual({ stale: [] });
    const items = await heard('alice');
    expect(items.map((i) => `${i.entity}~${i.id}`).sort()).toEqual(['card~c1', 'deck~d1', 'schedule~c1~identify', 'schedule~c1~recall', 'setting~card_kinds', 'setting~new_cards_per_day']);
    expect(items.every((i) => i.syncedAt > 0 && i.deleted === false)).toBe(true);
  });

  it('"since" only brings what the cloud received after that time', async () => {
    await backend('alice').push([deck('d1', 100)]);
    const first = await heard('alice');
    await new Promise((r) => setTimeout(r, 20));
    await backend('alice').push([deck('d2', 100, 'Proverbs')]);
    const later = await heard('alice', first[0]!.syncedAt + 1);
    expect(later.map((i) => i.id)).toEqual(['d2']);
  });

  it('a deletion is kept as a stub that other devices hear', async () => {
    const b = backend('alice');
    await b.push([deck('d1', 100), card('c1', 100)]);
    await b.push([gone('card', 'c1', 200)]);
    const items = await heard('alice');
    expect(items.find((i) => i.id === 'c1')).toMatchObject({ deleted: true, updatedAt: 200 });
  });
});

describe('the newest edit wins', () => {
  it('an older version never replaces a newer one, and the app is told which', async () => {
    const b = backend('alice');
    await b.push([deck('d1', 200, 'Newer')]);
    await expect(b.push([deck('d1', 100, 'Older'), deck('d2', 100, 'Unrelated')])).resolves.toEqual({ stale: ['deck~d1'] }); // the rest still goes through
    const items = await heard('alice');
    expect((items.find((i) => i.id === 'd1')!.data as { title: string }).title).toBe('Newer');
    expect(items.some((i) => i.id === 'd2')).toBe(true);
  });

  it('the same time, or a later one, replaces it', async () => {
    const b = backend('alice');
    await b.push([deck('d1', 100, 'First')]);
    await expect(b.push([deck('d1', 100, 'Same time')])).resolves.toEqual({ stale: [] });
    await expect(b.push([deck('d1', 300, 'Later')])).resolves.toEqual({ stale: [] });
  });

  it('a deletion older than an edit does not win either', async () => {
    const b = backend('alice');
    await b.push([card('c1', 300)]);
    await expect(b.push([gone('card', 'c1', 200)])).resolves.toEqual({ stale: ['card~c1'] });
  });
});

describe('privacy', () => {
  it('nobody else can read, write, list or delete a person\'s backup', async () => {
    await backend('alice').push([deck('d1', 100)]);
    const path = (db: Firestore) => doc(db, 'users', 'alice', 'items', 'deck~d1');
    for (const db of [as('bob'), stranger()]) {
      await assertFails(getDoc(path(db)));
      await assertFails(getDocs(collection(db, 'users', 'alice', 'items')));
      await assertFails(setDoc(path(db), { entity: 'deck', deleted: true, updatedAt: 999, syncedAt: serverTimestamp() }));
      await assertFails(deleteDoc(path(db)));
    }
    await assertSucceeds(getDoc(path(as('alice'))));
  });

  it('a stranger cannot save anything under their own name either', async () => {
    await expect(createFirestoreAccount(stranger(), () => 'nobody').push([deck('d1', 1)])).rejects.toBeTruthy();
  });
});

describe('only well-formed things are accepted', () => {
  const put = (id: string, data: Record<string, unknown>) => setDoc(doc(as('alice'), 'users', 'alice', 'items', id), { syncedAt: serverTimestamp(), ...data });
  const okDeck = { entity: 'deck', deleted: false, title: 'T', description: null, translation: null, language: null, publishId: null, importedFrom: null, createdAt: 1, updatedAt: 1 };

  it('accepts a good deck, and refuses a mismatched name, extra fields, wrong types and oversized text', async () => {
    await assertSucceeds(put('deck~d1', okDeck));
    await assertFails(put('card~d1', okDeck)); // the name says card, the data says deck
    await assertFails(put('deck~d2', { ...okDeck, extra: 'nope' }));
    await assertFails(put('deck~d2', { ...okDeck, title: '' }));
    await assertFails(put('deck~d2', { ...okDeck, title: 'x'.repeat(201) }));
    await assertFails(put('deck~d2', { ...okDeck, createdAt: 'yesterday' }));
    await assertFails(put('deck~d2', { ...okDeck, entity: 'wallet' }));
    await assertFails(put('deck~d2', { ...okDeck, updatedAt: -5 }));
  });

  it('the cloud decides "synced at": a person cannot back-date it', async () => {
    const { syncedAt: _s, ...rest } = { syncedAt: 0, ...okDeck };
    await assertFails(setDoc(doc(as('alice'), 'users', 'alice', 'items', 'deck~d3'), { ...rest, syncedAt: new Date(2000, 0, 1) }));
  });

  it('settings: only the three study settings, with a plain value; never deleted', async () => {
    const s = (key: string, value: unknown) => ({ entity: 'setting', deleted: false, key, value, updatedAt: 1 });
    await assertSucceeds(put('setting~card_kinds', s('card_kinds', 'both')));
    await assertSucceeds(put('setting~new_cards_per_day', s('new_cards_per_day', 20)));
    await assertFails(put('setting~theme', s('theme', 'dark'))); // looks stay on the device
    await assertFails(put('setting~card_kinds', s('card_kinds', { a: 1 })));
    await assertFails(put('setting~card_kinds', s('card_kinds', 'x'.repeat(41))));
    await assertFails(put('setting~blank_difficulty', s('card_kinds', 'hard'))); // name and key must agree
    await assertFails(put('setting~card_kinds', { entity: 'setting', deleted: true, updatedAt: 9 }));
  });

  it('schedules: the name must be card and kind, the kind and state must be real', async () => {
    const sch = (over: Record<string, unknown> = {}) => ({ entity: 'schedule', deleted: false, cardId: 'c1', kind: 'recall', due: 1, stability: 1, difficulty: 1, state: 2, reps: 1, lapses: 0, learningSteps: 0, scheduledDays: 1, lastReview: null, version: 'v', updatedAt: 1, ...over });
    await assertSucceeds(put('schedule~c1~recall', sch()));
    await assertFails(put('schedule~c2~recall', sch())); // wrong card in the name
    await assertFails(put('schedule~c1~identify', sch())); // wrong kind in the name
    await assertFails(put('schedule~c1~recall', sch({ kind: 'teach' })));
    await assertFails(put('schedule~c1~recall', sch({ state: 9 })));
    await assertFails(put('schedule~c1~recall', sch({ reps: -1 })));
  });

  it('cards: needs at least one deck, and text within limits', async () => {
    const c = (over: Record<string, unknown> = {}) => ({ entity: 'card', deleted: false, reference: 'r', verseText: 'v', note: null, createdAt: 1, updatedAt: 1, decks: [{ deckId: 'd', addedAt: 1 }], ...over });
    await assertSucceeds(put('card~c1', c()));
    await assertFails(put('card~c2', c({ decks: [] })));
    await assertFails(put('card~c2', c({ decks: 'd1' })));
    await assertFails(put('card~c2', c({ verseText: 'x'.repeat(20001) })));
    await assertFails(put('card~c2', c({ review: 'private' }))); // nothing but the known fields
  });

  it('a deletion stub carries nothing but its stamp', async () => {
    await assertSucceeds(put('card~c9', { entity: 'card', deleted: true, updatedAt: 5 }));
    await assertFails(put('card~c8', { entity: 'card', deleted: true, updatedAt: 5, reference: 'John 3:16' }));
  });
});

describe('deleting an account', () => {
  it('the person can remove everything of theirs, and only theirs', async () => {
    await backend('alice').push([deck('d1', 100), card('c1', 100)]);
    await backend('bob').push([deck('d1', 100, 'Bobs')]);
    await backend('alice').removeAll();
    expect(await heard('alice')).toEqual([]);
    expect((await heard('bob')).length).toBe(1);
  });
});
