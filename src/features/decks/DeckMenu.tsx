import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useRepositories } from '../../app/repositories';
import { ConfirmDialog, Dialog } from '../../components/ui';
import { useI18n } from '../../i18n/I18nProvider';

const item = 'flex min-h-12 w-full items-center border-b border-border text-left text-base hover:bg-surface';

/** The wireframe's deck popup. Only actions that exist today are listed. */
export function DeckMenu({ deck, onClose, onDeleted }: {
  deck: { id: string; title: string } | null; onClose: () => void; onDeleted: () => void;
}) {
  const { t, describeError } = useI18n();
  const { decks } = useRepositories();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();

  const remove = async () => {
    if (!deck) return;
    try {
      await decks.delete(deck.id);
      setConfirming(false);
      onClose();
      onDeleted();
    } catch (e) {
      setConfirming(false);
      setError(describeError(e));
    }
  };

  return (
    <>
      {/* While the delete confirmation is up, this dialog closes on purpose: that must not clear the selected deck. */}
      <Dialog open={!!deck && !confirming} onClose={() => { if (!confirming) onClose(); }} title={deck?.title ?? t('deckMenu.defaultTitle')}>
        {error && <p role="alert" className="mb-2 text-danger">{error}</p>}
        <nav aria-label={t('deckMenu.actions')} className="flex flex-col border-t border-border">
          <Link to={`/cards/new?deck=${deck?.id}`} onClick={onClose} className={item}>{t('deckMenu.addCard')}</Link>
          <Link to={`/decks/${deck?.id}/cards`} onClick={onClose} className={item}>{t('deckMenu.browse')}</Link>
          <Link to={`/decks/${deck?.id}?practice=1`} onClick={onClose} className={item}>{t('deckMenu.extraPractice')}</Link>
          <Link to={`/decks/${deck?.id}/edit`} onClick={onClose} className={item}>{t('deckMenu.rename')}</Link>
          <button type="button" onClick={() => setConfirming(true)} className={`${item} text-danger`}>{t('deckMenu.delete')}</button>
        </nav>
      </Dialog>
      <ConfirmDialog
        open={confirming}
        title={t('deckMenu.deleteTitle')}
        message={t('deckMenu.deleteBody', { title: deck?.title ?? '' })}
        confirmLabel={t('deckMenu.delete')}
        onConfirm={remove}
        onCancel={() => { setConfirming(false); onClose(); }}
      />
    </>
  );
}
