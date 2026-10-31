import { isLicensed, sourceFor } from '../bible/sources';
import { LIMITS, OWN_WORDS, SHARING_LANGUAGES, canPublishTranslation, translationLanguage, type SharingLanguage } from './translations';

/** A published deck whose cards are in several translations. */
export const MIXED = 'MIXED';

export type PublishBlockReason = 'no-translation' | 'copyrighted' | 'no-language' | 'too-many-cards';
export type PublishPlan =
  | { ok: true; translation: string; language: string; /** Does it hold licensed cards (published without their text)? */ licensed: boolean }
  | { ok: false; reason: PublishBlockReason };

const languageCode = (v: string | null | undefined) => (v && /^[a-z]{2,3}$/.test(v) ? v : null);

/**
 * What a deck is published as, or why it cannot be.
 * - Without licensed cards, as before: the deck's own translation must be an open one (or "my own words"), and its text is published.
 * - With licensed cards, they are published as references only (no text, their translation named), so what is published is allowed as
 *   long as every OTHER card is open text or the author's own words. The deck is labelled with its cards' translation if they all
 *   share one, and "MIXED" if not; its language is that translation's, or (mixed) the deck's own.
 * `cardCodes` are the cards' own translations (null: the deck's). A deck labelled with a licensed translation publishes its cards
 * as references only too (whatever was typed stays on the device; whoever imports the deck gets the text from the platform).
 */
export function planPublish(deck: { translationCode: string | null; bibleLanguage: string | null }, cardCodes: (string | null)[]): PublishPlan {
  if (cardCodes.length > LIMITS.cardsPerDeck) return { ok: false, reason: 'too-many-cards' };
  const effective = cardCodes.map((c) => c ?? deck.translationCode);
  // A licensed translation (a card's own, or the one the deck is labelled with) is published as references only.
  if (!effective.some((c) => isLicensed(c))) {
    if (!deck.translationCode) return { ok: false, reason: 'no-translation' };
    if (!canPublishTranslation(deck.translationCode)) return { ok: false, reason: 'copyrighted' };
    const fixed: SharingLanguage | null = translationLanguage(deck.translationCode);
    const language = fixed ?? SHARING_LANGUAGES.find((l) => l === deck.bibleLanguage) ?? null;
    return language ? { ok: true, translation: deck.translationCode, language, licensed: false } : { ok: false, reason: 'no-language' };
  }
  for (const [i, code] of effective.entries()) {
    if (!code) return { ok: false, reason: 'no-translation' };
    if (!isLicensed(code) && !canPublishTranslation(code)) return { ok: false, reason: 'copyrighted' }; // text typed from a copyrighted translation
  }
  const codes = new Set(effective as string[]);
  const translation = codes.size === 1 ? [...codes][0]! : MIXED;
  // The language the cards share (each translation has one), or else the deck's own.
  const languages = new Set([...codes].map((c) => languageCode(sourceFor(c)?.language) ?? translationLanguage(c)));
  const shared = languages.size === 1 ? [...languages][0] : null;
  const language = shared ?? languageCode(deck.bibleLanguage);
  return language ? { ok: true, translation, language, licensed: true } : { ok: false, reason: 'no-language' };
}

export const isOwnWords = (code: string | null | undefined) => code === OWN_WORDS;
