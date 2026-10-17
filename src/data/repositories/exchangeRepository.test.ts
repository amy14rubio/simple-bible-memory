import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../test/db';
import { createDeckRepository } from './deckRepository';
import { createCardRepository } from './cardRepository';
import { createExchangeRepository } from './exchangeRepository';
import { parseExportFile } from '../../domain/exchange/format';
import type { Database } from '../database/Database';
import { ValidationError } from '../../domain/errors';

let db: Database;
let decks: ReturnType<typeof createDeckRepository>;
let cards: ReturnType<typeof createCardRepository>;
let exchange: ReturnType<typeof createExchangeRepository>;

beforeEach(async () => {
  db = await createTestDatabase();
  decks = createDeckRepository(db);
  cards = createCardRepository(db);
  exchange = createExchangeRepository(db);
});

/** A deck with two cards, one of them studied (a schedule for each kind and one review). */
async function seed() {
  const d = await decks.create({ title: 'Psalms', description: 'Memory set' });
  await db.run("UPDATE decks SET bible_language = 'en', translation_code = 'KJV' WHERE id = ?", [d.id]);
  const a = await cards.create(d.id, { reference: 'Psalm 23:1', verseText: 'The Lord is my shepherd; I shall not want.', note: 'KJV' });
  await cards.create(d.id, { reference: 'Psalm 23:2', verseText: 'He maketh me to lie down in green pastures.' });
  await db.run(`INSERT INTO card_schedule VALUES (?, 'recall', 1000, 4.5, 5.5, 2, 3, 1, 0, 7, 900, 'v')`, [a.id]);
  await db.run(`INSERT INTO card_schedule VALUES (?, 'identify', 2000, 1.5, 6.5, 1, 1, 0, 1, 0, 950, 'v')`, [a.id]);
  await db.run(`INSERT INTO review_logs (id, card_id, kind, reviewed_at, rating, study_mode, state_before, due_before, stability, difficulty, scheduled_days, elapsed_days)
                VALUES ('r1', ?, 'recall', 900, 3, 'type', 0, 800, 4.5, 5.5, 7, 0)`, [a.id]);
  return d;
}
const roundTrip = async (ids: string[] | null, progress: boolean) => {
  const out = await exchange.exportDecks(ids, { progress });
  const parsed = parseExportFile(JSON.stringify(out)); // through the same check a real file goes through
  if (!parsed.ok) throw new Error(`file rejected: ${parsed.code} ${parsed.where}`);
  return parsed.file;
};

describe('export', () => {
  it('writes the deck, its details and its cards in order, without progress by default', async () => {
    const d = await seed();
    const file = await roundTrip([d.id], false);
    expect(file.includesProgress).toBe(false);
    expect(file.decks).toHaveLength(1);
    expect(file.decks[0]).toMatchObject({ title: 'Psalms', description: 'Memory set', bibleLanguage: 'en', translationCode: 'KJV' });
    expect(file.decks[0]!.cards.map((c) => c.reference)).toEqual(['Psalm 23:1', 'Psalm 23:2']);
    expect(file.decks[0]!.cards[0]).toEqual({ reference: 'Psalm 23:1', verseText: 'The Lord is my shepherd; I shall not want.', note: 'KJV' });
  });

  it('includes the study schedule and review history when asked', async () => {
    const d = await seed();
    const file = await roundTrip([d.id], true);
    expect(file.includesProgress).toBe(true);
    const first = file.decks[0]!.cards[0]!;
    expect(first.schedules?.map((s) => s.kind).sort()).toEqual(['identify', 'recall']);
    expect(first.schedules?.find((s) => s.kind === 'recall')).toMatchObject({ due: 1000, stability: 4.5, state: 2, reps: 3, lapses: 1, scheduledDays: 7, lastReview: 900 });
    expect(first.reviews).toHaveLength(1);
    expect(first.reviews?.[0]).toMatchObject({ kind: 'recall', rating: 3, studyMode: 'type' });
    expect(file.decks[0]!.cards[1]!.schedules).toEqual([]); // an unstudied card has none
  });

  it('exports everything, alphabetically, when no deck is named', async () => {
    await decks.create({ title: 'Zeta' });
    await decks.create({ title: 'alpha' });
    const file = await roundTrip(null, false);
    expect(file.decks.map((d) => d.title)).toEqual(['alpha', 'Zeta']);
  });
});

