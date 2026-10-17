import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useRepositories } from '../../app/repositories';
import { ConfirmDialog, Dialog } from '../../components/ui';
import { useI18n } from '../../i18n/I18nProvider';
import { ExportDrawer, type ExportTarget } from '../exchange/ExportDrawer';
import { PublishDrawer } from '../sharing/PublishDrawer';
import { useSharing } from '../../app/sharing';
import { useAsync } from '../../app/useAsync';

const item = 'flex min-h-12 w-full items-center border-b border-border text-left text-base hover:bg-surface';

/** The wireframe's deck popup. Only actions that exist today are listed. */
export function DeckMenu({ deck, onClose, onDeleted }: {
  deck: { id: string; title: string } | null; onClose: () => void; onDeleted: () => void;
}) {
  const { t, describeError } = useI18n();
  const { decks, sharing } = useRepositories();
  const [confirming, setConfirming] = useState(false);
  const [exporting, setExporting] = useState<ExportTarget | null>(null);
  const [publishing, setPublishing] = useState<{ id: string; title: string } | null>(null);
  const share = useSharing();
  const { data: published } = useAsync(async () => (deck ? (await sharing.getDeck(deck.id))?.publishId != null : false), [deck?.id, sharing]);
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
          <Link to={`/decks/${deck?.id}/cards`} onClick={onClose} className={item}>{t('deckMenu.browse')}</Link>
          <Link to={`/decks/${deck?.id}?practice=1`} onClick={onClose} className={item}>{t('deckMenu.extraPractice')}</Link>
          <Link to={`/decks/${deck?.id}/edit`} onClick={onClose} className={item}>{t('deckMenu.rename')}</Link>
          <button type="button" onClick={() => { if (deck) setExporting({ ids: [deck.id], title: deck.title }); onClose(); }} className={item}>{t('deckMenu.export')}</button>
          {share.available && <button type="button" onClick={() => { if (deck) setPublishing({ id: deck.id, title: deck.title }); onClose(); }} className={item}>{published ? t('deckMenu.published') : t('deckMenu.publish')}</button>}
          <button type="button" onClick={() => setConfirming(true)} className={`${item} text-danger`}>{t('deckMenu.delete')}</button>
        </nav>
      </Dialog>
      <ExportDrawer target={exporting} onClose={() => setExporting(null)} />
      <PublishDrawer deck={publishing} onClose={() => setPublishing(null)} />
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
