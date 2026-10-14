import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useRepositories } from '../../app/repositories';
import { ConfirmDialog, Dialog } from '../../components/ui';

const item = 'flex min-h-12 w-full items-center border-b border-border text-left text-base hover:bg-surface';

/** The wireframe's deck popup. Only actions that exist today are listed. */
export function DeckMenu({ deck, onClose, onDeleted }: {
  deck: { id: string; title: string } | null; onClose: () => void; onDeleted: () => void;
}) {
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
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      {/* While the delete confirmation is up, this dialog closes on purpose: that must not clear the selected deck. */}
      <Dialog open={!!deck && !confirming} onClose={() => { if (!confirming) onClose(); }} title={deck?.title ?? 'Deck'}>
        {error && <p role="alert" className="mb-2 text-danger">{error}</p>}
        <nav aria-label="Deck actions" className="flex flex-col border-t border-border">
          <Link to={`/cards/new?deck=${deck?.id}`} onClick={onClose} className={item}>Add card</Link>
          <Link to={`/decks/${deck?.id}/cards`} onClick={onClose} className={item}>Browse cards</Link>
          <Link to={`/decks/${deck?.id}?practice=1`} onClick={onClose} className={`${item} flex-col items-start justify-center py-2`}>
            <span>Extra practice</span>
            <span className="text-sm text-muted">Doesn't count toward your progress</span>
          </Link>
          <Link to={`/decks/${deck?.id}/edit`} onClick={onClose} className={item}>Rename deck</Link>
          <button type="button" onClick={() => setConfirming(true)} className={`${item} text-danger`}>Delete deck</button>
        </nav>
      </Dialog>
      <ConfirmDialog
        open={confirming}
        title="Delete this deck?"
        message={`"${deck?.title}" and all of its cards will be permanently deleted, along with their review history.`}
        confirmLabel="Delete deck"
        onConfirm={remove}
        onCancel={() => { setConfirming(false); onClose(); }}
      />
    </>
  );
}
