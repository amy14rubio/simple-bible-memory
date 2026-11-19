import { en, type Dictionary, type Message, type MessageKey } from './messages.en';
import { es } from './messages.es';
import { BOOK_NAMES_ES } from './books.es';
import { formatIntervalWith, type IntervalUnits } from '../domain/scheduling/format';
import { ValidationError, type ValidationCode } from '../domain/errors';

export type { Dictionary, Message, MessageKey };

/**
 * The interface language. This is NOT the language or translation of the Bible text: a deck's verses stay exactly as
 * the learner typed or pasted them, whatever the interface language is.
 *
 * To add a language: write `messages.xx.ts` (typed as Dictionary, so the compiler lists anything missing),
 * add it to LANGUAGES and `dictionaries` below, and add its book names if you want them in Statistics.
 */
export type Language = 'en' | 'es';
export type LanguagePreference = 'system' | Language;

/** Each language is named in itself, so someone can find theirs even when the app is in a language they cannot read. */
export const LANGUAGES: { code: Language; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
];

export const DEFAULT_LANGUAGE: Language = 'en';
const dictionaries: Record<Language, Dictionary> = { en, es };

export const isLanguage = (v: unknown): v is Language => LANGUAGES.some((l) => l.code === v);
export const parseLanguagePreference = (v: unknown): LanguagePreference => (v === 'system' || isLanguage(v) ? v : 'system');

/** "System" picks the first of the browser's preferred languages that the app has ("es-MX" -> es); otherwise English. */
export function resolveLanguage(preference: LanguagePreference, browserLanguages: readonly string[] = []): Language {
  if (preference !== 'system') return preference;
  for (const tag of browserLanguages) {
    const base = tag.toLowerCase().split('-')[0];
    const match = LANGUAGES.find((l) => l.code === base);
    if (match) return match.code;
  }
  return DEFAULT_LANGUAGE;
}

export type Params = Record<string, string | number>;

/** Numbers are written the way the language writes them (1.1 in English, 1,1 in Spanish). */
const formatValue = (language: Language, value: string | number) =>
  typeof value === 'number' ? new Intl.NumberFormat(language, { maximumFractionDigits: 1, useGrouping: false }).format(value) : value;

const fill = (language: Language, text: string, params: Params = {}) =>
  text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? formatValue(language, params[name]!) : whole));

/** Looks a message up in a language, picks the singular or plural form from `count`, and fills in {placeholders}. */
export function translate(language: Language, key: MessageKey, params?: Params): string {
  const message = dictionaries[language][key] ?? en[key];
  if (typeof message === 'string') return fill(language, message, params);
  const count = Number(params?.count);
  const form = new Intl.PluralRules(language).select(Number.isFinite(count) ? count : 0);
  return fill(language, form === 'one' ? message.one : message.other, params);
}

/** Interval labels in a language: 10m / 10 min, 6mo / 6 meses. */
export function intervalUnits(language: Language): IntervalUnits {
  const unit = (key: MessageKey) => (count: number) => translate(language, key, { count });
  return { minutes: unit('unit.minutes'), hours: unit('unit.hours'), days: unit('unit.days'), months: unit('unit.months'), years: unit('unit.years') };
}
export const formatIntervalIn = (language: Language, ms: number) => formatIntervalWith(ms, intervalUnits(language));

/** The same, written out for a screen reader to say: "10 minutes", "6 months" ("10m" is read as a letter). */
export function formatIntervalSpokenIn(language: Language, ms: number): string {
  const unit = (key: MessageKey) => (count: number) => translate(language, key, { count });
  return formatIntervalWith(ms, { minutes: unit('unitSpoken.minutes'), hours: unit('unitSpoken.hours'), days: unit('unitSpoken.days'), months: unit('unitSpoken.months'), years: unit('unitSpoken.years') });
}

/** A book's name in the interface language. Unknown books and languages without a table show the canonical name. */
export function bookName(language: Language, canonical: string): string {
  return language === 'es' ? BOOK_NAMES_ES[canonical] ?? canonical : canonical;
}

const VALIDATION_KEYS: Record<ValidationCode, MessageKey> = {
  'deck-title-required': 'error.deckTitleRequired',
  'reference-required': 'error.referenceRequired',
  'verse-text-required': 'error.verseTextRequired',
};

/**
 * Text for an error in the interface language. Errors the person can fix are translated; anything technical is kept out of sight (it goes to the
 * console for whoever is debugging) and the person sees a plain, friendly sentence.
 */
export function describeError(language: Language, error: unknown): string {
  if (error instanceof ValidationError) return translate(language, VALIDATION_KEYS[error.code]);
  console.error(error);
  return translate(language, 'error.generic');
}

const CACHE_KEY = 'language-pref'; // flash-avoidance cache only; the settings table is the source of truth

export function cachedLanguagePreference(): LanguagePreference {
  try { return parseLanguagePreference(localStorage.getItem(CACHE_KEY)); } catch { return 'system'; }
}
export function cacheLanguagePreference(p: LanguagePreference) {
  try { localStorage.setItem(CACHE_KEY, p); } catch { /* the cache is optional */ }
}

/** The language to use right now, for code that runs outside the provider (the crash screen, the database loading screen). */
export function currentLanguage(): Language {
  return resolveLanguage(cachedLanguagePreference(), typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]);
}
