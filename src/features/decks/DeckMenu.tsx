import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, EyeOff, Globe, List, Pencil, Plus, Repeat, Trash2 } from 'lucide-react';
import { useRepositories } from '../../app/repositories';
import { ConfirmDialog, Dialog, ErrorMessage, useErrorState } from '../../components/ui';
import { useI18n } from '../../i18n/I18nProvider';
import { ExportDrawer, type ExportTarget } from '../exchange/ExportDrawer';
import { PublishDrawer } from '../sharing/PublishDrawer';
import { useSharing } from '../../app/sharing';
import { useAsync } from '../../app/useAsync';

const item = 'flex min-h-12 w-full items-center gap-3 border-b border-border text-left text-base hover:bg-surface';
/** The small line icon before each menu item: plain, in the text colour (muted), with no background. */
const icon = 'shrink-0 text-muted';

/** The wireframe's deck popup. Only actions that exist today are listed. */
export function DeckMenu({ deck, onClose, onDeleted }: {
  deck: { id: string; title: string } | null; onClose: () => void; onDeleted: () => void;
}) {
  const { t, describeError } = useI18n();
  const { decks, sharing } = useRepositories();
  // The popup fades out after `deck` is cleared, so it keeps showing the last collection until it is gone (otherwise its title flashes "Collection").
  const last = useRef(deck);
  if (deck) last.current = deck;
  const shown = deck ?? last.current;
  const [confirming, setConfirming] = useState(false);
  const [exporting, setExporting] = useState<ExportTarget | null>(null);
  const [publishing, setPublishing] = useState<{ id: string; title: string } | null>(null);
  const share = useSharing();
  const { data: published } = useAsync(async () => (deck ? (await sharing.getDeck(deck.id))?.publishId != null : false), [deck?.id, sharing]);
  const [error, setError] = useErrorState();
  // Signed out, a published deck can still be deleted here, but only here: its public copy is left alone, now and later.
  const signedIn = share.user !== null;

  const remove = async () => {
    if (!deck) return;
    try {
      const publishId = signedIn ? undefined : (await sharing.getDeck(deck.id))?.publishId;
      await decks.delete(deck.id);
      // Deleting a published deck normally queues taking its public copy down. Signed out, the person chose to delete only here, so
      // the queued removal is dropped: it must never run when they sign in again.
      if (publishId) await sharing.clearDeckRemoval(publishId);
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
      <Dialog open={!!deck && !confirming} onClose={() => { if (!confirming) onClose(); }} title={shown?.title ?? t('deckMenu.defaultTitle')}>
        {error && <div className="mb-2"><ErrorMessage error={error} /></div>}
        <nav aria-label={t('deckMenu.actions')} className="flex flex-col border-t border-border">
          <Link to={`/cards/new?collection=${shown?.id}`} onClick={onClose} className={item}><Plus size={20} aria-hidden className={icon} />{t('deckMenu.addCard')}</Link>
          <Link to={`/collections/${shown?.id}/cards`} onClick={onClose} className={item}><List size={20} aria-hidden className={icon} />{t('deckMenu.browse')}</Link>
          <Link to={`/collections/${shown?.id}?practice=1`} onClick={onClose} className={item}><Repeat size={20} aria-hidden className={icon} />{t('deckMenu.extraPractice')}</Link>
          <Link to={`/collections/${shown?.id}/edit`} onClick={onClose} className={item}><Pencil size={20} aria-hidden className={icon} />{t('deckMenu.rename')}</Link>
          <button type="button" onClick={() => { if (deck) setExporting({ ids: [deck.id], title: deck.title }); onClose(); }} className={item}><Download size={20} aria-hidden className={icon} />{t('deckMenu.export')}</button>
          {share.available && <button type="button" onClick={() => { if (deck) setPublishing({ id: deck.id, title: deck.title }); onClose(); }} className={item}>{published ? <EyeOff size={20} aria-hidden className={icon} /> : <Globe size={20} aria-hidden className={icon} />}{published ? t('deckMenu.published') : t('deckMenu.publish')}</button>}
          <button type="button" onClick={() => setConfirming(true)} className={`${item} text-danger`}><Trash2 size={20} aria-hidden className="shrink-0" />{t('deckMenu.delete')}</button>
        </nav>
      </Dialog>
      <ExportDrawer target={exporting} onClose={() => setExporting(null)} />
      <PublishDrawer deck={publishing} onClose={() => setPublishing(null)} />
      <ConfirmDialog
        open={confirming}
        title={t('deckMenu.deleteTitle')}
        message={t('deckMenu.deleteBody', { title: shown?.title ?? '' })}
        warning={published ? t(signedIn ? 'deckMenu.deletePublished' : 'deckMenu.deletePublishedSignedOut') : undefined}
        confirmLabel={published && signedIn ? t('deckMenu.deleteAndUnpublish') : t('deckMenu.delete')}
        onConfirm={remove}
        onCancel={() => { setConfirming(false); onClose(); }}
      />
    </>
  );
}
