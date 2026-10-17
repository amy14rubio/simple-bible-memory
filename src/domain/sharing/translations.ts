/**
 * Which Bible texts may be published in a public deck. Most modern translations (NIV, ESV, RVR1960 and others) are
 * copyrighted, and publishing their text without permission could get the app taken down for everyone. So public decks
 * may hold only translations that are free to share (public domain or openly licensed), or the author's own words.
 *
 * `firestore.rules` repeats this list (rules cannot import code); a unit test keeps the two in step.
 */
export type SharingLanguage = 'en' | 'es';

export interface OpenTranslation {
  code: string;
  name: string;
  language: SharingLanguage;
}

export const OPEN_TRANSLATIONS: OpenTranslation[] = [
  { code: 'KJV', name: 'King James Version', language: 'en' },
  { code: 'WEB', name: 'World English Bible', language: 'en' },
  { code: 'ASV', name: 'American Standard Version', language: 'en' },
  { code: 'YLT', name: "Young's Literal Translation", language: 'en' },
  { code: 'DARBY', name: 'Darby Translation', language: 'en' },
  { code: 'RV1909', name: 'Reina-Valera 1909', language: 'es' },
];

/** Text the author wrote themselves (their own paraphrase or notes), in either language. */
export const OWN_WORDS = 'OWN';

export const PUBLISHABLE_CODES = [...OPEN_TRANSLATIONS.map((t) => t.code), OWN_WORDS];

export const SHARING_LANGUAGES: SharingLanguage[] = ['en', 'es'];

/** The language a translation is in; "my own words" can be either, so it has none of its own. */
export const translationLanguage = (code: string): SharingLanguage | null => OPEN_TRANSLATIONS.find((t) => t.code === code)?.language ?? null;

/** Is this deck allowed to be published? (Its translation must be an open one, or the author's own words.) */
export const canPublishTranslation = (code: string | null | undefined): boolean => !!code && PUBLISHABLE_CODES.includes(code);

/** Why publishing is not allowed, for a message to the author. */
export type PublishBlock = 'no-translation' | 'copyrighted';
export function publishBlock(code: string | null | undefined): PublishBlock | null {
  if (!code) return 'no-translation';
  return canPublishTranslation(code) ? null : 'copyrighted';
}

export const LIMITS = { title: 200, description: 2000, reference: 200, verseText: 20_000, note: 500, cardsPerDeck: 1000 } as const;
