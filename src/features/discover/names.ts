import { useEffect, useState } from 'react';
import { OPEN_TRANSLATIONS, OWN_WORDS } from '../../domain/sharing/translations';
import { sourceFor } from '../../domain/bible/sources';
import { MIXED } from '../../domain/sharing/plan';
import { languageName, loadLanguageNames } from '../../domain/bible/languageNames';
import type { PublicDeck } from './types';

export const LANGUAGE_NAME: Record<string, string> = { en: 'English', es: 'Español' };

/** A language's name for a deck's summary: English and Español as always, any other from the names the picker uses. */
export const languageLabel = (code: string) => LANGUAGE_NAME[code] ?? languageName(code, 'en') ?? code;

/** Looks again once the names of the less common languages are loaded. */
export function useLanguageNames(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => { void loadLanguageNames().then(() => setReady(true)); }, []);
  return ready;
}

/** A short name for a deck's translation: its code (KJV), "my own words" or "mixed" in the app's language, or a licensed translation's tag. */
export const translationLabel = (code: string, ownWords: string, mixed = 'Mixed') =>
  code === OWN_WORDS ? ownWords : code === MIXED ? mixed : OPEN_TRANSLATIONS.find((t) => t.code === code)?.code ?? sourceFor(code)?.tag ?? code;

/** "KJV · English · 12 cards" */
export const deckSummary = (deck: Pick<PublicDeck, 'translation' | 'language' | 'cardCount'>, ownWords: string, cards: string, mixed?: string) =>
  [translationLabel(deck.translation, ownWords, mixed), languageLabel(deck.language), cards].join(' · ');