describe('import', () => {
  it('adds the deck as a NEW deck with new ids, keeping the cards and their order', async () => {
    const d = await seed();
    const file = await roundTrip([d.id], false);
    const result = await exchange.importFile(file, { progress: false });
    expect(result).toMatchObject({ decks: 1, cards: 2 });

    const all = await decks.list();
    expect(all).toHaveLength(2); // the original and the copy
    const copy = all.find((x) => x.id === result.deckIds[0])!;
    expect(copy.id).not.toBe(d.id);
    expect(copy).toMatchObject({ title: 'Psalms', description: 'Memory set', bibleLanguage: 'en', translationCode: 'KJV', cardCount: 2 });
    expect((await cards.listByDeck(copy.id)).map((c) => c.reference)).toEqual(['Psalm 23:1', 'Psalm 23:2']);
    const original = await cards.listByDeck(d.id);
    const imported = await cards.listByDeck(copy.id);
    expect(imported.map((c) => c.id).some((id) => original.some((o) => o.id === id))).toBe(false); // independent copies
  });

  it('brings the progress along only when you ask for it', async () => {
    const d = await seed();
    const file = await roundTrip([d.id], true);

    const without = await exchange.importFile(file, { progress: false });
    const none = await db.query('SELECT 1 FROM card_schedule s JOIN deck_cards dc ON dc.card_id = s.card_id WHERE dc.deck_id = ?', [without.deckIds[0]!]);
    expect(none).toHaveLength(0);

    const withIt = await exchange.importFile(file, { progress: true });
    const schedules = await db.query<{ kind: string; due: number; state: number }>('SELECT s.kind, s.due, s.state FROM card_schedule s JOIN deck_cards dc ON dc.card_id = s.card_id WHERE dc.deck_id = ? ORDER BY s.kind', [withIt.deckIds[0]!]);
    expect(schedules).toEqual([{ kind: 'identify', due: 2000, state: 1 }, { kind: 'recall', due: 1000, state: 2 }]);
    const logs = await db.query('SELECT l.id FROM review_logs l JOIN deck_cards dc ON dc.card_id = l.card_id WHERE dc.deck_id = ?', [withIt.deckIds[0]!]);
    expect(logs).toHaveLength(1);
    expect((logs[0] as { id: string }).id).not.toBe('r1'); // a new id, so the original's history is untouched
  });

  it('imports several decks at once, and does it all or nothing', async () => {
    await seed();
    await decks.create({ title: 'Empty one' });
    const file = await roundTrip(null, false);
    const before = (await decks.list()).length;
    const ok = await exchange.importFile(file, { progress: false });
    expect(ok.decks).toBe(2);
    expect((await decks.list()).length).toBe(before + 2);

    // a card that cannot be saved (progress for a missing kind value) rolls back the lot
    const broken = JSON.parse(JSON.stringify(file)) as typeof file;
    broken.includesProgress = true;
    broken.decks[1]!.cards = [{ reference: 'X 1:1', verseText: 'x', note: null, schedules: [{ kind: 'recall', due: 1, stability: 1, difficulty: 1, state: 9 as never, reps: 0, lapses: 0, learningSteps: 0, scheduledDays: 0, lastReview: null }] }];
    const count = (await decks.list()).length;
    await expect(exchange.importFile(broken, { progress: true })).rejects.toThrow();
    expect((await decks.list()).length).toBe(count);
  });
});

describe('importing plain cards (Anki)', () => {
  it('makes one new deck with the cards in order', async () => {
    const result = await exchange.importCards({ title: '  From Anki ' }, [
      { reference: 'John 3:16', verseText: 'For God so loved', note: 'KJV' },
      { reference: 'John 3:17', verseText: 'For God sent not' },
    ]);
    expect(result).toMatchObject({ decks: 1, cards: 2 });
    const [deck] = await decks.list();
    expect(deck).toMatchObject({ title: 'From Anki', cardCount: 2 });
    expect((await cards.listByDeck(deck!.id)).map((c) => [c.reference, c.note])).toEqual([['John 3:16', 'KJV'], ['John 3:17', null]]);
  });

  it('refuses a missing title or an empty card, and saves nothing', async () => {
    await expect(exchange.importCards({ title: '   ' }, [{ reference: 'a', verseText: 'b' }])).rejects.toBeInstanceOf(ValidationError);
    await expect(exchange.importCards({ title: 'T' }, [{ reference: '', verseText: 'b' }])).rejects.toBeInstanceOf(ValidationError);
    expect(await decks.list()).toHaveLength(0);
  });
});

describe('importing a public deck', () => {
  it('keeps its translation and language, and remembers where it came from', async () => {
    const result = await exchange.importCards(
      { title: 'Psalm 23', description: 'The shepherd psalm', translationCode: 'KJV', bibleLanguage: 'en', importedFrom: 'public-1' },
      [{ reference: 'Psalm 23:1', verseText: 'The Lord is my shepherd.' }],
    );
    const [deck] = await decks.list();
    expect(deck).toMatchObject({ id: result.deckIds[0], title: 'Psalm 23', description: 'The shepherd psalm', translationCode: 'KJV', bibleLanguage: 'en' });
    expect(await exchange.findImported('public-1')).toEqual({ id: result.deckIds[0], title: 'Psalm 23' });
    expect(await exchange.findImported('something-else')).toBeUndefined();
  });

  it('is an independent, unpublished copy: editing it does not touch anything public', async () => {
    const result = await exchange.importCards({ title: 'Copy', importedFrom: 'public-2' }, [{ reference: 'A 1:1', verseText: 'a' }]);
    const [row] = await db.query<{ publish_id: string | null }>('SELECT publish_id FROM decks WHERE id = ?', [result.deckIds[0]!]);
    expect(row!.publish_id).toBeNull();
  });
});

