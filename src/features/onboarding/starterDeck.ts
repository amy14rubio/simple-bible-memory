import type { CardRepository } from '../../data/repositories/cardRepository';
import type { DeckRepository } from '../../data/repositories/deckRepository';
import type { SettingsRepository } from '../../data/repositories/settingsRepository';
import { STARTER_TEXT } from '../../domain/starter/starterText';
import { translate, type Language } from '../../i18n';

/** Remembers the starter deck was added, so it is never added twice and never comes back after it is deleted. */
export const STARTER_ADDED = 'starter_deck_added';

/**
 * Adds the starter deck: a normal deck (the person can study, edit or delete it) with the passages in `language`
 * (the app's language when they first opened it): Spanish gets Reina-Valera 1909, everything else the World English Bible.
 * It does nothing if the starter deck was already added once.
 */
export async function addStarterDeck(
  { decks, cards, settings }: { decks: DeckRepository; cards: CardRepository; settings: SettingsRepository },
  language: Language,
): Promise<boolean> {
  if (await settings.get<boolean>(STARTER_ADDED)) return false;
  await settings.set(STARTER_ADDED, true); // first, so a failure half way never leads to a second copy
  const text = STARTER_TEXT[language === 'es' ? 'es' : 'en'];
  const deck = await decks.create({
    title: translate(language, 'starter.title'),
    description: translate(language, 'starter.description'),
    translationCode: text.translationCode,
    bibleLanguage: text.bibleLanguage,
  });
  await cards.createMany(deck.id, text.cards.map((c) => ({ reference: c.reference, verseText: c.verseText })));
  return true;
}
