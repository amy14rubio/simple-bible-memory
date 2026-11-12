import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCheck, FolderInput, Plus, Search, Trash2, X } from 'lucide-react';
import { useRepositories } from '../../app/repositories';
import { useAsync } from '../../app/useAsync';
import { AppBar, BackButton, ButtonLink, ConfirmDialog, EmptyState, ErrorMessage, IconButton, IconLink, Page, SearchBar } from '../../components/ui';
import { DeckPicker } from '../../components/DeckPicker';
import { useI18n } from '../../i18n/I18nProvider';
import { useRefreshOnWrites } from '../../app/useRefreshOnWrites';
import { usePopupHistory } from '../../lib/usePopupHistory';
import { deleteCardsWithUndo } from '../cards/undoDelete';
import { moveCardsWithUndo } from '../cards/undoMove';
import { MoveDrawer } from './MoveDrawer';
import { asLang } from '../study/verseLang';
import { Attribution } from '../bible/Attribution';

/** The id used in the address for "All decks": /decks/all/cards. */
export const ALL_DECKS = 'all';

const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE_PX = 10;

/**
 * "Card browse": a two-column table of verse references and passages, for one deck or for all decks.
 * Press and hold a card to select it; then tap more cards, and move or delete them together.
 */
export function CardBrowsePage() {
  const { t } = useI18n();
  const { id = '' } = useParams();
  const { decks, cards } = useRepositories();
  const navigate = useNavigate();
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [moving, setMoving] = useState(false);
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);
  const justSelected = useRef(false); // a long press ends with a click, which must not also toggle the card
  const isAll = id === ALL_DECKS;
  const { data, loading, refresh } = useAsync(async () => ({ all: await decks.list(), list: isAll ? await cards.listAll() : await cards.listByDeck(id) }), [id, isAll, decks, cards]);

  // Anything saved elsewhere (for example Undo on a toast) refreshes the list.
  useRefreshOnWrites(refresh);
  // Leaving this deck, or cards disappearing, ends the selection of what is gone.
  useEffect(() => { setSelecting(false); setSelected(new Set()); }, [id]);
  useEffect(() => {
    if (!data) return;
    const present = new Set(data.list.map((c) => c.id));
    setSelected((s) => (s.size && [...s].some((x) => !present.has(x)) ? new Set([...s].filter((x) => present.has(x))) : s));
  }, [data]);
  const stopSelecting = () => { setSelecting(false); setSelected(new Set()); };
  usePopupHistory(selecting, stopSelecting); // Back leaves selection instead of the screen

  // Selection is announced out loud and keeps focus somewhere sensible, because the controls that start and end it come and go.
  const [announce, setAnnounce] = useState('');
  const wasSelecting = useRef(false);
  useEffect(() => {
    if (selecting) {
      setAnnounce(t('browse.selectingStatus', { count: selected.size }));
      if (!wasSelecting.current) document.querySelector<HTMLInputElement>('table input[type=checkbox]:checked, table input[type=checkbox]')?.focus({ preventScroll: true });
    } else if (wasSelecting.current) {
      setAnnounce(t('browse.selectionEnded'));
      // Back to the screen's heading (not the Select button, which would pop into view and shift the list under the pointer).
      const heading = document.querySelector<HTMLElement>('main h1');
      if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
    }
    wasSelecting.current = selecting;
  }, [selecting, selected.size, t]);

  if (loading && !data) return null;
  const deck = data?.all.find((d) => d.id === id);
  if (!data || (!isAll && !deck)) return <><AppBar back={<BackButton to="/" label={t('common.backToDecks')} />} /><Page><ErrorMessage error={t('error.deckGone')} /></Page></>;

  const heading = isAll ? t('browse.headingAll') : t('browse.heading', { deck: deck!.title });
  const newCardTo = isAll ? '/cards/new' : `/cards/new?collection=${id}`; // in All decks you choose the deck inside the form
  const q = query.trim().toLowerCase();
  const lang = isAll ? undefined : asLang(deck?.bibleLanguage); // the verses' language (not known when decks are mixed)
  const shown = data.list.filter((c) => c.reference.toLowerCase().includes(q) || c.verseText.toLowerCase().includes(q));
  const ordered = data.list.filter((c) => selected.has(c.id)).map((c) => c.id); // in the order on screen
  const destinations = data.all.filter((d) => d.id !== id);

  const startSelecting = (cardId?: string) => { setSelecting(true); if (cardId) setSelected(new Set([cardId])); };
  const toggle = (cardId: string) => setSelected((s) => { const n = new Set(s); if (n.has(cardId)) n.delete(cardId); else n.add(cardId); return n; });
  const cancelPress = () => { if (press.current) { clearTimeout(press.current.timer); press.current = null; } };

  const removeSelected = async () => {
    setConfirmingDelete(false);
    const ids = ordered;
    stopSelecting();
    await deleteCardsWithUndo(cards, ids, t);
  };
  const moveSelected = async (deckId: string) => {
    setMoving(false);
    const ids = ordered;
    stopSelecting();
    await moveCardsWithUndo(cards, ids, deckId, data.all.find((d) => d.id === deckId)?.title ?? '', t);
  };

  return (
    <>
      {selecting ? (
        <AppBar
          back={<IconButton label={t('browse.exitSelect')} onClick={stopSelecting}><X size={22} aria-hidden /></IconButton>}
          title={t('browse.selected', { count: selected.size })}
          actions={
            <>
              <IconButton label={t('browse.selectAll')} onClick={() => setSelected(new Set(shown.map((c) => c.id)))}><CheckCheck size={21} aria-hidden /></IconButton>
              <IconButton label={t('browse.move')} disabled={selected.size === 0 || destinations.length === 0} onClick={() => setMoving(true)}><FolderInput size={21} aria-hidden /></IconButton>
              <IconButton label={t('browse.delete')} disabled={selected.size === 0} onClick={() => setConfirmingDelete(true)}><Trash2 size={21} aria-hidden /></IconButton>
            </>
          }
        />
      ) : searching ? (
        <SearchBar label={t('browse.search')} placeholder={t('browse.searchPlaceholder')} value={query} onChange={setQuery} backLabel={t('browse.searchClose')} onClose={() => { setSearching(false); setQuery(''); }} actions={<IconLink to={newCardTo} label={t('common.newCard')}><Plus size={22} aria-hidden /></IconLink>} />
      ) : (
        <AppBar
          back={<BackButton to="/" label={t('common.backToDecks')} />}
          titleSlot={
            <>
              <h1 className="sr-only">{heading}</h1>
              <DeckPicker label={t('browse.deck')} value={id} options={[{ value: ALL_DECKS, label: t('common.allDecks') }, ...data.all.map((d) => ({ value: d.id, label: d.title }))]} onChange={(v) => navigate(`/collections/${v}/cards`, { replace: true })} />
            </>
          }
          actions={
            <>
              <IconButton label={t('browse.search')} onClick={() => setSearching(true)}><Search size={20} aria-hidden /></IconButton>
              <IconLink to={newCardTo} label={t('common.newCard')}><Plus size={22} aria-hidden /></IconLink>
            </>
          }
        />
      )}
      <p role="status" className="sr-only">{announce}</p>
      {/* Press-and-hold is the quick way in; this is the way in for the keyboard and screen readers, so it comes first. */}
      {!selecting && data.list.length > 0 && <button type="button" onClick={() => startSelecting()} className="sr-only focus:not-sr-only focus:m-3 focus:rounded-lg focus:border focus:border-border focus:px-4 focus:py-2">{t('browse.select')}</button>}
      {data.list.length === 0 ? (
        <EmptyState title={t('browse.emptyTitle')} action={<ButtonLink to={newCardTo}>{t('common.newCard')}</ButtonLink>}>
          {isAll ? t('browse.emptyBodyAll') : t('browse.emptyBody')}
        </EmptyState>
      ) : (
        <table className="w-full table-fixed border-collapse text-left">
          <caption className="sr-only">{heading}</caption>
          <thead>
            <tr className="border-b border-border text-sm text-muted">
              {selecting && <th scope="col" className="w-14"><span className="sr-only">{t('browse.select')}</span></th>}
              <th scope="col" className={`${selecting ? 'w-[38%]' : 'w-2/5'} px-5 py-3 font-medium`}>{t('browse.verse')}</th>
              <th scope="col" className="py-3 pr-5 font-medium">{t('browse.passage')}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              // The whole row opens the card, and nothing outside the row does. The link inside is for keyboards and screen readers.
              <tr
                key={c.id}
                onClick={(e) => {
                  if (justSelected.current) { justSelected.current = false; return; }
                  if (selecting) toggle(c.id);
                  else if (!(e.target as HTMLElement).closest('a')) navigate(`/cards/${c.id}/edit`);
                }}
                onPointerDown={(e) => {
                  if (selecting || e.button > 0) return;
                  press.current = { x: e.clientX, y: e.clientY, timer: window.setTimeout(() => { press.current = null; justSelected.current = true; startSelecting(c.id); }, LONG_PRESS_MS) };
                }}
                onPointerMove={(e) => { if (press.current && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > MOVE_TOLERANCE_PX) cancelPress(); }}
                onPointerUp={() => { cancelPress(); if (justSelected.current) window.setTimeout(() => { justSelected.current = false; }, 0); }}
                onPointerCancel={cancelPress}
                onPointerLeave={cancelPress}
                onContextMenu={(e) => e.preventDefault()}
                aria-selected={selecting ? selected.has(c.id) : undefined}
                className={`cursor-pointer select-none border-b border-border [-webkit-touch-callout:none] hover:bg-surface ${selected.has(c.id) ? 'bg-surface' : ''}`}
              >
                {selecting && (
                  <td className="w-14 pl-5 align-top">
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => {}} aria-label={t('browse.selectCard', { reference: c.reference })} className="mt-4 size-5 accent-[var(--color-primary)]" />
                  </td>
                )}
                <td className="px-5 py-3.5 align-top font-serif font-medium">
                  <Link lang={lang} to={`/cards/${c.id}/edit`} onClick={(e) => { if (selecting) e.preventDefault(); }} className="block focus-visible:outline-offset-4">{c.reference}</Link>
                  {/* the translation's credit goes with the reference: the Passage column is only the passage */}
                  <Attribution code={c.translationCode} compact className="font-sans font-normal" />
                </td>
                <td className="py-3.5 pr-5 align-top"><span lang={lang} className="scripture line-clamp-2 text-[0.9375rem] leading-normal text-muted">{c.verseText}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data.list.length > 0 && shown.length === 0 && <p className="px-5 py-10 text-center text-muted">{t('browse.noMatch', { query })}</p>}
      <ConfirmDialog
        open={confirmingDelete}
        title={t('browse.deleteTitle', { count: selected.size })}
        message={t('browse.deleteBody')}
        confirmLabel={t('browse.delete')}
        onConfirm={() => void removeSelected()}
        onCancel={() => setConfirmingDelete(false)}
      />
      <MoveDrawer open={moving} count={selected.size} decks={destinations} onPick={(deckId) => void moveSelected(deckId)} onClose={() => setMoving(false)} />
    </>
  );
}
