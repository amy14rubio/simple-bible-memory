import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase } from '../../test/db';
import { createDeckRepository } from './deckRepository';
import { createCardRepository } from './cardRepository';
import { createAccountRepository, type AccountRepository } from './accountRepository';
import { makeItem } from '../../domain/account/items';
import type { Database } from '../database/Database';

let db: Database, decks: ReturnType<typeof createDeckRepository>, cards: ReturnType<typeof createCardRepository>, account: AccountRepository;
beforeEach(async () => {
  db = await createTestDatabase();
  decks = createDeckRepository(db);
  cards = createCardRepository(db);
  account = createAccountRepository(db);
});

describe('a licensed card in the account backup', () => {
  it('is saved with its translation and no text, however the device holds it', async () => {
    const d = await decks.create({ title: 'D' });
    const licensed = await cards.create(d.id, { reference: 'John 3:16', verseText: '', translationCode: 'NASB2020' });
    await cards.setFetchedText(licensed.id, 'For God so loved the world.');
    const plain = await cards.create(d.id, { reference: 'John 1:1', verseText: 'In the beginning.' });

    const item = await account.item('card', licensed.id);
    expect(item?.doc).toMatchObject({ reference: 'John 3:16', verseText: '', translation: 'NASB2020' });
    expect(JSON.stringify((await account.items()).map((i) => i.doc))).not.toContain('For God so loved');
    // an ordinary card is exactly what it was before: its text, and no translation field at all (so its fingerprint did not change)
    const ordinary = await account.item('card', plain.id);
    expect(ordinary?.doc).toMatchObject({ verseText: 'In the beginning.' });
    expect(ordinary?.doc).not.toHaveProperty('translation');
  });

  it('does not look changed once its text has been fetched (the fingerprint ignores the text)', async () => {
    const d = await decks.create({ title: 'D' });
    const c = await cards.create(d.id, { reference: 'John 3:16', verseText: '', translationCode: 'NASB2020' });
    const before = (await account.item('card', c.id))!.hash;
    await cards.setFetchedText(c.id, 'For God so loved the world.');
    expect((await account.item('card', c.id))!.hash).toBe(before);
  });

  it('arrives as a card waiting for its text, and never takes text from the account', async () => {
    const d = await decks.create({ title: 'D' });
    const doc = makeItem('card', 'c1', { reference: 'John 3:16', verseText: 'text smuggled in', note: null, translation: 'AMP', createdAt: 1, updatedAt: 2, decks: [{ deckId: d.id, addedAt: 3 }] })!.doc;
    expect(doc.verseText).toBe('');
    await account.apply('card', 'c1', doc);
    expect(await cards.get('c1')).toMatchObject({ translationCode: 'AMP', verseText: '' });
    expect((await cards.listMissingText()).map((c) => c.id)).toEqual(['c1']);
  });

  it('keeps the text this device already fetched when the card is updated from the account', async () => {
    const d = await decks.create({ title: 'D' });
    const c = await cards.create(d.id, { reference: 'John 3:16', verseText: '', translationCode: 'AMP' });
    await cards.setFetchedText(c.id, 'For God so loved the world.');
    const doc = (hasNote: string | null) => makeItem('card', c.id, { reference: 'John 3:16', verseText: '', note: hasNote, translation: 'AMP', createdAt: 1, updatedAt: 9, decks: [{ deckId: d.id, addedAt: 3 }] })!.doc;
    await account.apply('card', c.id, doc('my note'));
    expect(await cards.get(c.id)).toMatchObject({ note: 'my note', verseText: 'For God so loved the world.' });
    // but if the verse itself was changed on another device, the old text no longer fits
    await account.apply('card', c.id, makeItem('card', c.id, { reference: 'John 3:17', verseText: '', note: null, translation: 'AMP', createdAt: 1, updatedAt: 10, decks: [{ deckId: d.id, addedAt: 3 }] })!.doc);
    expect(await cards.get(c.id)).toMatchObject({ reference: 'John 3:17', verseText: '' });
  });

  it('an ordinary card from the account still brings its text (and may name an open translation)', async () => {
    const d = await decks.create({ title: 'D' });
    await account.apply('card', 'c2', makeItem('card', 'c2', { reference: 'John 3:16', verseText: 'For God so loved.', note: null, translation: 'KJV', createdAt: 1, updatedAt: 2, decks: [{ deckId: d.id, addedAt: 3 }] })!.doc);
    expect(await cards.get('c2')).toMatchObject({ translationCode: 'KJV', verseText: 'For God so loved.' });
  });
});
