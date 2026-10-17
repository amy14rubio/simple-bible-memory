import { toast } from '../../components/shadcn/toast';
import { UndoTitle } from './UndoTitle';
import type { CardRepository } from '../../data/repositories/cardRepository';
import type { MessageKey } from '../../i18n';

type Translate = (key: MessageKey, values?: Record<string, string | number>) => string;

const SHOWN = 3;
const UNDO_FOR_MS = 20_000; // long enough to find the button without sight, or with slow hands

/**
 * Deletes cards and tells the person which ones went, with an Undo that puts them back exactly as they were
 * (verse, note, place in the deck, study progress and history). `ids` should be in the order the cards were on screen.
 */
export async function deleteCardsWithUndo(cards: CardRepository, ids: string[], t: Translate) {
  const deleted = await cards.deleteMany(ids);
  const refs = deleted.cards.map((c) => c.reference);
  if (refs.length === 0) return;
  const listed = refs.slice(0, SHOWN).join(', ');
  const toastId = toast.add({
    title: <UndoTitle text={refs.length === 1 ? t('toast.cardDeleted', { reference: refs[0]! }) : t('toast.cardsDeleted', { count: refs.length })} hint={t('toast.undoHint')} />,
    description: refs.length === 1 ? undefined : refs.length > SHOWN ? `${listed} ${t('toast.andMore', { count: refs.length - SHOWN })}` : listed,
    type: 'success',
    timeout: UNDO_FOR_MS,
    actionProps: {
      children: t('toast.undo'),
      onClick: () => {
        toast.close(toastId);
        void cards.restore(deleted).then(() => toast.add({ title: t('toast.cardsRestored', { count: refs.length }), type: 'success' }));
      },
    },
  });
}
