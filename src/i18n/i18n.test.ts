import { describe, it, expect } from 'vitest';
import { en } from './messages.en';
import { es } from './messages.es';
import { LANGUAGES, bookName, cachedLanguagePreference, describeError, formatIntervalIn, isLanguage, parseLanguagePreference, resolveLanguage, translate, type Message, type MessageKey } from '.';
import { CANONICAL_BOOKS } from '../domain/bible/reference';
import { ValidationError } from '../domain/errors';
import { formatInterval } from '../domain/scheduling/format';

const keys = Object.keys(en) as MessageKey[];
const forms = (m: Message) => (typeof m === 'string' ? [m] : [m.one, m.other]);
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

describe('dictionaries', () => {
  it('Spanish has exactly the same keys as English', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });

  it('every message has the same shape in both languages (a string, or singular + plural)', () => {
    for (const k of keys) expect(typeof es[k], k).toBe(typeof en[k]);
  });

  it('every message uses the same {placeholders} in both languages', () => {
    for (const k of keys) {
      const a = forms(en[k]).map(placeholders);
      const b = forms(es[k]).map(placeholders);
      expect(b, `placeholders of "${k}"`).toEqual(a);
    }
  });

  it('no message is empty', () => {
    for (const k of keys) for (const f of [...forms(en[k]), ...forms(es[k])]) expect(f.trim(), k).not.toBe('');
  });

  it('nothing was left untranslated, except names that are the same in both languages', () => {
    // The names of two Bible translations are written the same in English and in Spanish (the Interlinear page's captions under the verses).
    const SAME_ON_PURPOSE = ['wordstudy.bsb', 'wordstudy.rv1909'];
    const sameInBoth = keys.filter((k) => JSON.stringify(en[k]) === JSON.stringify(es[k]) && !SAME_ON_PURPOSE.includes(k));
    expect(sameInBoth).toEqual([]);
  });

  it('the app and Bible Gateway keep their names and examples sensible in Spanish', () => {
    expect(es['app.name']).toBe('Memoria Bíblica Simple');
    expect(es['cardForm.versesPlaceholder']).toBe('Ej. Juan 3:16');
  });
});

describe('translate', () => {
  it('fills in {placeholders}', () => {
    expect(translate('en', 'decks.actionsFor', { title: 'Psalms' })).toBe('Actions for Psalms');
    expect(translate('es', 'decks.actionsFor', { title: 'Salmos' })).toBe('Acciones de Salmos');
  });

  it('chooses singular or plural from `count`, in each language', () => {
    expect(translate('en', 'deckHome.toStudy', { count: 1 })).toBe('1 card to study today.');
    expect(translate('en', 'deckHome.toStudy', { count: 5 })).toBe('5 cards to study today.');
    expect(translate('en', 'deckHome.toStudy', { count: 0 })).toBe('0 cards to study today.');
    expect(translate('es', 'deckHome.toStudy', { count: 1 })).toBe('1 tarjeta para estudiar hoy.');
    expect(translate('es', 'deckHome.toStudy', { count: 4 })).toBe('4 tarjetas para estudiar hoy.');
    expect(translate('es', 'deckHome.toStudy', { count: 0 })).toBe('0 tarjetas para estudiar hoy.');
  });

  it('keeps a placeholder visible if its value is missing, instead of showing "undefined"', () => {
    expect(translate('en', 'decks.actionsFor')).toBe('Actions for {title}');
  });

  it('writes numbers the way the language does, and never adds thousands separators', () => {
    expect(translate('en', 'unit.years', { count: 1.1 })).toBe('1.1y');
    expect(translate('es', 'unit.years', { count: 1.1 })).toBe('1,1 años');
    expect(translate('en', 'stats.bookProgress', { memorized: 1200, total: 3000 })).toBe('1200 of 3000 memorized');
  });

  it('keeps user text untouched (text with braces or quotes is passed through as given)', () => {
    expect(translate('es', 'decks.noMatch', { query: '{count} "x"' })).toBe('Ninguna carpeta coincide con "{count} "x"".');
  });
});

