import type { Repositories } from '../../app/repositories';
import { loadCardKinds } from '../study/cardKinds';
import { loadNewPerDay } from '../study/newPerDay';
import { MAX_DECKS, previewVerses, type WidgetContent } from './snapshot';

/** Reads what the widgets show: due decks, the statistics, and each deck's verses that may be shown. */
export async function collectWidgetContent({ decks, cards, reviews, stats, settings }: Pick<Repositories, 'decks' | 'cards' | 'reviews' | 'stats' | 'settings'>): Promise<WidgetContent> {
  const kinds = await loadCardKinds(settings);
  const list = await decks.list();
  const due = await reviews.dueCounts({ newPerDay: await loadNewPerDay(settings), kinds });
  const overview = await stats.overview(null, kinds);

  const verseDecks: WidgetContent['verseDecks'] = [];
  const licensedDecks: WidgetContent['licensedDecks'] = [];
  for (const deck of list.slice(0, MAX_DECKS)) {
    if (deck.cardCount === 0) continue;
    const verses = previewVerses(deck, await cards.listByDeck(deck.id));
    if (verses.length > 0) verseDecks.push({ id: deck.id, title: deck.title, verses });
    else licensedDecks.push({ id: deck.id, title: deck.title });
  }
  return {
    decks: list.slice(0, MAX_DECKS).map((d) => ({ id: d.id, title: d.title, due: due[d.id] ?? 0, cards: d.cardCount })),
    stats: { memorized: overview.memorized, mastered: overview.mastered, total: overview.totalCards, counts: overview.counts },
    verseDecks,
    licensedDecks,
  };
}
