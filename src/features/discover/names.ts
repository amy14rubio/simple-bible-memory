import { OPEN_TRANSLATIONS, OWN_WORDS } from '../../domain/sharing/translations';
import type { PublicDeck } from './types';

export const LANGUAGE_NAME = { en: 'English', es: 'Español' } as const;

/** A short name for a deck's translation: its code (KJV), or "my own words" in the app's language. */
export const translationLabel = (code: string, ownWords: string) => (code === OWN_WORDS ? ownWords : OPEN_TRANSLATIONS.find((t) => t.code === code)?.code ?? code);

/** "KJV · English · 12 cards" */
export const deckSummary = (deck: Pick<PublicDeck, 'translation' | 'language' | 'cardCount'>, ownWords: string, cards: string) =>
  [translationLabel(deck.translation, ownWords), LANGUAGE_NAME[deck.language], cards].join(' · ');