describe('languages', () => {
  it('lists English and Spanish, each named in its own language', () => {
    expect(LANGUAGES).toEqual([{ code: 'en', name: 'English' }, { code: 'es', name: 'Español' }]);
    expect(isLanguage('es')).toBe(true);
    expect(isLanguage('fr')).toBe(false);
  });

  it('a saved choice wins over the browser', () => {
    expect(resolveLanguage('es', ['en-US'])).toBe('es');
    expect(resolveLanguage('en', ['es-MX'])).toBe('en');
  });

  it('"system" follows the browser, by its first supported language', () => {
    expect(resolveLanguage('system', ['es-MX', 'en-US'])).toBe('es');
    expect(resolveLanguage('system', ['es'])).toBe('es');
    expect(resolveLanguage('system', ['en-GB'])).toBe('en');
    expect(resolveLanguage('system', ['fr-FR', 'es-ES'])).toBe('es'); // French is not available, so the next one is used
    expect(resolveLanguage('system', ['ES-ar'])).toBe('es'); // case does not matter
  });

  it('falls back to English when the browser language is not available, or unknown', () => {
    expect(resolveLanguage('system', ['fr-FR', 'de'])).toBe('en');
    expect(resolveLanguage('system', [])).toBe('en');
  });

  it('treats anything unexpected in storage as "system"', () => {
    for (const bad of [undefined, null, 'fr', 3, {}, '']) expect(parseLanguagePreference(bad)).toBe('system');
    expect(parseLanguagePreference('es')).toBe('es');
    expect(cachedLanguagePreference()).toBe('system'); // no browser storage in this test environment
  });
});

describe('interval labels', () => {
  const MIN = 60_000, DAY = 86_400_000;
  it('English is unchanged (10m, 3h, 5d, 2mo, 1y)', () => {
    for (const ms of [30_000, 10 * MIN, 90 * MIN, 5 * 3_600_000, 2 * DAY, 45 * DAY, 400 * DAY]) expect(formatIntervalIn('en', ms)).toBe(formatInterval(ms));
  });
  it('Spanish writes minutes, hours, days, months and years in full words where it reads better', () => {
    expect(formatIntervalIn('es', 10 * MIN)).toBe('10 min');
    expect(formatIntervalIn('es', 5 * 3_600_000)).toBe('5 h');
    expect(formatIntervalIn('es', 2 * DAY)).toBe('2 d');
    expect(formatIntervalIn('es', 30 * DAY)).toBe('1 mes');
    expect(formatIntervalIn('es', 180 * DAY)).toBe('6 meses');
    expect(formatIntervalIn('es', 365 * DAY)).toBe('1 año');
    expect(formatIntervalIn('es', 800 * DAY)).toBe('2,2 años');
  });
});

describe('book names', () => {
  it('every book has a Spanish name', () => {
    expect(CANONICAL_BOOKS).toHaveLength(66);
    for (const b of CANONICAL_BOOKS) expect(bookName('es', b), b).not.toBe('');
    expect(new Set(CANONICAL_BOOKS.map((b) => bookName('es', b))).size).toBe(66); // all different
  });
  it('shows well-known ones correctly, and leaves English as it is', () => {
    expect(bookName('es', 'Psalm')).toBe('Salmos');
    expect(bookName('es', 'John')).toBe('Juan');
    expect(bookName('es', '1 Corinthians')).toBe('1 Corintios');
    expect(bookName('es', 'Revelation')).toBe('Apocalipsis');
    expect(bookName('en', 'Psalm')).toBe('Psalm');
  });
  it('an unknown book is shown as given', () => {
    expect(bookName('es', 'Nonexistent')).toBe('Nonexistent');
  });
});

describe('describeError', () => {
  it('translates errors the user can fix', () => {
    expect(describeError('en', new ValidationError('deck-title-required', 'Deck title is required'))).toBe('Collection title is required');
    expect(describeError('es', new ValidationError('deck-title-required', 'Deck title is required'))).toBe('El título de la carpeta es obligatorio');
    expect(describeError('es', new ValidationError('reference-required', 'x'))).toBe('El versículo es obligatorio');
    expect(describeError('es', new ValidationError('verse-text-required', 'x'))).toBe('El pasaje es obligatorio');
  });
  it('shows technical errors as they are', () => {
    expect(describeError('es', new Error('disk full'))).toBe('disk full');
    expect(describeError('es', 'plain text')).toBe('plain text');
  });
});
