import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../test/db';
import { createDeckRepository, type DeckRepository } from './deckRepository';
import { createCardRepository, type CardRepository } from './cardRepository';
import type { Database } from '../database/Database';
import { ValidationError } from '../../domain/errors';

let db: Database, decks: DeckRepository, cards: CardRepository, clock: number;
const card = { reference: 'John 3:16', verseText: 'Example verse text.' };

beforeEach(async () => {
  db = await createTestDatabase();
  clock = 1000;
  decks = createDeckRepository(db, () => clock);
  cards = createCardRepository(db, () => clock);
});

describe('validation errors carry a code, so the screen can show them in the right language', () => {
  it('for decks and cards', async () => {
    const d = await decks.create({ title: 'D' });
    const code = async (p: Promise<unknown>) => { try { await p; return 'no error'; } catch (e) { return e instanceof ValidationError ? e.code : 'other'; } };
    expect(await code(decks.create({ title: ' ' }))).toBe('deck-title-required');
    expect(await code(decks.update(d.id, { title: '' }))).toBe('deck-title-required');
    expect(await code(cards.create(d.id, { reference: '', verseText: 'x' }))).toBe('reference-required');
    expect(await code(cards.create(d.id, { reference: 'r', verseText: ' ' }))).toBe('verse-text-required');
    expect(await code(cards.createMany(d.id, [{ reference: 'r', verseText: '' }]))).toBe('verse-text-required');
    expect(await code(cards.update('x', { reference: ' ', verseText: 'v' }))).toBe('reference-required');
  });
});

describe('decks', () => {
  it('creates, trims and lists decks with card counts, sorted by title', async () => {
    const b = await decks.create({ title: '  Banana  ', description: '  ' });
    const a = await decks.create({ title: 'apple' });
    await cards.create(b.id, card);
    const list = await decks.list();
    expect(list.map((d) => [d.title, d.cardCount])).toEqual([['apple', 0], ['Banana', 1]]);
    expect(b.description).toBeNull();
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects an empty title', async () => {
    await expect(decks.create({ title: '   ' })).rejects.toThrow('Deck title is required');
  });

  it('renames and bumps updated_at but not created_at', async () => {
    const d = await decks.create({ title: 'Old' });
    clock = 5000;
    await decks.update(d.id, { title: 'New', description: 'desc' });
    const got = await decks.get(d.id);
    expect(got).toMatchObject({ title: 'New', description: 'desc', createdAt: 1000, updatedAt: 5000 });
  });

  it('get returns undefined for an unknown id', async () => {
    expect(await decks.get('nope')).toBeUndefined();
  });

  it('deleting a deck removes its cards, schedule and logs, but keeps cards shared with another deck', async () => {
    const d1 = await decks.create({ title: 'One' });
    const d2 = await decks.create({ title: 'Two' });
    const only = await cards.create(d1.id, card);
    const shared = await cards.create(d1.id, { reference: 'Ps 23:1', verseText: 'x' });
    await db.run('INSERT INTO deck_cards (deck_id, card_id, added_at) VALUES (?, ?, 0)', [d2.id, shared.id]);
    await db.run(
      `INSERT INTO card_schedule VALUES (?, 'recall', 0, 0, 0, 0, 0, 0, 0, 0, NULL, 'x')`, [only.id]);

    await decks.delete(d1.id);

    expect(await decks.get(d1.id)).toBeUndefined();
    expect(await cards.get(only.id)).toBeUndefined();
    expect(await db.query('SELECT 1 FROM card_schedule')).toHaveLength(0);
    expect(await cards.get(shared.id)).toBeDefined();
    expect((await cards.listByDeck(d2.id)).map((c) => c.id)).toEqual([shared.id]);
  });
});

describe('cards', () => {
  it('creates a card in a deck and lists it', async () => {
    const d = await decks.create({ title: 'D' });
    const c = await cards.create(d.id, { ...card, note: ' my note ' });
    expect(await cards.listByDeck(d.id)).toEqual([c]);
    expect(c.note).toBe('my note');
  });

  it('stores verse text exactly as typed (inner whitespace and punctuation untouched)', async () => {
    const d = await decks.create({ title: 'D' });
    const c = await cards.create(d.id, { reference: 'r', verseText: 'a,  b\nc' });
    expect((await cards.get(c.id))!.verseText).toBe('a,  b\nc');
  });

  it('requires reference and verse text', async () => {
    const d = await decks.create({ title: 'D' });
    await expect(cards.create(d.id, { reference: '', verseText: 'x' })).rejects.toThrow('Reference is required');
    await expect(cards.create(d.id, { reference: 'x', verseText: ' ' })).rejects.toThrow('Verse text is required');
  });

  it('creating a card in a missing deck fails and leaves no stray card', async () => {
    await expect(cards.create('missing', card)).rejects.toThrow();
    expect(await db.query('SELECT 1 FROM cards')).toHaveLength(0);
  });

  it('createMany saves every card in order, in one transaction', async () => {
    const d = await decks.create({ title: 'D' });
    const made = await cards.createMany(d.id, [
      { reference: 'Psalm 130:1', verseText: 'one', note: ' src ' },
      { reference: 'Psalm 130:2', verseText: 'two', note: 'src' },
      { reference: 'Psalm 130:3', verseText: 'three' },
    ]);
    expect(made.map((c) => c.reference)).toEqual(['Psalm 130:1', 'Psalm 130:2', 'Psalm 130:3']);
    expect((await cards.listByDeck(d.id)).map((c) => c.reference)).toEqual(['Psalm 130:1', 'Psalm 130:2', 'Psalm 130:3']);
    expect(made[0]!.note).toBe('src');
    expect((await decks.list())[0]!.cardCount).toBe(3);
  });

  it('createMany saves nothing if any card is invalid or the deck is missing', async () => {
    const d = await decks.create({ title: 'D' });
    await expect(cards.createMany(d.id, [{ reference: 'a', verseText: 'x' }, { reference: 'b', verseText: ' ' }])).rejects.toThrow('Verse text is required');
    await expect(cards.createMany('missing', [{ reference: 'a', verseText: 'x' }])).rejects.toThrow();
    expect(await db.query('SELECT 1 FROM cards')).toHaveLength(0);
    expect(await db.query('SELECT 1 FROM deck_cards')).toHaveLength(0);
  });

  it('createMany with nothing to create is a no-op', async () => {
    const d = await decks.create({ title: 'D' });
    expect(await cards.createMany(d.id, [])).toEqual([]);
  });

  it('edits a card', async () => {
    const d = await decks.create({ title: 'D' });
    const c = await cards.create(d.id, card);
    clock = 9000;
    await cards.update(c.id, { reference: 'John 3:17', verseText: 'new', note: null });
    expect(await cards.get(c.id)).toMatchObject({ reference: 'John 3:17', verseText: 'new', createdAt: 1000, updatedAt: 9000 });
  });

  it('deleting a card updates the deck count', async () => {
    const d = await decks.create({ title: 'D' });
    const c = await cards.create(d.id, card);
    await cards.delete(c.id);
    expect((await decks.list())[0]!.cardCount).toBe(0);
    expect(await db.query('SELECT 1 FROM deck_cards')).toHaveLength(0);
  });
});
