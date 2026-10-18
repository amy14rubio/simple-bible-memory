import { toast } from '../../components/shadcn/toast';
import { UndoTitle } from './UndoTitle';
import type { CardRepository } from '../../data/repositories/cardRepository';
import type { MessageKey } from '../../i18n';

type Translate = (key: MessageKey, values?: Record<string, string | number>) => string;

const UNDO_FOR_MS = 20_000; // long enough to find the button without sight, or with slow hands

/** Moves cards to a deck and says so, with an Undo (for tapping the wrong deck) that puts them back where they were. */
export async function moveCardsWithUndo(cards: CardRepository, ids: string[], toDeckId: string, deckTitle: string, t: Translate) {
  const moved = await cards.moveMany(ids, toDeckId);
  const toastId = toast.add({
    title: <UndoTitle text={t('toast.moved', { count: ids.length, deck: deckTitle })} hint={t('toast.undoHint')} />,
    type: 'success',
    timeout: UNDO_FOR_MS,
    actionProps: {
      children: t('toast.undo'),
      onClick: () => {
        toast.close(toastId);
        void cards.undoMove(moved).then(() => toast.add({ title: t('toast.moveUndone', { count: ids.length }), type: 'success' }));
      },
    },
  });
}
