import { useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Card } from '../../domain/types';
import { WordStudyDrawer, type WordStudyTarget } from './WordStudyDrawer';
import { useLongPressWord } from './useLongPressWord';

/**
 * Word study on a card's verse: the handlers to spread on the verse's element, and the drawer itself (to be rendered anywhere in the card).
 * Holding a word of the verse (whatever the translation) opens the drawer for the verse, with its short explanation and its ways to go on; the word
 * itself is not looked up, because no free text is matched word by word to the original words except on the table page, which the drawer leads to.
 */
/** The history entries whose reopening has been done (each entry has its own key), so coming back to one again later does not open the drawer twice. */
const reopenedOnce = new Set<string>();

/**
 * When the drawer's button takes someone to the Interlinear page, the study screen they leave is marked (in its own history entry) with the card that was
 * open. Coming back with Back, the screen is built again from nothing, and this mark brings the card back as it was: the answer shown and the drawer open.
 */
export function useCardWordStudy(card: Card): { press: ReturnType<typeof useLongPressWord>; drawer: ReactNode; /** The screen was reached by Back from this card's Interlinear page: show the answer. */ reopened: boolean } {
  const location = useLocation();
  const navigate = useNavigate();
  const [reopened] = useState(() => (location.state as { reopenWord?: string } | null)?.reopenWord === card.id && !reopenedOnce.has(location.key));
  useEffect(() => { if (reopened) reopenedOnce.add(location.key); }, [reopened, location.key]);
  const [study, setStudy] = useState<WordStudyTarget | null>(reopened ? { reference: card.reference } : null);
  const press = useLongPressWord(() => setStudy({ reference: card.reference }));
  const leave = () => navigate(`${location.pathname}${location.search}`, { replace: true, state: { reopenWord: card.id } });
  return { press, reopened, drawer: <WordStudyDrawer target={study} onClose={() => setStudy(null)} onLeave={leave} /> };
}
