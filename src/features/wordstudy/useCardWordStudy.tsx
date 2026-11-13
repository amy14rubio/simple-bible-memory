import { useState, type ReactNode } from 'react';
import type { Card } from '../../domain/types';
import { WordStudyDrawer, type WordStudyTarget } from './WordStudyDrawer';
import { useLongPressWord } from './useLongPressWord';

/**
 * Word study on a card's verse: the handlers to spread on the verse's element, and the drawer itself (to be rendered anywhere in the card).
 * Holding a word of the verse (whatever the translation) opens the drawer for the verse, with its short explanation and its ways to go on; the word
 * itself is not looked up, because no free text is matched word by word to the original words except on the table page, which the drawer leads to.
 */
export function useCardWordStudy(card: Card): { press: ReturnType<typeof useLongPressWord>; drawer: ReactNode } {
  const [study, setStudy] = useState<WordStudyTarget | null>(null);
  const press = useLongPressWord(() => setStudy({ reference: card.reference }));
  return { press, drawer: <WordStudyDrawer target={study} onClose={() => setStudy(null)} /> };
}
