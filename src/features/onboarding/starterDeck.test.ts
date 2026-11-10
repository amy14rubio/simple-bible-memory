import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase } from '../../test/db';
import { createDeckRepository } from '../../data/repositories/deckRepository';
import { createCardRepository } from '../../data/repositories/cardRepository';
import { createSettingsRepository } from '../../data/repositories/settingsRepository';
import { STARTER_TEXT } from '../../domain/starter/starterText';
import { PUBLISHABLE_CODES } from '../../domain/sharing/translations';
import { addStarterDeck } from './starterDeck';

let repos: { decks: ReturnType<typeof createDeckRepository>; cards: ReturnType<typeof createCardRepository>; settings: ReturnType<typeof createSettingsRepository> };
beforeEach(async () => {
  const db = await createTestDatabase();
  repos = { decks: createDeckRepository(db), cards: createCardRepository(db), settings: createSettingsRepository(db) };
});

describe('the starter deck text', () => {
  it('has the same passages, in the same order, in English and Spanish, and both translations are open', () => {
    const numbers = (lang: 'en' | 'es') => STARTER_TEXT[lang].cards.map((c) => c.reference.replace(/^.*\s(\d+:\d+(-\d+)?)$/, '$1'));
    expect(STARTER_TEXT.en.cards).toHaveLength(13);
    expect(numbers('es')).toEqual(numbers('en'));
    expect(STARTER_TEXT.en.cards.map((c) => c.reference)).toContain('Romans 5:8');
    expect(STARTER_TEXT.es.cards.map((c) => c.reference)).toContain('Romanos 5:8');
    expect(PUBLISHABLE_CODES).toContain(STARTER_TEXT.en.translationCode);
    expect(PUBLISHABLE_CODES).toContain(STARTER_TEXT.es.translationCode);
    for (const c of [...STARTER_TEXT.en.cards, ...STARTER_TEXT.es.cards]) expect(c.verseText.length).toBeGreaterThan(10);
  });
});

describe('addStarterDeck()', () => {
  it('adds an English deck with every verse, titled "Starter deck!"', async () => {
    expect(await addStarterDeck(repos, 'en')).toBe(true);
    const [deck] = await repos.decks.list();
    expect(deck).toMatchObject({ title: 'Starter deck!', description: "If you're new to the app, start here!", translationCode: 'WEB', bibleLanguage: 'en' });
    const cards = await repos.cards.listByDeck(deck!.id);
    expect(cards.map((c) => c.reference)).toEqual(STARTER_TEXT.en.cards.map((c) => c.reference)); // in order
    expect(cards[0]!.verseText).toBe(STARTER_TEXT.en.cards[0]!.verseText);
  });

  it('adds a Spanish deck (Reina-Valera 1909) when the app is in Spanish', async () => {
    await addStarterDeck(repos, 'es');
    const [deck] = await repos.decks.list();
    expect(deck).toMatchObject({ title: '¡Primera carpeta!', description: 'Si eres nuevo en la app, ¡empieza aquí!', translationCode: 'RV1909', bibleLanguage: 'es' });
    expect((await repos.cards.listByDeck(deck!.id)).map((c) => c.reference)).toContain('Romanos 5:8');
  });

  it('is only ever added once, even after it is deleted', async () => {
    await addStarterDeck(repos, 'en');
    const [deck] = await repos.decks.list();
    await repos.decks.delete(deck!.id);
    expect(await addStarterDeck(repos, 'en')).toBe(false);
    expect(await addStarterDeck(repos, 'es')).toBe(false);
    expect(await repos.decks.list()).toHaveLength(0);
  });
});
