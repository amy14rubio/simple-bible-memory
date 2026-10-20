import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../test/db';
import { createDeckRepository } from '../../data/repositories/deckRepository';
import { createCardRepository } from '../../data/repositories/cardRepository';
import { createSettingsRepository } from '../../data/repositories/settingsRepository';
import { createAccountRepository } from '../../data/repositories/accountRepository';
import { createSharingRepository } from '../../data/repositories/sharingRepository';
import type { Database } from '../../data/database/Database';
import { createAccountSync, type AccountSync } from './accountSync';
import { createFakeAccount, emptyFakeAccount, type FakeAccountState } from './fakeAccount';

/** Two devices (two databases) sharing one account (one fake cloud), with a clock that only moves when asked. */
let clock = 1_000_000;
const now = () => (clock += 10);
let cloud: FakeAccountState;
let signedIn: Record<string, string | null>;

interface Device { name: string; db: Database; decks: ReturnType<typeof createDeckRepository>; cards: ReturnType<typeof createCardRepository>; settings: ReturnType<typeof createSettingsRepository>; repo: ReturnType<typeof createAccountRepository>; sync: AccountSync; announced: number; sharing: ReturnType<typeof createSharingRepository> }

async function device(name: string, opts: { online?: () => boolean; schemaVersion?: number } = {}): Promise<Device> {
  const db = await createTestDatabase();
  const repo = createAccountRepository(db);
  const d = { name, db, repo, announced: 0 } as Device;
  d.decks = createDeckRepository(db, now);
  d.cards = createCardRepository(db, now);
  d.settings = createSettingsRepository(db, now);
  d.sharing = createSharingRepository(db);
  signedIn[name] = null;
  d.sync = createAccountSync({ repo, backend: createFakeAccount({ load: () => cloud, save: (s) => { cloud = s; } }, () => signedIn[name] ?? null, 5), announce: () => { d.announced++; }, online: opts.online, delayMs: 1, now, schemaVersion: opts.schemaVersion });
  return d;
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Signs the device in to the account and starts syncing. */
async function signIn(d: Device, uid = 'amy') {
  signedIn[d.name] = uid;
  expect(await d.sync.prepare(uid)).toBe('ready');
  await d.sync.start(uid);
}
/** Lets everything settle: each device sends, the other receives, a few times over. */
async function settle(...ds: Device[]) {
  for (let i = 0; i < 3; i++) {
    for (const d of ds) { await d.sync.syncAll(); await d.sync.idle(); }
    await wait(30);
    for (const d of ds) await d.sync.idle();
  }
}
const titles = async (d: Device) => (await d.decks.list()).map((x) => x.title).sort();
const refs = async (d: Device, deckId: string) => (await d.cards.listByDeck(deckId)).map((c) => c.reference);

let A: Device;
let B: Device;
beforeEach(async () => {
  cloud = emptyFakeAccount();
  signedIn = {};
  A = await device('A');
  B = await device('B');
});

async function seedA() {
  const deck = await A.decks.create({ title: 'Psalms', description: 'memory set' });
  const [c1, c2] = await A.cards.createMany(deck.id, [{ reference: 'Psalm 23:1', verseText: 'The Lord is my shepherd', note: 'KJV' }, { reference: 'Psalm 23:2', verseText: 'He maketh me lie down' }]);
  return { deck, c1: c1!, c2: c2! };
}
const studied = (d: Device, cardId: string, lastReview: number, reps: number) =>
  d.db.run(`INSERT INTO card_schedule VALUES (?, 'recall', ?, 4.5, 5.5, 2, ?, 1, 0, 7, ?, 'v') ON CONFLICT(card_id, kind) DO UPDATE SET reps = excluded.reps, last_review = excluded.last_review`, [cardId, lastReview + 1000, reps, lastReview]);

describe('a new device gets what the account has', () => {
  it('decks, cards in their order, notes, and study schedules', async () => {
    const { deck, c1 } = await seedA();
    await studied(A, c1.id, 5_000, 3);
    await signIn(A);
    await settle(A);
    await signIn(B);
    await settle(A, B);

    expect(await titles(B)).toEqual(['Psalms']);
    expect(await refs(B, deck.id)).toEqual(['Psalm 23:1', 'Psalm 23:2']);
    expect((await B.cards.get(c1.id))!.note).toBe('KJV');
    expect((await B.db.query<{ reps: number }>('SELECT reps FROM card_schedule'))[0]!.reps).toBe(3);
    expect(B.announced).toBeGreaterThan(0); // screens are told to refresh
  });

  it('only the study settings follow the account, not the look of the app', async () => {
    await A.settings.set('new_cards_per_day', 7);
    await A.settings.set('card_kinds', 'recall');
    await A.settings.set('theme', 'dark');
    await signIn(A);
    await settle(A);
    await signIn(B);
    await settle(A, B);
    expect(await B.settings.get('new_cards_per_day')).toBe(7);
    expect(await B.settings.get('card_kinds')).toBe('recall');
    expect(await B.settings.get('theme')).toBeUndefined();
  });

  it('review history does not travel', async () => {
    const { c1 } = await seedA();
    await studied(A, c1.id, 5_000, 1);
    await A.db.run(`INSERT INTO review_logs (id, card_id, kind, reviewed_at, rating, study_mode, state_before, due_before, stability, difficulty, scheduled_days, elapsed_days) VALUES ('r1', ?, 'recall', 900, 3, 'type', 0, 800, 4.5, 5.5, 7, 0)`, [c1.id]);
    await signIn(A); await settle(A); await signIn(B); await settle(A, B);
    expect(await B.db.query('SELECT * FROM review_logs')).toEqual([]);
  });
});

describe('changes keep flowing both ways', () => {
  it('an edit on one device shows up on the other, and an added card too', async () => {
    const { deck, c1 } = await seedA();
    await signIn(A); await settle(A); await signIn(B); await settle(A, B);
    await B.cards.update(c1.id, { reference: 'Psalm 23:1', verseText: 'The LORD is my shepherd (edited)' });
    await B.cards.create(deck.id, { reference: 'Psalm 23:3', verseText: 'He restoreth my soul' });
    await settle(A, B);
    expect((await A.cards.get(c1.id))!.verseText).toContain('edited');
    expect(await refs(A, deck.id)).toEqual(['Psalm 23:1', 'Psalm 23:2', 'Psalm 23:3']);
  });

  it('when both change the same card, the most recent edit wins on both devices', async () => {
    const { c1 } = await seedA();
    await signIn(A); await settle(A); await signIn(B); await settle(A, B);
    await A.cards.update(c1.id, { reference: 'Psalm 23:1', verseText: 'A edited first' });
    await B.cards.update(c1.id, { reference: 'Psalm 23:1', verseText: 'B edited last' }); // later in time
    await settle(A, B);
    expect((await A.cards.get(c1.id))!.verseText).toBe('B edited last');
    expect((await B.cards.get(c1.id))!.verseText).toBe('B edited last');
  });

  it('a card moved to another deck moves everywhere', async () => {
    const { deck, c1 } = await seedA();
    const other = await A.decks.create({ title: 'Proverbs' });
    await signIn(A); await settle(A); await signIn(B); await settle(A, B);
    await A.cards.moveMany([c1.id], other.id);
    await settle(A, B);
    expect(await refs(B, deck.id)).toEqual(['Psalm 23:2']);
    expect(await refs(B, other.id)).toEqual(['Psalm 23:1']);
  });

  it('study progress follows: the device studied most recently wins', async () => {
    const { c1 } = await seedA();
    await signIn(A); await settle(A); await signIn(B); await settle(A, B);
    await studied(A, c1.id, 5_000, 1);
    await studied(B, c1.id, 9_000, 2);
    await A.sync.syncAll(); await B.sync.syncAll();
    await settle(A, B);
    for (const d of [A, B]) expect((await d.db.query<{ reps: number }>('SELECT reps FROM card_schedule'))[0]!.reps).toBe(2);
  });
});

describe('deleting', () => {
  it('a deleted card and a deleted deck are deleted everywhere', async () => {
    const { deck, c1 } = await seedA();
    const gone = await A.decks.create({ title: 'Temporary' });
    await A.cards.create(gone.id, { reference: 'X 1:1', verseText: 'x' });
    await signIn(A); await settle(A); await signIn(B); await settle(A, B);
    expect(await titles(B)).toEqual(['Psalms', 'Temporary']);

    await B.cards.delete(c1.id);
    await B.decks.delete(gone.id);
    await settle(A, B);
    expect(await refs(A, deck.id)).toEqual(['Psalm 23:2']);
    expect(await titles(A)).toEqual(['Psalms']);
    expect(await A.db.query('SELECT * FROM cards WHERE reference = ?', ['X 1:1'])).toEqual([]);
  });

  it('a deletion made offline is sent later, and an offline device does not bring deleted cards back', async () => {
    const { deck, c1 } = await seedA();
    let up = true;
    const C = await device('C', { online: () => up });
    await signIn(A); await settle(A); await signIn(C); await settle(A, C);
    up = false;
    await C.cards.delete(c1.id);
    await C.sync.syncAll();
    expect(C.sync.status().state).toBe('waiting');
    expect(await refs(A, deck.id)).toHaveLength(2); // not heard yet
    up = true;
    await settle(A, C);
    expect(await refs(A, deck.id)).toEqual(['Psalm 23:2']);
  });

  it('if one device deletes a card and another edits it afterwards, the edit wins', async () => {
    const { deck, c1 } = await seedA();
    await signIn(A); await settle(A); await signIn(B); await settle(A, B);
    await A.cards.delete(c1.id);
    await A.sync.syncAll(); // (in the app this happens a moment after the delete)
    await B.cards.update(c1.id, { reference: 'Psalm 23:1', verseText: 'edited after the delete' });
    await settle(A, B);
    expect(await refs(A, deck.id)).toContain('Psalm 23:1');
    expect((await A.cards.get(c1.id))!.verseText).toBe('edited after the delete');
  });
});

describe('Undo after a delete', () => {
  it('a restored card comes back everywhere, even after the deletion was already sent', async () => {
    const { deck, c1 } = await seedA();
    await studied(A, c1.id, 5_000, 3);
    await signIn(A); await settle(A); await signIn(B); await settle(A, B);
    const deleted = await A.cards.deleteMany([c1.id]);
    await A.sync.syncAll();
    await settle(A, B);
    expect(await refs(B, deck.id)).toEqual(['Psalm 23:2']);
    await A.cards.restore(deleted);
    await settle(A, B);
    expect(await refs(B, deck.id)).toEqual(['Psalm 23:1', 'Psalm 23:2']);
    expect((await B.db.query<{ reps: number }>('SELECT reps FROM card_schedule'))[0]!.reps).toBe(3);
  });
});

describe('signing in on a device that has its own decks', () => {
  it('merges: both sets of decks end up on both devices', async () => {
    await seedA();
    await signIn(A); await settle(A);
    await B.decks.create({ title: 'Mine on B' });
    await signIn(B);
    await settle(A, B);
    expect(await titles(A)).toEqual(['Mine on B', 'Psalms']);
    expect(await titles(B)).toEqual(['Mine on B', 'Psalms']);
  });

  it('a different account asks first; Add keeps the decks, Replace swaps them for the account\'s', async () => {
    await seedA();
    await signIn(A, 'amy'); await settle(A);
    signedIn.A = null; A.sync.stop();

    // someone else signs in on A's device
    expect(await A.sync.prepare('bob')).toBe('ask');
    await A.sync.resolve('bob', 'replace');
    expect(await titles(A)).toEqual([]);
    expect(await A.repo.hasDecks()).toBe(false);

    // and Add: a device with decks joining a different account
    const bobsDeck = await B.decks.create({ title: "Bob's" });
    await signIn(B, 'amy'); await settle(B); signedIn.B = null; B.sync.stop();
    expect(await B.sync.prepare('bob')).toBe('ask');
    await B.sync.resolve('bob', 'merge');
    signedIn.B = 'bob'; await B.sync.start('bob'); await settle(B);
    expect(cloud.items.bob![`deck~${bobsDeck.id}`]).toBeDefined();
    expect(cloud.items.bob!['deck~' + (await B.decks.list()).find((d) => d.title === 'Psalms')!.id]).toBeDefined(); // amy's decks came along: that is what Add means
  });

  it('the same account on the same device never asks again', async () => {
    await seedA();
    await signIn(A); await settle(A); A.sync.stop();
    expect(await A.sync.prepare('amy')).toBe('ready');
  });
});

describe('offline and errors', () => {
  it('offline edits wait and are sent when the connection is back', async () => {
    const { deck } = await seedA();
    await signIn(A); await settle(A); await signIn(B); await settle(A, B);
    cloud.offline = true;
    await A.cards.create(deck.id, { reference: 'Psalm 23:4', verseText: 'Yea, though I walk' });
    await A.sync.syncAll();
    expect(A.sync.status().state).toBe('waiting');
    cloud.offline = false;
    await settle(A, B);
    expect(A.sync.status().state).toBe('synced');
    expect(await refs(B, deck.id)).toContain('Psalm 23:4');
  });

  it('nothing is sent when nobody is signed in', async () => {
    await seedA();
    await A.sync.syncAll();
    expect(A.sync.status().state).toBe('off');
    expect(cloud.items).toEqual({});
  });
});

describe('published decks', () => {
  it('a deck published on one device shows as published on the other, ready to update the public copy', async () => {
    const { deck } = await seedA();
    await signIn(A); await settle(A); await signIn(B); await settle(A, B);
    await A.sharing.publish(deck.id, 'pub-1');
    await settle(A, B);
    expect((await B.sharing.getDeck(deck.id))!.publishId).toBe('pub-1');
    expect((await B.sharing.getDeck(deck.id))!.syncedMeta).toBe('?'); // "the copy exists": update it, do not create it
    await A.sharing.unpublish(deck.id);
    await settle(A, B);
    expect((await B.sharing.getDeck(deck.id))!.publishId).toBeNull();
  });
});

describe('deleting the account', () => {
  it('removes everything from the account and unlinks the device, keeping its decks', async () => {
    await seedA();
    await signIn(A); await settle(A);
    expect(Object.keys(cloud.items.amy!).length).toBeGreaterThan(0);
    await A.sync.eraseAccountData();
    expect(cloud.items.amy).toBeUndefined();
    expect(await A.repo.getMeta('owner')).toBeUndefined();
    expect(await titles(A)).toEqual(['Psalms']);
  });
});

describe('item formats: an app never damages what a newer app saved', () => {
  const deckItem = (uid: string, id: string) => cloud.items[uid]![`deck~${id}`]!;

  it('everything sent says which format it is in', async () => {
    const { deck } = await seedA();
    await signIn(A);
    await settle(A);
    expect(deckItem('amy', deck.id).v).toBe(1);
    expect(Object.values(cloud.items['amy']!).every((i) => i.v === 1)).toBe(true);
  });

  it('an app that does not understand an item leaves it out, and does not delete it or write over it', async () => {
    const newer = await device('N', { schemaVersion: 2 });
    const deck = await newer.decks.create({ title: 'Made by the newer app' });
    await signIn(newer);
    await settle(newer);
    expect(deckItem('amy', deck.id).v).toBe(2);

    await signIn(A); // an older app joins the same account
    await settle(A, newer);
    expect(await titles(A)).toEqual([]); // not read: it could be misread
    await A.decks.create({ title: 'Made on the older app' });
    await settle(A, newer);
    expect(deckItem('amy', deck.id)).toMatchObject({ deleted: false, v: 2 }); // not deleted by the older app having no copy
    expect((deckItem('amy', deck.id).data as { title: string }).title).toBe('Made by the newer app');
    expect(await titles(newer)).toEqual(['Made by the newer app', 'Made on the older app']); // and its own work still reaches the newer one
  });

  it('an edit on the older app cannot overwrite the newer format, even if it is the later edit', async () => {
    const newer = await device('N', { schemaVersion: 2 });
    const deck = await A.decks.create({ title: 'Psalms' });
    await signIn(A);
    await settle(A);
    await signIn(newer);
    await settle(A, newer);
    await newer.decks.update(deck.id, { title: 'Psalms (newer format)' });
    await settle(A, newer);
    expect((deckItem('amy', deck.id).data as { title: string }).title).toBe('Psalms (newer format)');
    expect(deckItem('amy', deck.id).v).toBe(2);

    await A.decks.update(deck.id, { title: 'Psalms, edited on the older app later' });
    await settle(A, newer);
    expect((deckItem('amy', deck.id).data as { title: string }).title).toBe('Psalms (newer format)'); // untouched
    expect(await titles(newer)).toEqual(['Psalms (newer format)']);
  });

  it('after the app is updated, what it could not read arrives', async () => {
    const newer = await device('N', { schemaVersion: 2 });
    const deck = await newer.decks.create({ title: 'Made by the newer app' });
    await signIn(newer);
    await settle(newer);
    await signIn(A);
    await settle(A, newer);
    expect(await titles(A)).toEqual([]);
    A.sync.stop();

    // the same device, now running the update (it understands format 2)
    const updated = createAccountSync({ repo: A.repo, backend: createFakeAccount({ load: () => cloud, save: (s) => { cloud = s; } }, () => signedIn['A'] ?? null, 5), announce: () => undefined, delayMs: 1, now, schemaVersion: 2 });
    expect(await updated.prepare('amy')).toBe('ready');
    await updated.start('amy');
    await updated.idle();
    await wait(30);
    await updated.idle();
    expect(await titles(A)).toEqual(['Made by the newer app']);
    expect(deckItem('amy', deck.id)).toMatchObject({ deleted: false, v: 2 });
    updated.stop();
  });

  it('a deletion made by a newer app is still honoured (a deleted stub is the same in every format)', async () => {
    const newer = await device('N', { schemaVersion: 2 });
    const deck = await A.decks.create({ title: 'Going away' });
    await signIn(A);
    await settle(A);
    await signIn(newer);
    await settle(A, newer);
    await newer.decks.delete(deck.id);
    await settle(A, newer);
    expect(await titles(A)).toEqual([]);
  });
});

describe('agreeing to the community rules follows the account', () => {
  it('agreed on one device, a new device signing in has it too, with the rules version', async () => {
    await A.settings.set('terms_accepted', 1);
    await signIn(A);
    await settle(A);
    expect(cloud.items['amy']!['setting~terms_accepted']).toMatchObject({ deleted: false, data: { key: 'terms_accepted', value: 1 } });

    expect(await B.settings.get<number>('terms_accepted')).toBeUndefined();
    await signIn(B);
    await settle(A, B);
    expect(await B.settings.get<number>('terms_accepted')).toBe(1);
  });

  it('agreeing before signing in is carried into the account when signing in', async () => {
    await B.settings.set('terms_accepted', 1); // no account yet: remembered on the device
    await signIn(B);
    await settle(B);
    expect(cloud.items['amy']!['setting~terms_accepted']).toBeTruthy();
    await signIn(A);
    await settle(A, B);
    expect(await A.settings.get<number>('terms_accepted')).toBe(1);
  });
});
